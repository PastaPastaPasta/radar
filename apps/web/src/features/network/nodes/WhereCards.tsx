import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { stampOf } from '@/data/envelope'
import { Card, Empty } from '@/ui'
import type { Slice } from './census-charts'
import { useCensusColors, type CensusColors } from './census-colors'
import { countryName, flag } from './census-format'
import { byOrg, radarScope, total, UNKNOWN, type DistRow } from './census-math'
import { Donut, Ranked, useShareText, type RankedRow } from './parts'
import { SCOPE_NOUN } from './scope-text'
import { loadState, type SectionProps } from './shared'

const TOP = 5

/** The five largest groups get a rank colour; the rest and "Unknown" the neutral grays. */
const rankColor = (colors: CensusColors, key: string, i: number): string =>
  key === UNKNOWN ? colors.axis : i >= TOP ? colors.other : colors.rank[i]!

function slicesOf(
  rows: readonly { key: string; name: string; n: number }[],
  colors: CensusColors,
  rest: string,
): Slice[] {
  const top = rows.slice(0, TOP)
  const left = rows.slice(TOP).reduce((a, r) => a + r.n, 0)
  return [
    ...top.map((r, i) => ({ name: r.name, value: r.n, color: rankColor(colors, r.key, i) })),
    ...(left > 0 ? [{ name: rest, value: left, color: colors.other }] : []),
  ]
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
  const type = scope === 'evo' ? { type: ['evo' as const] } : {}
  const realOrgs = orgs.filter((o) => o.org !== UNKNOWN)
  const realCountries = countries.filter(([k]) => k !== UNKNOWN)
  const o0 = realOrgs[0]
  const c0 = realCountries[0]
  const source = summary.data ? [stampOf(summary.data)] : []
  const rest = t`Everything else`

  const hostRows: RankedRow[] = orgs.map((o, i) => ({
    key: o.org,
    n: o.n,
    color: rankColor(colors, o.org, i),
    title: o.asns.map((a) => `AS${a}`).join(', '),
    label:
      listed && o.org !== UNKNOWN && o.asns.length > 0 ? (
        <Link to="/masternodes" search={{ host: o.asns, ...type }}>
          {o.org}
        </Link>
      ) : o.org === UNKNOWN ? (
        t`Unknown`
      ) : (
        o.org
      ),
  }))
  const countryLabel = (code: string): ReactNode =>
    code === UNKNOWN ? t`Unknown` : `${flag(code)} ${countryName(code)}`.trim()
  const countryRows: RankedRow[] = countries.map(([code, n], i) => ({
    key: code,
    n,
    color: rankColor(colors, code, i),
    label:
      listed && code !== UNKNOWN ? (
        <Link to="/masternodes" search={{ country: [code], ...type }}>
          {countryLabel(code)}
        </Link>
      ) : (
        countryLabel(code)
      ),
  }))

  const lede = o0
    ? t`${o0.org} hosts ${share(o0.n, sumOrgs)} of ${noun}, and the three largest providers host ${share(
        realOrgs.slice(0, 3).reduce((a, o) => a + o.n, 0),
        sumOrgs,
      )}.`
    : undefined

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-where>
      <Card
        title={t`Hosting providers`}
        id="hosting"
        layer="network"
        subtitle={lede}
        source={source}
        state={loadState(summary)}
        error={summary.error}
        onRetry={() => void summary.refetch()}
      >
        {orgs.length === 0 ? (
          <Empty kind="none-yet" title={t`No hosting data yet.`} />
        ) : (
          <div className="grid gap-4">
            <Donut
              slices={slicesOf(
                orgs.map((o) => ({
                  key: o.org,
                  name: o.org === UNKNOWN ? t`Unknown` : o.org,
                  n: o.n,
                })),
                colors,
                rest,
              )}
              label={t`Share of ${noun} by hosting provider`}
              surface={colors.surface}
              center={{ value: String(realOrgs.length), caption: t`providers` }}
            />
            <Ranked rows={hostRows} sum={sumOrgs} empty={t`No data yet.`} />
          </div>
        )}
      </Card>
      <Card
        title={t`Countries`}
        id="countries"
        layer="network"
        subtitle={
          c0 ? t`${countryName(c0[0])} alone has ${share(c0[1], sumCountries)}.` : undefined
        }
        source={source}
        state={loadState(summary)}
        error={summary.error}
        onRetry={() => void summary.refetch()}
      >
        {countries.length === 0 ? (
          <Empty kind="none-yet" title={t`No location data yet.`} />
        ) : (
          <div className="grid gap-4">
            <Donut
              slices={slicesOf(
                countries.map(([code, n]) => ({
                  key: code,
                  name: code === UNKNOWN ? t`Unknown` : countryName(code),
                  n,
                })),
                colors,
                rest,
              )}
              label={t`Share of ${noun} by country`}
              surface={colors.surface}
              center={{ value: String(realCountries.length), caption: t`countries` }}
            />
            <Ranked rows={countryRows} sum={sumCountries} empty={t`No data yet.`} />
          </div>
        )}
      </Card>
    </div>
  )
}
