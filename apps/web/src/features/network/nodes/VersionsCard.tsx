import { useLingui } from '@lingui/react/macro'
import { useMemo } from 'react'
import { formatInt } from '@/lib/format'
import { Card, Chart, Empty, SegFilter, Skeleton, stampsOf, useNow } from '@/ui'
import { stackedShareOption, type Series, type Slice } from './census-charts'
import { useCensusColors, type CensusColors } from './census-colors'
import { dayMonth, dayMonthYear, monthYear } from './census-format'
import { CENSUS_DAYS, type Census } from './census-data'
import {
  fraction,
  isCoreVersion,
  keepVersions,
  ladderGroups,
  radarScope,
  releaseBook,
  stackShares,
  total,
  UNKNOWN,
  versionOf,
  type LadderRow,
  type ReleaseBook,
} from './census-math'
import { Donut, ScrollRegion, useShareText } from './parts'
import { SCOPE_NOUN } from './scope-text'
import { loadState, useCensusSearch, type SectionProps } from './shared'

/** A version's colour: the latest release in the layer hue and each older one a step lighter. */
function versionColor(
  book: ReleaseBook,
  colors: CensusColors,
  key: string,
  folded?: number,
): string {
  if (key === UNKNOWN) return colors.axis
  if (folded !== undefined || !isCoreVersion(key)) return colors.other
  const status = book.status(key)
  if (status === 'candidate') return colors.good
  if (status === 'build') return colors.warn
  const rank = book.known ? book.finals.indexOf(key) : 0
  return colors.rank[Math.min(Math.max(rank, 0), colors.rank.length - 1)]!
}

