import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { radarQueries } from '@/data/radar/queries'
import type { RadarMasternodeDetail, RadarPayment } from '@/data/radar/schemas'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Card, DataTable, Empty, Hash, Time } from '@/ui'
import type { MnContext } from './mn-context'
import { RadarOnly } from './RadarOnly'

const PAYMENTS_PAGE = 25

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
  const navigate = useNavigate()
  const [cursors, setCursors] = useState<(number | undefined)[]>(
    before === undefined ? [undefined] : [undefined, before],
  )
  const older = cursors.filter((c): c is number => c !== undefined)
  const pages = useQueries({
    queries: older.map((cursor) =>
      radarQueries.payments(ctx.net, ctx.protx, { before: cursor, limit: PAYMENTS_PAGE }),
    ),
  })
  const pageRows: (RadarPayment[] | undefined)[] = cursors.map((cursor) =>
    cursor === undefined ? d.payments : pages[older.indexOf(cursor)]?.data?.data,
  )
  const rows = pageRows.flatMap((p) => p ?? [])
  const lastPage = pageRows[pageRows.length - 1]
  const loadingMore = cursors.length > 1 && lastPage === undefined
  const failed = pages.at(-1)?.isError === true
  const total = d.payments_summary?.count
  const last = rows.at(-1)
  const more =
    last !== undefined &&
    lastPage !== undefined &&
    lastPage.length >= PAYMENTS_PAGE &&
    (total === undefined || rows.length < total)

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
  return (
    <Card
      title={t`Payments`}
      layer="core"
      source={radar}
      id="payments"
      subtitle={
        summary
          ? t`${formatInt(summary.count)} payments, ${formatInt(Number(summary.total_duffs / 100_000_000n))} DASH in total; indexed blocks ${formatInt(summary.indexed.from)} to ${formatInt(summary.indexed.to)}`
          : t`Radar’s payment index has not started for this node`
      }
      padding="flush"
    >
      <DataTable
        caption={t`Recent payments to this masternode`}
        columns={columns}
        rows={rows}
        getRowId={(r) => String(r.height)}
        state="ready"
        empty={<Empty kind="none-yet" title={t`No payments indexed for this masternode yet.`} />}
      />
      <div className="rx-pager" data-payments-pager>
        <span>
          {total === undefined
            ? t`${formatInt(rows.length)} shown`
            : t`${formatInt(rows.length)} of ${formatInt(total)} shown`}
        </span>
        {more ? (
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            disabled={loadingMore}
            onClick={() => {
              const cursor = last.height
              setCursors((c) => [...c, cursor])
              void navigate({
                to: '.',
                search: (s: Record<string, unknown>) => ({ ...s, before: cursor }),
                replace: true,
                resetScroll: false,
              } as never)
            }}
          >
            {loadingMore ? t`Loading…` : t`Show more`}
          </button>
        ) : null}
        {failed ? (
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            onClick={() => {
              void pages.at(-1)?.refetch()
            }}
          >
            {t`Retry`}
          </button>
        ) : null}
      </div>
      <p className="rx-card__foot">
        <span>
          {t`Paid to`} <Entity kind="address" id={d.payout_address} />
        </span>{' '}
        <Hash value={ctx.protx} display="short" copy={false} />
      </p>
    </Card>
  )
}
