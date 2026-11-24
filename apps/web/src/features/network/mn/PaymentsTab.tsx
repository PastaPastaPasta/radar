import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { radarQueries } from '@/data/radar/queries'
import type { RadarMasternodeDetail, RadarPayment } from '@/data/radar/schemas'
import { cursorPosition, Entity, ScrollList, usePageChain } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { formatAmountText } from '@/lib/units'
import { Amount, Card, DataTable, Empty, Hash, Time, useUnits, type UnitsValue } from '@/ui'
import type { MnContext } from './mn-context'
import { RadarOnly } from './RadarOnly'

const PAYMENTS_PAGE = 25

type PaymentsSummary = NonNullable<RadarMasternodeDetail['payments_summary']>

/** How many payments Radar has indexed and what they add up to, to the duff. */
export function paymentsSummary(summary: PaymentsSummary, units: UnitsValue): string {
  const total = formatAmountText(summary.total_duffs, 'duffs', {
    unit: units.unit === 'DASH' ? undefined : units.unit,
    testnet: units.testnet,
    density: 'table',
  })
  const from = formatInt(summary.indexed.from)
  const to = formatInt(summary.indexed.to)
  return plural(summary.count, {
    one: `# payment, ${total} in total; indexed blocks ${from} to ${to}`,
    other: `# payments, ${total} in total; indexed blocks ${from} to ${to}`,
  })
}

/** The payments of one masternode: the newest page comes with its record, older ones page back by block height. */
export function PaymentsTab({ ctx, before }: { ctx: MnContext; before: number | undefined }) {
  const { t } = useLingui()
  const { d, radar } = ctx
  if (!d || !radar) {
    return (
      <RadarOnly ctx={ctx} what={t`Payments need Radar’s index of this node’s block rewards`} />
    )
  }
  return <Payments ctx={ctx} d={d} radar={radar} before={before} />
}

function Payments({
  ctx,
  d,
  radar,
  before,
}: {
  ctx: MnContext
  d: RadarMasternodeDetail
  radar: SourceStamp
  before: number | undefined
}) {
  const { t } = useLingui()
  // The newest page came with the record; older ones page back by block height, and `before` opens part-way down.
  const head = useMemo(() => ({ ...radar, data: d.payments }), [radar, d.payments])
  const list = usePageChain({
    listKey: ctx.protx,
    start: before,
    head,
    query: (cursor: number | undefined) =>
      radarQueries.payments(ctx.net, ctx.protx, { before: cursor, limit: PAYMENTS_PAGE }),
    rows: (p) => p.data,
    getRowId: (r) => String(r.height),
    next: (p) => (p.data.length >= PAYMENTS_PAGE ? p.data.at(-1)?.height : undefined),
  })
  const { rows } = list
  const total = d.payments_summary?.count
  const paging = {
    ...list.paging,
    hasNext: list.paging.hasNext && (total === undefined || rows.length < total),
  }

  const columns = useMemo<ColumnDef<RadarPayment>[]>(
    () => [
      {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) => (
          <Entity
            kind="block"
            id={String(row.original.height)}
            label={formatInt(row.original.height)}
          />
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'paid',
        header: t`Paid`,
        cell: ({ row }) => <Time ms={row.original.time} mode="absolute" />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'amount',
        header: t`Amount`,
        cell: ({ row }) => <Amount value={row.original.amount_duffs} kind="duffs" />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
    ],
    [t],
  )

  const summary = d.payments_summary
  const units = useUnits()
  return (
    <Card
      title={t`Payments`}
      layer="core"
      source={radar}
      id="payments"
      subtitle={
        summary
          ? paymentsSummary(summary, units)
          : t`Radar’s payment index has not started for this node`
      }
    >
      <ScrollList chain={list} position={cursorPosition('before')}>
        <DataTable
          caption={t`Recent payments to this masternode`}
          columns={columns}
          rows={rows}
          getRowId={list.getRowId}
          state={list.state}
          error={list.error}
          onRetry={list.onRetry}
          paging={paging}
          empty={<Empty kind="none-yet" title={t`No payments indexed for this masternode yet.`} />}
        />
      </ScrollList>
      <p className="rx-card__foot">
        <span>
          {t`Paid to`} <Entity kind="address" id={d.payout_address} />
        </span>{' '}
        <Hash value={ctx.protx} display="short" copy={false} />
      </p>
    </Card>
  )
}
