import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Sourced } from '@/data/envelope'
import type { PlatformStatusDto } from '@/data/sdk/methods'
import { Entity } from '@/features/entity'
import { formatDuration, formatInt } from '@/lib/format'
import { Badge, Card, Hash, KeyValue, Time, stampsOf, useNow } from '@/ui'
import { platformHealth, type PlatformReason } from './platform-health'

export interface PlatformCardProps {
  status: UseQueryResult<Sourced<PlatformStatusDto>>
  /** Core's tip as DAPI reports it, from the card above. */
  coreTip: UseQueryResult<Sourced<{ height: number }>>
}

/** NX-54: what the node that answered says about Platform, with a verdict on whether blocks are arriving. */
export function PlatformCard({ status, coreTip }: PlatformCardProps) {
  const { t } = useLingui()
  const now = useNow()
  const reasonText = (reason: PlatformReason): string => {
    switch (reason.kind) {
      case 'no-block':
        return t`No new Platform block for ${formatDuration(reason.ageMs)}.`
      case 'catching-up':
        return t`The node is still catching up with the chain.`
      case 'no-peers':
        return t`The node has no peers.`
      case 'core-behind':
        return plural(reason.blocks, {
          one: "Platform's Core ChainLock is # block behind Core's tip.",
          other: "Platform's Core ChainLock is # blocks behind Core's tip.",
        })
    }
  }
  const s = status.data?.data
  const tip = coreTip.data?.data.height
  const verdict = s
    ? platformHealth({
        lastBlockMs: s.timeMs,
        catchingUp: s.catchingUp,
        peers: s.peers,
        coreChainLockedHeight: s.coreChainLockedHeight,
        coreTip: tip,
        now,
      })
    : undefined
  const badge = {
    live: { tone: 'success', label: t`Live` },
    lagging: { tone: 'warning', label: t`Lagging` },
    stalled: { tone: 'danger', label: t`Stalled` },
  } as const
  const missing = status.isError ? t`Not available right now` : '…'
  const dash = (v: string) => (v === '' ? '—' : v)

  return (
    <Card
      id="platform"
      layer="platform"
      title={t`Dash Platform`}
      subtitle={t`What the evonode that answered says about Platform right now.`}
      state={s ? 'ready' : status.isError ? 'error' : 'loading'}
      error={status.error}
      onRetry={() => void status.refetch()}
      source={stampsOf(status.data, coreTip.data)}
    >
      {verdict ? (
        <div
          data-platform-state={verdict.state}
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <Badge tone={badge[verdict.state].tone}>{badge[verdict.state].label}</Badge>
          {verdict.reasons.length === 0 ? (
            <span>{t`Blocks are arriving and Platform is locked to Core.`}</span>
          ) : (
            <ul className="flex flex-wrap gap-x-4" data-platform-reasons>
              {verdict.reasons.map((r) => (
                <li key={r.kind}>{reasonText(r)}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <KeyValue
        columns={2}
        items={[
          {
            label: t`Sync state`,
            value: s ? (
              <span data-platform="sync">{s.catchingUp ? t`Catching up` : t`Synced`}</span>
            ) : (
              missing
            ),
          },
          {
            label: t`Platform height`,
            value: s ? <span data-platform="height">{formatInt(s.height)}</span> : missing,
          },
          {
            label: t`Core chain-locked height`,
            value: s ? (
              <span data-platform="chainlocked">{formatInt(s.coreChainLockedHeight)}</span>
            ) : (
              missing
            ),
          },
          {
            label: t`Core tip`,
            value:
              tip === undefined ? (
                coreTip.isError ? (
                  t`Not available right now`
                ) : (
                  '…'
                )
              ) : (
                <span data-platform="core-tip">{formatInt(tip)}</span>
              ),
          },
          { label: t`Chain ID`, value: s ? dash(s.chainId) : missing },
          { label: t`Peers`, value: s ? formatInt(s.peers) : missing },
          {
            label: t`Last block`,
            value: s ? (
              <span data-platform="last-block">
                <Time ms={s.timeMs} mode="both" live />
              </span>
            ) : (
              missing
            ),
          },
          {
            label: t`Latest block hash`,
            value: s?.latestBlockHash ? <Hash value={s.latestBlockHash} /> : s ? '—' : missing,
          },
          {
            label: t`Answering node`,
            value: s?.nodeProTxHash ? (
              <Entity kind="evonode" id={s.nodeProTxHash} />
            ) : s ? (
              t`Not an evonode`
            ) : (
              missing
            ),
          },
          {
            label: t`Software`,
            value: s ? (
              <span data-platform="versions">
                {[
                  s.version && t`Drive ${s.version}`,
                  s.dapiVersion && t`DAPI ${s.dapiVersion}`,
                  s.tenderdashVersion && t`Tenderdash ${s.tenderdashVersion}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </span>
            ) : (
              missing
            ),
            hint: s
              ? t`Protocol: Drive ${s.driveProtocol.current} of ${s.driveProtocol.latest}, block ${s.tenderdashProtocol.block}, p2p ${s.tenderdashProtocol.p2p}`
              : undefined,
          },
        ]}
      />
    </Card>
  )
}
