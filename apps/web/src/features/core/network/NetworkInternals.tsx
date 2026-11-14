import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { hyQueries } from '@/data/hyphen/queries'
import type { HyNetwork } from '@/data/hyphen/schemas'
import { useNetwork } from '@/features/entity'
import { formatBytes, formatInt, formatNumber, formatPercent } from '@/lib/format'
import { Amount, Badge, Card, Chart, DataTable, Meter, Stat, Time, useUnits } from '@/ui'
import { seriesVar, useSeriesSlots } from '@/ui/series'
import { buildOption, formatHashrate, METRICS, points, type MetricId } from '../charts/options'
import { Difficulty } from '../hy-shared/Difficulty'
import { cardState } from '../hy-shared/infinite-list'
import { coreVersion, velocity, versionCounts } from './versions'

const HISTORY = { blocks: 144, points: 48 } as const

type Peer = HyNetwork['peerInfo'][number]

/** The colour a masternode status draws in: a state, so a status colour and never a palette slot. */
const STATUS_COLOR: Record<string, string> = {
  valid: 'var(--dh-good)',
  banned: 'var(--dh-bad)',
}
const OTHER_COLOR = 'var(--dh-ink-3)'

interface Part {
  id: string
  count: number
  color: string
}

/** One bar split by share, with the key under it: what each part is, and how many. */
function ShareBar({ parts, of }: { parts: Part[]; of?: (count: number) => string }) {
  const say = (p: Part) => `${p.id}: ${of ? of(p.count) : formatInt(p.count)}`
  return (
    <div data-share-bar>
      <div className="rx-stack" role="img" aria-label={parts.map(say).join(', ')}>
        {parts.map((p) => (
          <i key={p.id} style={{ flex: p.count, background: p.color, minWidth: 4 }} />
        ))}
      </div>
      <ul className="rx-legend">
        {parts.map((p) => (
          <li key={p.id} data-part={p.id}>
            <span className="rx-sw" style={{ background: p.color }} />
            {p.id} <b>{of ? of(p.count) : formatInt(p.count)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Hyphen's view of the chain and of the node it indexes from (HY-12). */
export function NetworkInternals() {
  const { t } = useLingui()
  const net = useNetwork()
  const network = useQuery(hyQueries.network(net))
  const latest = useQuery(hyQueries.metricsLatest(net))
  const mempool = useQuery(hyQueries.mempool(net))
  const history = useQuery(hyQueries.metricsChart(net, HISTORY))

  const n = network.data?.data
  const l = latest.data?.data
  const m = mempool.data?.data
  const rows = history.data?.data.value ?? []
  const pace = velocity(rows)
  const versions = useMemo(() => versionCounts(n?.peerInfo ?? []), [n])
  const slotOf = useSeriesSlots(versions.map((v) => v.version))
  const units = useUnits()
  const plot = (id: MetricId, title: string, label: string, height: number) => {
    const data = points(METRICS[id], rows)
    return (
      <Chart
        option={buildOption(METRICS[id], data, title, units)}
        height={height}
        label={label}
        loading={history.isPending}
        table={{
          columns: [t`Block height`, title],
          rows: data.map((p) => [formatInt(p.height), METRICS[id].format(p.value, units)]),
        }}
      />
    )
  }

  const peerColumns = useMemo<ColumnDef<Peer>[]>(
    () => [
      {
        id: 'addr',
        header: t`Peer`,
        cell: ({ row }) => <span className="rx-mono">{row.original.addr}</span>,
        meta: { phone: 'title' },
      },
      {
        id: 'version',
        header: t`Core version`,
        cell: ({ row }) => coreVersion(row.original.subversion),
        meta: { phone: 'secondary' },
      },
      {
        id: 'direction',
        header: t`Direction`,
        cell: ({ row }) => <Badge>{row.original.inbound ? t`Inbound` : t`Outbound`}</Badge>,
        meta: { phone: 'secondary' },
      },
      {
        id: 'height',
        header: t`Height when connected`,
        cell: ({ row }) =>
          row.original.startingHeight == null ? '—' : formatInt(row.original.startingHeight),
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
    ],
    [t],
  )

  const usage = m?.usageBytes != null && m.maxBytes ? m.usageBytes / m.maxBytes : undefined

  return (
    <>
      <Card
        title={t`Chain state`}
        layer="core"
        source={latest.data ? stampOf(latest.data) : undefined}
        state={cardState(latest)}
        error={latest.error}
        onRetry={() => void latest.refetch()}
        id="chainstate"
      >
        <div
          className="rx-statgrid grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4"
          data-internals-chain
        >
          <Stat label={t`Chain size`} value={l ? formatBytes(l.blockchainSize) : '—'} />
          <Stat label={t`Spendable outputs`} value={l ? formatInt(l.utxosSpendable) : '—'} />
          <Stat label={t`Unspendable outputs`} value={l ? formatInt(l.utxosUnspendable) : '—'} />
          <Stat label={t`Transactions, all time`} value={l ? formatInt(l.txCount) : '—'} />
          <Stat label={t`Hash rate`} value={l ? formatHashrate(l.hashrate) : '—'} />
          <Stat label={t`Difficulty`} value={l ? <Difficulty value={l.difficulty} /> : '—'} />
          <Stat
            label={t`Circulating supply`}
            value={l ? <Amount value={l.circulatingSupply} kind="duffs" compact /> : '—'}
          />
          <Stat
            label={t`Credit pool`}
            value={
              l?.creditPoolBalance != null ? (
                <Amount value={l.creditPoolBalance} kind="duffs" compact />
              ) : (
                '—'
              )
            }
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={t`Mempool pressure`}
          layer="core"
          source={mempool.data ? stampOf(mempool.data) : undefined}
          state={cardState(mempool)}
          error={mempool.error}
          onRetry={() => void mempool.refetch()}
          id="mempool-pressure"
        >
          <div className="grid gap-4">
            <div className="rx-statgrid grid grid-cols-2 gap-2 sm:gap-4">
              <Stat label={t`Transactions waiting`} value={m ? formatInt(m.count) : '—'} />
              <Stat label={t`Their size`} value={m ? formatBytes(m.totalBytes) : '—'} />
            </div>
            {usage !== undefined && m?.maxBytes ? (
              <Meter
                value={usage}
                max={1}
                label={t`Memory in use of ${formatBytes(m.maxBytes)}`}
                format={(v) => formatPercent(v, 2)}
              />
            ) : null}
            {m ? (
              <p className="text-sm">
                {t`Updated`} <Time ms={m.updatedAt} live />
              </p>
            ) : null}
          </div>
        </Card>
        <Card
          title={t`Transaction velocity`}
          subtitle={t`Last ${formatInt(HISTORY.blocks)} blocks`}
          layer="core"
          source={history.data ? stampOf(history.data) : undefined}
          state={cardState(history)}
          error={history.error}
          onRetry={() => void history.refetch()}
          id="velocity"
        >
          <div className="grid gap-4">
            <Stat
              label={t`Transactions per block`}
              value={pace ? formatNumber(pace.perBlock, { maximumFractionDigits: 1 }) : '—'}
            />
            <div data-internals-plot="transactions">
              {plot(
                'transactions',
                t`Transactions`,
                t`Transactions per bucket over the last ${formatInt(HISTORY.blocks)} blocks`,
                150,
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card
        title={t`Metrics history`}
        subtitle={t`Last ${formatInt(HISTORY.blocks)} blocks`}
        layer="core"
        source={history.data ? stampOf(history.data) : undefined}
        id="history"
      >
        <div className="grid gap-6 lg:grid-cols-3" data-internals-history>
          <div className="grid min-w-0 gap-1" data-internals-plot="hashrate">
            <h3 className="rx-plot__title">{t`Hash rate`}</h3>
            {plot(
              'hashrate',
              t`Hash rate`,
              t`Hash rate over the last ${formatInt(HISTORY.blocks)} blocks`,
              190,
            )}
          </div>
          <div className="grid min-w-0 gap-1" data-internals-plot="difficulty">
            <h3 className="rx-plot__title">{t`Difficulty`}</h3>
            {plot(
              'difficulty',
              t`Difficulty`,
              t`Difficulty over the last ${formatInt(HISTORY.blocks)} blocks`,
              190,
            )}
          </div>
          <div className="grid min-w-0 gap-1" data-internals-plot="utxos">
            <h3 className="rx-plot__title">{t`Spendable outputs`}</h3>
            {plot(
              'utxos',
              t`Spendable outputs`,
              t`Spendable outputs over the last ${formatInt(HISTORY.blocks)} blocks`,
              190,
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={t`Masternodes by status`}
          layer="network"
          source={network.data ? stampOf(network.data) : undefined}
          state={cardState(network)}
          error={network.error}
          onRetry={() => void network.refetch()}
          id="masternodes"
        >
          {n ? (
            <div className="grid gap-4 sm:grid-cols-2" data-internals-masternodes>
              {(['regular', 'evonode'] as const).map((kind) => (
                <div key={kind} className="grid gap-2">
                  <Stat
                    label={kind === 'regular' ? t`Regular masternodes` : t`Evonodes`}
                    value={formatInt(n.validators[kind].total)}
                  />
                  <ShareBar
                    parts={Object.entries(n.validators[kind].status)
                      .sort((a, b) => b[1] - a[1])
                      .map(([status, count]) => ({
                        id: status,
                        count,
                        color: STATUS_COLOR[status] ?? OTHER_COLOR,
                      }))}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </Card>
        <Card
          title={t`Core versions`}
          subtitle={t`Among the peers of the indexing node`}
          layer="network"
          source={network.data ? stampOf(network.data) : undefined}
          id="versions"
        >
          <div data-internals-versions>
            {versions.length > 0 ? (
              <ShareBar
                parts={versions.map((v) => {
                  const slot = slotOf(v.version)
                  return {
                    id: v.version,
                    count: v.count,
                    color: slot === undefined ? OTHER_COLOR : seriesVar(slot),
                  }
                })}
                of={(c) => t`${formatInt(c)} of ${formatInt(n?.peerInfo.length ?? 0)} peers`}
              />
            ) : null}
          </div>
        </Card>
      </div>

      <Card
        title={t`Peers of the indexing node`}
        subtitle={
          n
            ? t`${formatInt(n.peerCount)} connections · ${n.networkInfo.subversion} · protocol ${formatInt(n.networkInfo.protocolVersion)}`
            : undefined
        }
        layer="network"
        source={network.data ? stampOf(network.data) : undefined}
        id="peers"
      >
        <DataTable
          caption={t`Peers of the node Hyphen indexes from`}
          columns={peerColumns}
          rows={n?.peerInfo ?? []}
          getRowId={(p) => String(p.id)}
          state={
            network.isPending
              ? 'loading'
              : network.isError
                ? 'error'
                : n?.peerInfo.length
                  ? 'ready'
                  : 'empty'
          }
          error={network.error}
          onRetry={() => void network.refetch()}
        />
      </Card>
    </>
  )
}
