import { Trans, useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import type { HyRichRow } from '@/data/hyphen/schemas'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Amount, Card, Chart, DataTable, Empty, SourceLine, Stat, useMediaQuery } from '@/ui'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { firstPageStamp, infiniteTableProps } from '../hy-shared/infinite-list'
import { PageFrame } from '../hy-shared/PageFrame'
import { concentration, shareOf } from './concentration'
import { concentrationOption } from './chart-option'
import { RichListCompact } from './RichListCompact'
import { richListQueries } from './queries'
import { useShareBasis, type ShareBasis as Basis } from './share-basis'

const SUMMARY_ID = 'concentration'

/** Which total the shares on the page are of, and where it comes from. */
function ShareBasis({
  basis,
  height,
  style,
  short = false,
}: {
  basis: Basis
  height: number | undefined
  style?: React.CSSProperties
  /** One line with the full explanation behind a tap, for a phone. */
  short?: boolean
}) {
  if (basis.kind === 'loading') return null
  if (basis.kind === 'balances' && (basis.total === undefined || height === undefined)) return null
  const circulating = basis.kind === 'circulating'
  const block = formatInt(height ?? 0)
  const total = basis.total
  const headline = circulating ? (
    <Trans>
      Shares are of the circulating supply, <Amount value={total!} kind="duffs" compact />, the
      figure the Charts page shows.
    </Trans>
  ) : (
    <Trans>The circulating supply isn’t available, so shares are of address balances.</Trans>
  )
  const detail = circulating ? (
    <SourceLine stamp={basis.stamp} compact />
  ) : (
    <Trans>
      The <Amount value={total!} kind="duffs" compact /> held in positive address balances at block{' '}
      {block}.
    </Trans>
  )
  if (short) {
    return (
      <details className="rx-note rx-sharebasis" data-share-basis={basis.kind}>
        <summary>{headline}</summary>
        <p className="m-0 mt-1">{detail}</p>
      </details>
    )
  }
  return (
    <p className="rx-note" data-share-basis={basis.kind} style={style}>
      {headline} {detail}
    </p>
  )
}

export function RichListPage() {
  const { t } = useLingui()
  return (
    <PageFrame path="/rich-list" title={t`Rich list`} lede={t`The largest Core balances, ranked.`}>
      <HyphenGate>
        <RichListContent />
      </HyphenGate>
    </PageFrame>
  )
}

function RichListContent() {
  const { t } = useLingui()
  const net = useNetwork()
  const list = useInfiniteQuery(richListQueries.rows(net))
  const top = useQuery(richListQueries.top(net))

  const phone = useMediaQuery('(max-width: 640px)')
  const table = infiniteTableProps(list)
  const firstPageSource = firstPageStamp(list)
  const first = list.data?.pages[0]?.data
  const basis = useShareBasis(net, top.data?.data.includedSupply)
  const total = basis.kind === 'loading' ? undefined : basis.total
  const ofSupply = basis.kind !== 'balances'
  const bands = useMemo(
    () => (total === undefined ? [] : concentration(top.data?.data.items ?? [], total)),
    [top.data, total],
  )
  const shareHeader = ofSupply ? t`% of supply` : t`% of address balances`
  const shareName = ofSupply ? t`Share of supply` : t`Share of address balances`

  const columns = useMemo<ColumnDef<HyRichRow>[]>(
    () => [
      {
        id: 'rank',
        header: t`Rank`,
        cell: ({ row }) => formatInt(row.original.rank),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'address',
        header: t`Address`,
        cell: ({ row }) => <Entity kind="address" id={row.original.address} />,
        meta: { phone: 'title' },
      },
      {
        id: 'balance',
        header: t`Balance`,
        cell: ({ row }) => <Amount value={row.original.balance} kind="duffs" fiat />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'share',
        header: shareHeader,
        cell: ({ row }) =>
          total === undefined ? '—' : formatPercent(shareOf(row.original.balance, total), 2),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'received',
        header: t`Received`,
        cell: ({ row }) => <Amount value={row.original.totalReceived} kind="duffs" compact />,
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'sent',
        header: t`Sent`,
        cell: ({ row }) => <Amount value={row.original.totalSent} kind="duffs" compact />,
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'txs',
        header: t`Transactions`,
        cell: ({ row }) => formatInt(row.original.txCount),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
    ],
    [t, shareHeader, total],
  )

  const option = concentrationOption({
    labels: bands.map((b) => t`Top ${b.id}`),
    shares: bands.map((b) => b.share),
    name: shareName,
    phone,
  })

  return (
    <>
      <StaleIndexNotice />
      <Card
        title={t`Supply concentration`}
        subtitle={
          ofSupply
            ? t`Share of the supply held by each rank band`
            : t`Share of address balances held by each rank band`
        }
        layer="core"
        id={SUMMARY_ID}
        source={top.data ? stampOf(top.data) : undefined}
        state={top.isError ? 'error' : 'ready'}
        error={top.error}
        onRetry={() => void top.refetch()}
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-4" data-rich-summary>
            <Stat
              label={t`Addresses with a balance`}
              value={first?.positiveBalanceCount ? formatInt(first.positiveBalanceCount) : '—'}
            />
            <Stat
              label={t`Held by the top 10`}
              value={
                top.data && total !== undefined
                  ? formatPercent(
                      bands.slice(0, 3).reduce((s, b) => s + b.share, 0),
                      1,
                    )
                  : '—'
              }
            />
            <Stat
              label={t`Held by the top 100`}
              value={
                top.data && total !== undefined
                  ? formatPercent(
                      bands.reduce((s, b) => s + b.share, 0),
                      1,
                    )
                  : '—'
              }
            />
          </div>
          <ShareBasis basis={basis} height={top.data?.data.asOfHeight} short={phone} />
          <Chart
            option={option}
            height={phone ? 180 : 240}
            label={
              ofSupply
                ? t`Share of the supply held by the top addresses, by rank band`
                : t`Share of address balances held by the top addresses, by rank band`
            }
            loading={top.isPending}
            table={{
              columns: [t`Rank band`, shareName],
              rows: bands.map((b) => [b.id, formatPercent(b.share, 2)]),
            }}
          />
        </div>
      </Card>
      <Card
        title={t`Largest balances`}
        subtitle={
          first?.total === undefined ? undefined : t`${formatInt(first.total)} addresses ranked`
        }
        layer="core"
        padding="flush"
        source={firstPageSource}
      >
        {phone ? null : (
          <ShareBasis
            basis={basis}
            height={first?.asOfHeight}
            style={{ margin: 0, padding: '12px 16px 4px' }}
          />
        )}
        {phone ? (
          <RichListCompact
            {...table}
            total={total}
            source={firstPageSource}
            summaryId={SUMMARY_ID}
          />
        ) : (
          <DataTable
            caption={t`Addresses ranked by balance`}
            columns={columns}
            {...table}
            getRowId={(r) => r.address}
            empty={<Empty kind="none-yet" title={t`No balances indexed yet.`} />}
            rowLink={(r) => ({ to: '/address/$address', params: { address: r.address } })}
          />
        )}
      </Card>
    </>
  )
}
