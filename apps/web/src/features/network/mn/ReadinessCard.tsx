// The readiness texts and thresholds follow dash-nodes' masternode page (MIT, github.com/PastaPastaPasta/dash-nodes).
import { useLingui } from '@lingui/react/macro'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { Badge, Card } from '@/ui'
import {
  checkState,
  DKG_CHECK_ORDER,
  dkgRules,
  dkgRuleUrl,
  isDkgCheck,
  type CheckState,
  type DkgCheckId,
} from './mn-info'

interface Row {
  id: string
  label: string
  state: CheckState
  said: string
  fix: string | null
}

export function ReadinessCard({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { t } = useLingui()
  const r = d.dkg_readiness
  const rules = dkgRules(r?.rules)
  const port = d.service?.split(':').pop()
  const noHandshake = t`No handshake with Radar’s crawler in the past week.`
  const bit = t`service bit ${rules.filtersBit}`

  const label = (id: DkgCheckId): string => {
    switch (id) {
      case 'protocol':
        return t`Protocol version`
      case 'relay':
        return t`Transaction relay`
      case 'filters':
        return t`Compact block filters`
      case 'reachable':
        return t`Reachable`
      case 'platform_ban':
        return t`No Platform ban`
    }
  }

  /** What Radar saw and, for a failure, how to fix it. */
  const text = (id: DkgCheckId, state: CheckState): { said: string; fix: string | null } => {
    const protocol = d.protocol ?? 0
    switch (id) {
      case 'protocol':
        return state === 'pass'
          ? { said: t`Protocol ${protocol}, at least ${rules.minProtocol}.`, fix: null }
          : state === 'fail'
            ? {
                said: t`Protocol ${protocol}. Masternodes running ${rules.release} vote nodes below protocol ${rules.minProtocol} bad in DKGs.`,
                fix: t`Upgrade to ${rules.release}.`,
              }
            : { said: noHandshake, fix: null }
      case 'relay':
        return state === 'pass'
          ? { said: t`Relays transactions.`, fix: null }
          : state === 'fail'
            ? {
                said: t`Relay is off, so it won’t have the transactions it must sign InstantSend locks for.`,
                fix: t`Remove blocksonly=1 from dash.conf. ${rules.release} won’t start a masternode with it.`,
              }
            : {
                said:
                  r?.checks.filters !== 'unknown'
                    ? t`Not recorded yet; the next crawl will tell.`
                    : noHandshake,
                fix: null,
              }
      case 'filters':
        return state === 'pass'
          ? { said: t`Serves compact block filters (${bit}).`, fix: null }
          : state === 'fail'
            ? {
                said: t`Doesn’t serve compact block filters (${bit}).`,
                fix: t`Set peerblockfilters=1 and blockfilterindex=1, or remove a =0 for either. ${rules.release} won’t start a masternode without them.`,
              }
            : { said: noHandshake, fix: null }
      case 'reachable':
        return state === 'pass'
          ? {
              said:
                d.reachable === false
                  ? t`Missed Radar’s latest port check, but not ${rules.reachFailures} in a row. Core judges repeated failures, not one.`
                  : t`Answered Radar’s latest port check.`,
              fix: null,
            }
          : state === 'fail'
            ? {
                said: t`Missed ${rules.reachFailures} or more of Radar’s port checks in a row. Members vote against a masternode they fail to connect to more than ${rules.maxFailedOutbound} times.`,
                fix: port
                  ? t`Open port ${port} to inbound connections and keep the node online.`
                  : t`Keep the node online and its port open to inbound connections.`,
              }
            : { said: t`Not checked in Radar’s latest crawl.`, fix: null }
      case 'platform_ban':
        return state === 'pass'
          ? {
              said: t`Radar’s node knows of no Platform ban. Bans arrive over P2P, so it could miss one.`,
              fix: null,
            }
          : state === 'fail'
            ? {
                said: t`Platform has PoSe-banned this evonode.`,
                fix: t`Fix its Platform services, then send a ProUpServTx (protx update_service) to lift the ban.`,
              }
            : { said: t`Radar’s node hasn’t said yet.`, fix: null }
    }
  }

  const rows = useMemo<Row[]>(
    () =>
      DKG_CHECK_ORDER.flatMap((id) => {
        const value = r?.checks[id]
        if (value === undefined) return []
        const state = checkState(value)
        return [{ id, label: label(id), state, ...text(id, state) }]
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the texts depend on the record and the locale only
    [d, r, t],
  )
  const extra = Object.entries(r?.checks ?? {}).filter(([id]) => !isDkgCheck(id))

  if (!r) return null
  const overall = checkState(r.overall)
  const failing = rows.filter((x) => x.state === 'fail').length
  return (
    <Card
      title={t`Ready for ${rules.release} quorums?`}
      layer="network"
      source={stamp}
      id="readiness"
      subtitle={
        overall === 'pass'
          ? t`Passes every check Radar can see.`
          : overall === 'unknown'
            ? t`Nothing fails, but Radar can’t see every check yet.`
            : t`Fails ${failing} of ${rows.length} checks. Quorum members vote against masternodes that fail these in DKGs, which costs PoSe score.`
      }
      actions={
        <Badge tone={overall === 'pass' ? 'success' : overall === 'fail' ? 'danger' : 'neutral'}>
          {overall === 'pass' ? t`Ready` : overall === 'fail' ? t`Not ready` : t`Unknown`}
        </Badge>
      }
      padding="flush"
    >
      <ul aria-label={t`Quorum readiness checks`} className="grid" data-readiness>
        {rows.map((row) => (
          <li
            key={row.id}
            data-check={row.id}
            data-state={row.state}
            className="grid gap-1 border-b border-[var(--dh-line)] px-4 py-3 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{row.label}</span>
              <Badge
                tone={
                  row.state === 'pass' ? 'success' : row.state === 'fail' ? 'danger' : 'neutral'
                }
              >
                {row.state === 'pass' ? t`Pass` : row.state === 'fail' ? t`Fail` : t`Unknown`}
              </Badge>
            </div>
            <p className="rx-dim rx-sm">{row.said}</p>
            {row.fix ? (
              <p className="rx-sm">
                <span className="rx-dim">{t`Fix`}:</span> {row.fix}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {extra.length > 0 ? (
        <ul className="rx-checks px-4 pt-2">
          {extra.map(([id, value]) => (
            <li key={id} data-check={id} data-state={checkState(value)}>
              {id} <span className="rx-dim rx-sm">{value}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="rx-card__foot rx-dim rx-sm">
        {t`When a DKG starts, each quorum member votes against members it can’t reach or that fail these checks. A node is left out only once about three quarters of a quorum vote it bad.`}{' '}
        <a href={dkgRuleUrl(rules)} target="_blank" rel="noopener noreferrer" data-rule>
          {t`The rule in Dash Core ${rules.coreCommit}`}
        </a>
      </p>
    </Card>
  )
}
