import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivationDeployment } from '@/data/radar/schemas'
import { formatInt, formatPercent } from '@/lib/format'
import { Badge, Card, DataTable } from '@/ui'
import { InfoTip } from './InfoTip'
import { pct, pinAt } from './v24-format'
import type { PoolRow } from './v24-math'

interface Segment {
  key: string
  name: string
  blocks: number
  on: boolean
}

/** Each pool's signalling blocks, then its blocks that didn't signal: a pool that signals for some is in both. */
function segmentsOf(pools: readonly PoolRow[], untagged: string): Segment[] {
  const name = (r: PoolRow) => r.pool ?? untagged
  const yes = pools
    .filter((r) => r.signalling > 0)
    .map((r) => ({ key: `y:${name(r)}`, name: name(r), blocks: r.signalling, on: true }))
  const no = pools
    .filter((r) => r.blocks > r.signalling)
    .map((r) => ({
      key: `n:${name(r)}`,
      name: name(r),
      blocks: r.blocks - r.signalling,
      on: false,
    }))
    .sort((a, b) => b.blocks - a.blocks)
  return [...yes, ...no]
}

/** Which pools' blocks in the window signal, by the tag in each coinbase. Shown only while the window counts. */
export function PoolsSection({ d, stamp }: { d: RadarActivationDeployment; stamp: SourceStamp }) {
  const { t } = useLingui()
  const w = d.window
  const pools = d.state === 'started' ? w?.pools : undefined
  const mined = w?.mined ?? 0
  const columns = useMemo<ColumnDef<PoolRow>[]>(
    () => [
      {
        id: 'pool',
        header: t`Pool`,
        cell: ({ row: { original: r } }) => r.pool ?? t`Untagged`,
        meta: { phone: 'title' },
      },
      {
        id: 'blocks',
        header: t`Blocks`,
        cell: ({ row: { original: r } }) => (
          <>
            <b>{formatInt(r.blocks)}</b>{' '}
            <small className="text-[var(--dh-ink-2)]">{pct(r.blocks, mined)}</small>
          </>
        ),
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'status',
        header: t`Signalling`,
        cell: ({ row: { original: r } }) =>
          r.signalling === r.blocks ? (
            <Badge tone="success" size="sm">{t`yes`}</Badge>
          ) : r.signalling === 0 ? (
            <Badge tone="warning" size="sm">{t`no`}</Badge>
          ) : (
            <Badge size="sm">{t`${formatInt(r.signalling)} of ${formatInt(r.blocks)}`}</Badge>
          ),
        meta: { phone: 'secondary' },
      },
    ],
    [t, mined],
  )
  if (!w || !pools || pools.length === 0 || mined <= 0) return null
  const segments = segmentsOf(pools, t`Untagged`)
  const blocker = segments.find((s) => !s.on)
  const yes = segments.filter((s) => s.on).reduce((a, s) => a + s.blocks, 0)
  const needed = w.threshold == null ? undefined : w.threshold / d.params.window
  const say = (s: Segment) =>
    s.on
      ? t`${s.name}: ${pct(s.blocks, mined)}, signalling`
      : t`${s.name}: ${pct(s.blocks, mined)}, not signalling`
  return (
    <Card
      level="section"
      title={t`Pools signalling`}
      id="pools"
      layer="network"
      subtitle={
        <>
          {t`This window's ${formatInt(mined)} blocks by pool.`}{' '}
          <InfoTip label={t`About the pool tags`}>
            <p className="m-0">
              {t`Who mined this window's ${formatInt(mined)} blocks and how many of them signalled. Best effort: we go by the tag in each block's coinbase, which is whatever the miner wrote, and some blocks carry none.`}
            </p>
          </InfoTip>
        </>
      }
      source={stamp}
    >
      <div className="grid gap-4">
        <figure className="rx-v24-wbar" data-v24-pool-bar>
          <div
            className="rx-v24-bar"
            role="img"
            aria-label={`${t`Share of this window's blocks by pool`}: ${segments.map(say).join('; ')}`}
          >
            {needed !== undefined ? (
              <span className="rx-v24-bar__mlabel" style={pinAt(needed)} aria-hidden="true">
                {t({ message: `${formatPercent(needed, 0)} needed`, context: 'share of blocks' })}
              </span>
            ) : null}
            <div className="rx-v24-pools" aria-hidden="true">
              {segments.map((s) => (
                <span
                  key={s.key}
                  className={s.on ? 'rx-v24-yes' : 'rx-v24-no'}
                  style={{ flexGrow: s.blocks }}
                  title={say(s)}
                  data-pool={s.name}
                  data-blocker={s === blocker || undefined}
                >
                  <span className="rx-v24-seg">
                    <span className="rx-v24-seg__name">{s.name}</span>{' '}
                    <span>{pct(s.blocks, mined)}</span>
                    {s === blocker ? (
                      <span className="rx-v24-seg__not"> · {t`not signalling`}</span>
                    ) : null}
                  </span>
                </span>
              ))}
            </div>
            {needed !== undefined ? (
              <b
                className="rx-v24-bar__mark rx-v24-bar__mark--tick"
                style={{ left: `${needed * 100}%` }}
                aria-hidden="true"
              />
            ) : null}
          </div>
          <ul className="rx-legend" aria-hidden="true">
            <li>
              <span className="rx-sw rx-v24-yes" />
              {t`Signalling`} <b>{pct(yes, mined)}</b>
            </li>
            <li>
              <span className="rx-sw rx-v24-no" />
              {t`Not signalling`} <b>{pct(mined - yes, mined)}</b>
            </li>
          </ul>
        </figure>
        <DataTable
          caption={t`Blocks and signalling blocks per pool this window`}
          columns={columns}
          rows={pools}
          getRowId={(r) => r.pool ?? ''}
          state="ready"
        />
      </div>
    </Card>
  )
}
