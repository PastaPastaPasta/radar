import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { stampOf } from '@/data/envelope'
import { Card, Empty } from '@/ui'
import { useCensusColors, type CensusColors } from './census-colors'
import { countryLink, hostLink } from './census-links'
import { countryName, flag } from './census-format'
import { byOrg, radarScope, total, UNKNOWN, type DistRow } from './census-math'
import { Answer, SegBar, type BarPart } from './bars'
import { Ranked, useShareText, type RankedRow } from './parts'
import { SCOPE_NOUN } from './scope-text'
import { loadState, type SectionProps } from './shared'

const TOP = 3

/** The three largest named groups get a rank colour; the rest and "Unknown" the neutral grays. */
const rankColor = (colors: CensusColors, key: string, i: number): string =>
  key === UNKNOWN ? colors.unknown : i >= TOP ? colors.other : colors.rank[i]!

/** The three largest named groups, then everything else, then the nodes we could not place. */
function partsOf(
  rows: readonly { key: string; name: string; n: number }[],
  colors: CensusColors,
  names: { rest: string; unknown: string },
): BarPart[] {
  const named = rows.filter((r) => r.key !== UNKNOWN)
  const unknown = rows.find((r) => r.key === UNKNOWN)?.n ?? 0
  const left = named.slice(TOP).reduce((a, r) => a + r.n, 0)
  return [
    ...named
      .slice(0, TOP)
      .map((r, i) => ({ key: r.key, name: r.name, n: r.n, color: colors.rank[i]! })),
    ...(left > 0 ? [{ key: '~rest', name: names.rest, n: left, color: colors.other }] : []),
    ...(unknown > 0
      ? [{ key: UNKNOWN, name: names.unknown, n: unknown, color: colors.unknown }]
      : []),
  ]
}

/** The top three named groups' share of every node, Unknown included, as the bar and the rows count them. */
const topThree = (ns: readonly number[]): number => ns.slice(0, TOP).reduce((a, n) => a + n, 0)

function WhereCard({
  id,
  title,
  noun,
  summary,
  emptyTitle,
  pill,
  topShare,
  barLabel,
  parts,
  rows,
  count,
  sum,
}: {
  id: string
  title: string
  noun: string
  summary: SectionProps['summary']
  emptyTitle: string
  pill: string
  topShare: string
  barLabel: string
  parts: BarPart[]
  rows: RankedRow[]
  count: number
  sum: number
}) {
  const { t } = useLingui()
  return (
    <Card
      level="section"
      title={title}
      id={id}
      layer="network"
      subtitle={t`Share of ${noun}`}
      source={summary.data ? [stampOf(summary.data)] : []}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      {rows.length === 0 ? (
        <Empty kind="none-yet" title={emptyTitle} />
      ) : (
        <div className="grid gap-4">
          <Answer tone="neutral" pill={pill}>
            <span className="rx-nanswer__line">
              {t`Top three identified:`} <b>{topShare}</b>
            </span>
          </Answer>
          <SegBar label={barLabel} legend="none" parts={parts} />
          <Ranked rows={rows} limit={6} count={count} sum={sum} empty={t`No data yet.`} />
        </div>
      )}
    </Card>
  )
}

export function WhereCards(props: SectionProps) {
  const { t, i18n } = useLingui()
  const { scope, summary } = props
  const colors = useCensusColors()
  const share = useShareText()
  const dist = summary.data?.data.dists[radarScope(scope)] ?? {}
  const orgs = byOrg(dist.asn ?? [])
  const countries: DistRow[] = dist.country ?? []
  const sumOrgs = total(orgs.map((o) => [o.org, o.n] as const))
  const sumCountries = total(countries)
  const noun = i18n._(SCOPE_NOUN[scope])
  const listed = scope === 'mn' || scope === 'evo'
  const realOrgs = orgs.filter((o) => o.org !== UNKNOWN)
  const realCountries = countries.filter(([k]) => k !== UNKNOWN)
  const names = { rest: t`Other`, unknown: t`Unknown` }

  const hostRows: RankedRow[] = orgs.map((o) => ({
    key: o.org,
    n: o.n,
    color: rankColor(colors, o.org, realOrgs.indexOf(o)),
    title: o.asns.map((a) => `AS${a}`).join(', '),
    label:
      listed && o.org !== UNKNOWN && o.asns.length > 0 ? (
        <Link to="/masternodes" search={hostLink(o.asns, scope)}>
          {o.org}
        </Link>
      ) : o.org === UNKNOWN ? (
        t`Unknown`
      ) : (
        o.org
      ),
  }))
  const countryLabel = (code: string): string =>
    code === UNKNOWN ? t`Unknown` : `${flag(code)} ${countryName(code)}`.trim()
  const countryRows: RankedRow[] = countries.map(([code, n]) => ({
    key: code,
    n,
    color: rankColor(
      colors,
      code,
      realCountries.findIndex(([k]) => k === code),
    ),
    label:
      listed && code !== UNKNOWN ? (
        <Link to="/masternodes" search={countryLink(code, scope)}>
          {countryLabel(code)}
        </Link>
      ) : (
        countryLabel(code)
      ),
  }))

  return (
    <div className="rx-cols" data-where>
      <WhereCard
        id="hosting"
        title={t`Hosting providers`}
        noun={noun}
        summary={summary}
        emptyTitle={t`No hosting data yet.`}
        pill={plural(realOrgs.length, { one: '# provider', other: '# providers' })}
        topShare={share(topThree(realOrgs.map((o) => o.n)), sumOrgs)}
        barLabel={t`Share of ${noun} by hosting provider`}
        parts={partsOf(
          orgs.map((o) => ({ key: o.org, name: o.org, n: o.n })),
          colors,
          names,
        )}
        rows={hostRows}
        count={realOrgs.length}
        sum={sumOrgs}
      />
      <WhereCard
        id="countries"
        title={t`Countries`}
        noun={noun}
        summary={summary}
        emptyTitle={t`No location data yet.`}
        pill={plural(realCountries.length, { one: '# country', other: '# countries' })}
        topShare={share(topThree(realCountries.map(([, n]) => n)), sumCountries)}
        barLabel={t`Share of ${noun} by country`}
        parts={partsOf(
          countries.map(([code, n]) => ({ key: code, name: countryLabel(code), n })),
          colors,
          names,
        )}
        rows={countryRows}
        count={realCountries.length}
        sum={sumCountries}
      />
    </div>
  )
}
