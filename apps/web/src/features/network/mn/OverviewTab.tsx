import { useLingui } from '@lingui/react/macro'
import { useMemo, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { Entity } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Amount, Card, Hash, KeyValue, Stat, Stats, Time } from '@/ui'
import type { MnContext } from './mn-context'
import {
  anyDiffers,
  crawlDiffers,
  heightOrNull,
  isEvonode,
  parseOutpoint,
  poseState,
  uptimeSummary,
  type Differing,
} from './mn-info'
import { RadarOnly } from './RadarOnly'
import { ReadinessCard } from './ReadinessCard'
import { UptimeCard } from './UptimeCard'

export function OverviewTab({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const { d, radar } = ctx
  return (
    <>
      {d && radar ? <Kpis d={d} stamp={radar} /> : null}
      <div className="rx-split">
        <div className="grid gap-5">
          {d && radar ? (
            <UptimeCard daily={d.uptime_daily} stamp={radar} />
          ) : (
            <RadarOnly
              ctx={ctx}
              what={t`Uptime, payments and readiness need Radar’s crawl of this node`}
            />
          )}
        </div>
        <aside className="grid gap-5" aria-label={t`Facts`}>
          <RegistrationCard ctx={ctx} />
          {d && radar ? <ReadinessCard d={d} stamp={radar} /> : null}
        </aside>
      </div>
    </>
  )
}

function Kpis({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { t } = useLingui()
  const up = useMemo(() => uptimeSummary(d.uptime_daily, 30), [d.uptime_daily])
  const lastPaid = d.payments.find((p) => p.height === d.last_paid_height)
  const paid90 = d.returns?.paid_90d
  const window = d.returns?.window_days ?? 90
  return (
    <Stats data-masternode-kpis>
      <Stat
        label={t`Uptime, 30 days`}
        value={up ? formatPercent(up.ratio, up.ratio === 1 ? 0 : 1) : '—'}
        note={
          up
            ? t`answered ${formatInt(up.ok)} of ${formatInt(up.attempts)} checks in ${up.days} days`
            : t`Radar has no checks for this node yet`
        }
        layer="network"
        source={stamp}
      />
      <Stat
        label={t`Last paid`}
        value={lastPaid ? <Time ms={lastPaid.time} /> : '—'}
        note={
          heightOrNull(d.last_paid_height) === null ? (
            t`not paid yet`
          ) : (
            <>
              {t`block`}{' '}
              <Entity
                kind="block"
                id={String(d.last_paid_height)}
                label={formatInt(d.last_paid_height)}
              />
            </>
          )
        }
        layer="core"
        source={stamp}
      />
      <Stat
        label={t`Earned on Core, ${window} days`}
        value={
          paid90 === undefined || paid90 === null ? (
            '—'
          ) : (
            <Amount value={paid90} kind="duffs" fiat />
          )
        }
        note={
          d.payments_summary
            ? t`${formatInt(d.payments_summary.count)} payments indexed in total`
            : undefined
        }
        layer="core"
        source={stamp}
      />
      <Stat
        label={t`PoSe penalty`}
        value={formatInt(d.pose_penalty)}
        note={
          heightOrNull(d.pose_ban_height) === null
            ? t`never banned`
            : t`banned at block ${formatInt(d.pose_ban_height)}`
        }
        layer="network"
        source={stamp}
      />
    </Stats>
  )
}

interface Item {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
}

function RegistrationCard({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const { d, f, radar, dapi } = ctx
  const diff: Differing | null = d && f ? crawlDiffers(d, f) : null
  const stamps = [dapi, radar].filter((s): s is SourceStamp => s !== null)

  /** The hint on a row DAPI answered: it says so, and what Radar's last crawl held where it differs. */
  const dapiHint = (differs: boolean, crawl?: ReactNode): ReactNode =>
    differs ? (
      <>
        {t`Listed by DAPI`} · {t`Radar’s last crawl differs`}
        {crawl ? <> ({crawl})</> : null}
      </>
    ) : (
      t`Listed by DAPI`
    )
  const short = (v: string) => <Hash value={v} display="short" head={10} tail={6} copy={false} />

  const items: Item[] = []
  if (f) {
    items.push(
      {
        label: t`On the list`,
        value: f.valid ? t`Valid` : t`Not valid`,
        hint: dapiHint(
          diff?.valid ?? false,
          d ? (d.status === 'enabled' ? t`Valid` : t`Not valid`) : undefined,
        ),
      },
      {
        label: t`Type`,
        value: f.type === 'Evo' ? t`Evonode` : t`Regular masternode`,
        hint: dapiHint(
          diff?.type ?? false,
          d ? (d.type === 'Evo' ? t`Evonode` : t`Regular masternode`) : undefined,
        ),
      },
      {
        label: t`Service`,
        value: <span className="rx-mono">{f.service}</span>,
        hint: dapiHint(diff?.service ?? false, d?.service ?? undefined),
      },
      {
        label: t`Voting`,
        value: <Entity kind="address" id={f.votingAddress} />,
        hint: dapiHint(
          diff?.voting ?? false,
          d?.voting_address ? <Entity kind="address" id={d.voting_address} /> : undefined,
        ),
      },
      {
        label: t`Operator key`,
        value: <Hash value={f.pubKeyOperator} display="short" head={10} tail={6} />,
        hint: dapiHint(diff?.operator ?? false, d ? short(d.pubkey_operator) : undefined),
      },
    )
    if (f.type === 'Evo') {
      const https = f.platformHttpPort ? t`HTTPS ${f.platformHttpPort}` : null
      const p2p = f.platformP2pPort ? t`P2P ${f.platformP2pPort}` : null
      items.push({
        label: t`Platform ports`,
        value: [https, p2p].filter(Boolean).join(' · ') || '—',
        hint: t`Listed by DAPI`,
      })
      if (f.platformNodeId) {
        items.push({
          label: t`Platform node`,
          value: <Hash value={f.platformNodeId} display="short" head={8} tail={6} />,
          hint: dapiHint(diff?.nodeId ?? false, d?.platform_node_id ?? undefined),
        })
      }
    }
  }
  if (d) {
    const collateral = parseOutpoint(d.collateral)
    items.push(
      { label: t`Payout`, value: <Entity kind="address" id={d.payout_address} /> },
      { label: t`Owner`, value: <Entity kind="address" id={d.owner_address} /> },
    )
    if (!f) {
      items.push(
        {
          label: t`Voting`,
          value: d.voting_address ? <Entity kind="address" id={d.voting_address} /> : '—',
          hint: d.voting_address === d.owner_address ? t`Same as the owner address` : undefined,
        },
        {
          label: t`Operator key`,
          value: <Hash value={d.pubkey_operator} display="short" head={10} tail={6} />,
        },
      )
    }
    if (d.operator_reward > 0) {
      items.push({
        label: t`Operator reward`,
        value: formatPercent(d.operator_reward / 10000, 2),
      })
    }
    if (d.operator_payout_address) {
      items.push({
        label: t`Operator payout`,
        value: <Entity kind="address" id={d.operator_payout_address} />,
      })
    }
    const banned = heightOrNull(d.pose_ban_height)
    const revived = heightOrNull(d.pose_revived_height)
    items.push(
      {
        label: t`Collateral`,
        value: collateral ? (
          <Entity
            kind="tx"
            id={collateral.txid}
            label={`${collateral.txid.slice(0, 8)}…:${collateral.index}`}
          />
        ) : (
          <Hash value={d.collateral} display="short" />
        ),
        hint: isEvonode(d) ? t`Evonode collateral` : t`Masternode collateral`,
      },
      {
        label: t`Registered`,
        value: (
          <Entity
            kind="block"
            id={String(d.registered_height)}
            label={formatInt(d.registered_height)}
          />
        ),
        hint: t`Block ${formatInt(d.registered_height)}`,
      },
      {
        label: t`PoSe`,
        value:
          poseState(d) === 'banned'
            ? t`Banned`
            : d.pose_penalty > 0
              ? t`Penalty ${formatInt(d.pose_penalty)}`
              : t`No penalty`,
        hint:
          [
            banned === null ? null : t`Banned at block ${formatInt(banned)}`,
            revived === null ? null : t`Revived at block ${formatInt(revived)}`,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      },
    )
    if (!f && d.platform_node_id) {
      items.push({
        label: t`Platform node`,
        value: <Hash value={d.platform_node_id} display="short" head={8} tail={6} />,
      })
    }
  }
  if (items.length === 0) return null
  return (
    <Card
      title={t`Registration`}
      layer="network"
      source={stamps}
      id="registration"
      subtitle={
        diff && anyDiffers(diff) ? t`DAPI’s list wins where Radar’s last crawl differs.` : undefined
      }
    >
      <KeyValue items={items} />
    </Card>
  )
}
