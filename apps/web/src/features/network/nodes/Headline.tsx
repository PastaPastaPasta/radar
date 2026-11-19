import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { stampOf } from '@/data/envelope'
import { formatInt, formatPercent } from '@/lib/format'
import { Card } from '@/ui'
import { reachableLink } from './census-links'
import { byOrg, countOf, reachShare, UNKNOWN } from './census-math'
import { FigureGrid, FigureLink } from './parts'
import { loadState, type SectionProps } from './shared'

/** The six headline figures: each opens the list or the section that shows that many items. */
export function Headline({ versions, days, summary }: SectionProps) {
  const { t } = useLingui()
  const crawl = summary.data?.data.crawl
  const dayAgo = summary.data?.data.day_ago
  const all = summary.data?.data.dists.all ?? {}
  const mn = summary.data?.data.dists.mn ?? {}
  const diff = crawl && dayAgo ? crawl.mn_reachable - dayAgo.mn_reachable : undefined
  const evo = countOf(mn.type ?? [], 'Evo')
  const banned = countOf(mn.status ?? [], 'pose_banned')
  const { yes: answered, no: silent } = reachShare(mn.reachable)
  const share = answered + silent > 0 ? answered / (answered + silent) : undefined
  const countries = (all.country ?? []).filter(([k]) => k !== UNKNOWN).length
  const providers = byOrg(all.asn ?? []).filter((h) => h.org !== UNKNOWN).length
  // These three count every node, not only masternodes: the sections they open switch to "All nodes" to match.
  const whole = { scope: 'all' as const, versions, days }

  return (
    <Card
      id="now"
      layer="network"
      source={summary.data ? stampOf(summary.data) : undefined}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      {crawl ? (
        <div className="grid gap-4" data-census-headline>
          <p className="text-sm text-[var(--dh-ink-2)] [&_a]:underline">
            {diff === undefined ? null : (
              <span data-census-delta>
                {diff === 0
                  ? t`as many masternodes answering as a day ago`
                  : diff > 0
                    ? plural(diff, {
                        one: '# more masternode answering than a day ago',
                        other: '# more masternodes answering than a day ago',
                      })
                    : plural(-diff, {
                        one: '# fewer masternode answering than a day ago',
                        other: '# fewer masternodes answering than a day ago',
                      })}
                {' · '}
              </span>
            )}
            {t`counted at block ${formatInt(crawl.tip_height)}`}
          </p>
          <FigureGrid columns={6}>
            <FigureLink
              to="/masternodes"
              search={reachableLink()}
              label={t`Reachable masternodes`}
              value={formatInt(crawl.mn_reachable)}
              note={
                share === undefined ? undefined : t`${formatPercent(share, 1)} of enabled answered`
              }
              tone={
                share === undefined
                  ? undefined
                  : share >= 0.98
                    ? 'good'
                    : share >= 0.9
                      ? 'warn'
                      : 'bad'
              }
            />
            <FigureLink
              to="/masternodes"
              search={{ status: ['enabled'] }}
              label={t`Enabled`}
              value={formatInt(crawl.mn_total)}
              note={evo > 0 ? t`${formatInt(evo)} of them evonodes` : undefined}
            />
            <FigureLink
              to="/masternodes"
              search={{ status: ['pose-banned'] }}
              label={t`PoSe-banned`}
              value={formatInt(banned)}
            />
            <FigureLink
              to="/nodes"
              search={whole}
              hash="countries"
              label={t`Countries`}
              value={formatInt(countries)}
              note={t`all nodes`}
            />
            <FigureLink
              to="/nodes"
              search={whole}
              hash="hosting"
              label={t`Hosting providers`}
              value={formatInt(providers)}
              note={t`all nodes`}
            />
            <FigureLink
              to="/nodes"
              search={whole}
              hash="reach"
              label={t`Addresses tried`}
              value={formatInt(crawl.tried)}
            />
          </FigureGrid>
        </div>
      ) : null}
    </Card>
  )
}