export function VersionsCard({
  scope,
  versions,
  days,
  summary,
  census,
}: SectionProps & { census: Census }) {
  const { t, i18n } = useLingui()
  const setSearch = useCensusSearch()
  const now = useNow()
  const colors = useCensusColors()
  const share = useShareText()
  const book = useMemo(() => releaseBook(census.releases.data?.data), [census.releases.data])
  const dist = summary.data?.data.dists[radarScope(scope)] ?? {}
  const rows = dist.version ?? []
  const named = rows.filter(([k]) => k !== UNKNOWN)
  const unknown = rows.find(([k]) => k === UNKNOWN)?.[1] ?? 0
  const sum = total(rows)
  const noun = i18n._(SCOPE_NOUN[scope])
  const groups = ladderGroups(book, named, sum)
  const latest = book.finals[0]
  const latestRow = groups
    .flatMap((g) => g.rows)
    .find((r) => r.key === latest && r.folded === undefined)

  const groupLabel = {
    0: t`Releases`,
    1: t`Release candidates`,
    2: t`Builds that aren't releases`,
    3: t`Other clients`,
  }
  const note = (r: LadderRow): string => {
    if (r.folded !== undefined || !isCoreVersion(r.key) || !book.known) return ''
    const status = book.status(r.key)
    if (status === 'candidate') return t`release candidate`
    if (status === 'build') return t`not a release`
    if (r.key === latest) return t`latest release`
    const at = book.published(r.key)
    return at === undefined ? '' : monthYear(at)
  }
  const label = (r: LadderRow, group: 0 | 1 | 2 | 3): string =>
    r.folded === undefined
      ? r.key
      : group === 3
        ? t`${formatInt(r.folded)} other clients`
        : book.known
          ? t`${formatInt(r.folded)} other releases`
          : t`${formatInt(r.folded)} more versions`

  const flat = groups.flatMap((g) => g.rows.map((r) => ({ ...r, group: g.kind })))
  const slices: Slice[] = [
    ...flat
      .filter((r) => r.n > 0)
      .map((r) => ({
        name: label(r, r.group),
        value: r.n,
        color: versionColor(book, colors, r.key, r.folded),
      })),
    ...(unknown > 0 ? [{ name: t`No answer this week`, value: unknown, color: colors.axis }] : []),
  ]

  const top = named[0]
  const second = named[1]
  const lede = top
    ? second
      ? t`${top[0]} runs on ${share(top[1], sum)} of ${noun} and ${second[0]} on ${share(second[1], sum)}.`
      : t`${top[0]} runs on ${share(top[1], sum)} of ${noun}.`
    : t`No ${noun} have told us their version yet.`

  const ua = dist.ua ?? []
  const uaTotal = total(ua)
  const proto = (dist.protocol ?? []).filter(([k]) => k !== UNKNOWN)
  const protoTotal = total(proto)
  const overTime = versions === 'time'
  const history = census.versions.data?.data
  const series: Series[] = useMemo(() => {
    if (!history) return []
    const narrowed = keepVersions(history, 6, latest)
    return stackShares(narrowed, book).map((s) => ({
      key: s.key,
      name: s.key === UNKNOWN ? t`No answer this week` : s.key,
      color: versionColor(book, colors, s.key, undefined),
      values: s.values,
    }))
  }, [history, book, colors, latest, t])

  return (
    <Card
      title={t`What they run`}
      id="versions"
      className="min-w-0 [&_.dh-seg]:max-w-full [&_.dh-seg]:overflow-x-auto"
      layer="network"
      subtitle={lede}
      source={stampsOf(
        summary.data,
        census.releases.data,
        overTime ? census.versions.data : undefined,
      )}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
      actions={
        <SegFilter
          label={t`Versions view`}
          value={versions}
          options={[
            { id: 'now', label: t`Now` },
            { id: 'time', label: t`Over time` },
          ]}
          onChange={(v) => {
            setSearch({ versions: v === 'time' ? 'time' : 'now' })
          }}
        />
      }
    >
      <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
        {overTime ? (
          <div
            className="grid gap-3 [&_.dh-seg]:max-w-full [&_.dh-seg]:overflow-x-auto"
            data-versions-view="time"
          >
            <SegFilter
              label={t`Time range`}
              value={days}
              options={CENSUS_DAYS.map((d) => ({
                id: d,
                label: { '1': t`24 h`, '7': t`7 d`, '30': t`30 d`, '90': t`90 d`, '365': t`1 y` }[
                  d
                ],
              }))}
              onChange={(d) => {
                const picked = CENSUS_DAYS.find((r) => r === d)
                if (picked) setSearch({ days: picked })
              }}
            />
            {census.versions.isError ? (
              <Empty kind="blocked" title={t`The version history didn't load.`} />
            ) : history ? (
              <Chart
                option={stackedShareOption(history, series)}
                height={240}
                label={t`Version share over time`}
                table={{
                  columns: [
                    t`Version`,
                    dayMonth(history.t[0]!),
                    dayMonth(history.t[history.t.length - 1]!),
                  ],
                  rows: series.map((s) => [
                    s.name,
                    formatInt(Math.round(s.values[0] ?? 0)),
                    formatInt(Math.round(s.values[history.t.length - 1] ?? 0)),
                  ]),
                }}
              />
            ) : (
              <Skeleton shape="chart" height={240} />
            )}
            {history &&
            history.t.length >= 2 &&
            history.t[0]! > now - Number(days) * 86_400_000 + 86_400_000 ? (
              <p className="text-sm text-[var(--dh-ink-2)]">
                {t`Our history starts ${dayMonthYear(history.t[0]!)}, so this range shows less than it asks for.`}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            className="grid gap-6 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]"
            data-versions-view="now"
          >
            {slices.length > 0 ? (
              <Donut
                slices={slices}
                label={t`Share of ${noun} by version`}
                surface={colors.surface}
                center={
                  latestRow
                    ? { value: share(latestRow.n, sum), caption: t`latest release` }
                    : undefined
                }
              />
            ) : (
              <Empty kind="none-yet" title={t`No ${noun} have told us their version yet.`} />
            )}
            <LadderTable
              groups={groups.map((g) => ({
                title: groupLabel[g.kind],
                rows: g.rows.map((r) => ({
                  key: r.key,
                  label: label(r, g.kind),
                  note: note(r),
                  n: r.n,
                  color: versionColor(book, colors, r.key, r.folded),
                })),
              }))}
              unknown={unknown}
              sum={sum}
              colors={colors}
            />
          </div>
        )}
        {proto.length > 0 ? (
          <p className="text-sm text-[var(--dh-ink-2)]" data-protocols>
            {t`Protocol`}{' '}
            {proto.map(([k, n]) => `${k} ${t`on`} ${share(n, protoTotal)}`).join(', ')}.
          </p>
        ) : null}
        {ua.length > 0 ? (
          <details className="rx-details" data-every-version>
            <summary>{t`Every version and user agent`}</summary>
            <ScrollRegion label={t`Every version and user agent`}>
              <table className="dh-table dh-table--compact">
                <caption className="dh-sr">{t`Every version and user agent`}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t`Version`}</th>
                    <th scope="col">{t`User agent`}</th>
                    <th scope="col">{t`Client`}</th>
                    <th scope="col" className="text-right">
                      {t`Nodes`}
                    </th>
                    <th scope="col" className="text-right">
                      {t`Share`}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ua.map(([k, n]) => {
                    const version = k === UNKNOWN ? UNKNOWN : versionOf(k)
                    return (
                      <tr key={k}>
                        <td>{k === UNKNOWN ? t`Unknown` : version}</td>
                        <td>
                          {k === UNKNOWN ? (
                            <span className="text-[var(--dh-ink-2)]">{t`no answer this week`}</span>
                          ) : (
                            <code>{k || t`(empty)`}</code>
                          )}
                        </td>
                        <td>
                          {k === UNKNOWN ? '—' : isCoreVersion(version) ? t`Dash Core` : t`Other`}
                        </td>
                        <td className="text-right tabular-nums">{formatInt(n)}</td>
                        <td className="text-right tabular-nums">{share(n, uaTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollRegion>
          </details>
        ) : null}
      </div>
    </Card>
  )
}

interface LadderView {
  title: string
  rows: { key: string; label: string; note: string; n: number; color: string }[]
}

function LadderTable({
  groups,
  unknown,
  sum,
  colors,
}: {
  groups: LadderView[]
  unknown: number
  sum: number
  colors: CensusColors
}) {
  const { t } = useLingui()
  const share = useShareText()
  return (
    <ScrollRegion label={t`Release ladder`}>
      <table className="dh-table dh-table--compact" data-ladder>
        <caption className="dh-sr">{t`Release ladder`}</caption>
        <thead>
          <tr>
            <th scope="col">{t`Version`}</th>
            <td aria-hidden="true" />
            <th scope="col" className="text-right">
              {t`Share`}
            </th>
            <th scope="col" className="text-right">
              {t`Nodes`}
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.title}>
            <tr>
              <th
                colSpan={4}
                scope="rowgroup"
                className="text-left text-xs uppercase tracking-wide text-[var(--dh-ink-2)]"
              >
                {g.title}
              </th>
            </tr>
            {g.rows.map(({ key, ...r }) => (
              <LadderLine key={`${key}-${r.label}`} {...r} sum={sum} share={share} />
            ))}
          </tbody>
        ))}
        {unknown > 0 ? (
          <tbody>
            <LadderLine
              label={t`No answer this week`}
              note=""
              n={unknown}
              color={colors.axis}
              sum={sum}
              share={share}
            />
          </tbody>
        ) : null}
      </table>
    </ScrollRegion>
  )
}

function LadderLine({
  label,
  note,
  n,
  color,
  sum,
  share,
}: {
  label: string
  note: string
  n: number
  color: string
  sum: number
  share: (n: number, sum: number) => string
}) {
  return (
    <tr data-version-row>
      <th scope="row" className="font-normal">
        {label}
        {note ? <small className="ml-1 text-[var(--dh-ink-2)]">{note}</small> : null}
      </th>
      <td aria-hidden="true" className="w-1/4">
        <i
          className="block h-2 rounded"
          style={{ width: `${String(fraction(n, sum) * 100)}%`, background: color }}
        />
      </td>
      <td className="text-right tabular-nums">{share(n, sum)}</td>
      <td className="text-right tabular-nums">{formatInt(n)}</td>
    </tr>
  )
}
