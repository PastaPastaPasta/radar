import { useLingui } from '@lingui/react/macro'
import { useNow } from '@/ui'
import { Card, ErrorState, LiveDot, SourceLine } from '@/ui'
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

export function SourcesCard({ rows, probes }: SourcesCardProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const now = useNow(true)
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
          return (
            <li
              key={source}
              data-source-row={source}
              data-state={offered ? health.state : 'unsupported'}
              className="grid gap-1 border-b border-[var(--dh-line)] py-3 last:border-b-0 md:grid-cols-[minmax(0,14rem)_8rem_minmax(0,1fr)]"
            >
              <div>
                <strong>{name}</strong>
                <p className="text-[var(--dh-ink-2)]">{role}</p>
              </div>
              <div className="flex items-start">
                {offered ? (
                  <LiveDot state={health.state} />
                ) : (
                  <span className="text-[var(--dh-ink-2)]">{t`Not offered`}</span>
                )}
              </div>
              <div className="grid gap-1">
                {offered ? (
                  <>
                    <p>{describeHealth(health, now)}</p>
                    {health.p50LatencyMs !== undefined ? (
                      <p className="text-[var(--dh-ink-2)]">{medianText(health.p50LatencyMs)}</p>
                    ) : null}
                    {facts ? (
                      <p className="text-[var(--dh-ink-2)]">
                        {facts.report} <SourceLine stamp={facts.stamp} compact />
                      </p>
                    ) : null}
                    {probeError && health.state !== 'down' ? (
                      <ErrorState error={probeError} source={source} compact />
                    ) : null}
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
