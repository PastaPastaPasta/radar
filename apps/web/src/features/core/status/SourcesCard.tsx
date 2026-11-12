import { useLingui } from '@lingui/react/macro'
import { Card, ErrorState, LiveDot, SourceLine, useMediaQuery, useNow } from '@/ui'
import { stampOf } from '@/data/envelope'
import { useNetwork } from '@/features/entity'
import type { Probes } from './probes'
import {
  describeHealth,
  hyphenFacts,
  medianText,
  peFacts,
  radarFacts,
  SOURCE_ROLE,
  type ProbeFacts,
} from './source-detail'
import type { SourceRow } from './source-rows'

export interface SourcesCardProps {
  rows: SourceRow[]
  probes: Probes
}

function probeFacts(
  source: string,
  probes: Probes,
  net: string,
  now: number,
  behind: boolean,
): ProbeFacts | undefined {
  if (source === 'radar' && probes.radar.data) {
    const status = probes.radar.data.data.networks[net === 'testnet' ? 'testnet' : 'mainnet']
    return radarFacts(status, stampOf(probes.radar.data), now)
  }
  if (source === 'pe' && probes.pe.data)
    return peFacts(probes.pe.data.data, stampOf(probes.pe.data))
  if (source === 'hyphen' && probes.hyphen.data) {
    return hyphenFacts(probes.hyphen.data.data, stampOf(probes.hyphen.data), behind)
  }
  return undefined
}

const ATTENTION = new Set(['down', 'stale', 'degraded', 'slow'])

export function SourcesCard({ rows, probes }: SourcesCardProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const now = useNow(true)
  const phone = useMediaQuery('(max-width: 640px)')
  return (
    <Card
      id="sources"
      title={t`Sources`}
      subtitle={t`How each source is answering, and how far behind its data is.`}
    >
      <ul className="grid gap-0" aria-label={t`Sources`}>
        {rows.map(({ source, offered, health }) => {
          const { name, role } = SOURCE_ROLE[source]()
          const facts = probeFacts(source, probes, net, now, health.state === 'stale')
          const probeError =
            source === 'radar' || source === 'pe' || source === 'hyphen'
              ? probes[source].error
              : undefined
          const state = offered ? (
            <LiveDot state={health.state} />
          ) : (
            <span className="text-[var(--dh-ink-2)]">{t`Not offered`}</span>
          )
          const lag = <p data-source-lag>{describeHealth(health, now)}</p>
          const sync = facts ? (
            <p data-source-sync className="text-[var(--dh-ink-2)]">
              {facts.report} <SourceLine stamp={facts.stamp} compact />
            </p>
          ) : null
          const probeFailure =
            probeError && health.state !== 'down' ? (
              <ErrorState error={probeError} source={source} compact />
            ) : null
          const latency =
            health.p50LatencyMs !== undefined ? medianText(health.p50LatencyMs) : undefined
          const rowProps = {
            'data-source-row': source,
            'data-state': offered ? health.state : 'unsupported',
          }
          if (phone) {
            return (
              <li
                key={source}
                {...rowProps}
                className="grid gap-1 border-b border-[var(--dh-line)] py-3 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong>{name}</strong>
                  {state}
                </div>
                {offered ? (
                  <>
                    {lag}
                    {sync}
                    <details open={ATTENTION.has(health.state)} data-source-details>
                      <summary className="cursor-pointer">{latency ?? t`Details`}</summary>
                      <div className="mt-1 grid gap-1">
                        <p className="text-[var(--dh-ink-2)]">{role}</p>
                        {probeFailure}
                      </div>
                    </details>
                  </>
                ) : (
                  <p className="text-[var(--dh-ink-2)]">{role}</p>
                )}
              </li>
            )
          }
          return (
            <li
              key={source}
              {...rowProps}
              className="grid gap-1 border-b border-[var(--dh-line)] py-3 last:border-b-0 md:grid-cols-[minmax(0,14rem)_8rem_minmax(0,1fr)]"
            >
              <div>
                <strong>{name}</strong>
                <p className="text-[var(--dh-ink-2)]">{role}</p>
              </div>
              <div className="flex items-start">{state}</div>
              <div className="grid gap-1">
                {offered ? (
                  <>
                    {lag}
                    {sync}
                    {latency ? <p className="text-[var(--dh-ink-2)]">{latency}</p> : null}
                    {probeFailure}
                  </>
                ) : (
                  <p className="text-[var(--dh-ink-2)]">
                    {t`This network doesn’t have this source.`}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
