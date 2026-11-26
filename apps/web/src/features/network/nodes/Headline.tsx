import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { stampOf } from '@/data/envelope'
import { formatInt, formatPercent } from '@/lib/format'
import { Card } from '@/ui'
import { Answer, SegBar, shareTone } from './bars'
import { useCensusColors } from './census-colors'
import { reachableLink, unreachableLink } from './census-links'
import { byOrg, countOf, reachShare, UNKNOWN } from './census-math'
import { FigureGrid, FigureLink } from './parts'
import { loadState, type SectionProps } from './shared'

/**
 * The enabled masternodes as one bar (answered, silent), each part opening the list it counts, beside the figures that
 * open the lists and sections behind them.
 */
export function Headline({ versions, days, summary }: SectionProps) {
  const { t } = useLingui()
  const colors = useCensusColors()
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
        <div className="rx-nhead" data-census-headline>
          <div className="grid min-w-0 gap-3">
            <Answer
              tone={share === undefined ? 'neutral' : shareTone(share)}
              pill={
                share === undefined
                  ? t`Masternodes`
                  : t`${formatPercent(share, 1)} of enabled answered`
              }
            >
              <span className="rx-nanswer__line">
                {diff === undefined ? null : (
                  <span data-census-delta>
                    {diff === 0
                      ? t`same as a day ago`
                      : diff > 0
                        ? plural(diff, {
                            one: '# more answering than a day ago',
                            other: '# more answering than a day ago',
                          })
                        : plural(-diff, {
                            one: '# fewer answering than a day ago',
                            other: '# fewer answering than a day ago',
                          })}
                    {' · '}
                  </span>
                )}
                {t`counted at block ${formatInt(crawl.tip_height)}`}
              </span>
            </Answer>
            <SegBar
              inline={false}
              label={t`Enabled masternodes`}
              parts={[
                {
                  key: 'answered',
                  name: t`Answered`,
                  n: answered,
                  color: colors.good,
                  link: { to: '/masternodes', search: reachableLink() },
                },
                {
                  key: 'silent',
                  name: t`Didn't answer`,
                  n: silent,
                  color: colors.bad,
                  link: { to: '/masternodes', search: unreachableLink('mn') },
                },
              ]}
            />
          </div>
          <FigureGrid tight>
            <FigureLink
              to="/masternodes"
              search={{ status: ['enabled'] }}
              label={t`Enabled`}
              value={formatInt(crawl.mn_total)}
            />
            <FigureLink
              to="/masternodes"
              search={{ type: ['evo'], status: ['enabled'] }}
              label={t`Evonodes`}
              value={formatInt(evo)}
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
              hash="reach"
              label={t`Addresses tried`}
              value={formatInt(crawl.tried)}
              note={t`last crawl`}
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
          </FigureGrid>
        </div>
      ) : null}
    </Card>
  )
}
