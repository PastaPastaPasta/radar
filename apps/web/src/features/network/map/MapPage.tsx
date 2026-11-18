import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, type ReactNode } from 'react'
import { stampOf, type Sourced } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { mnHostLabels } from '@/data/masternodes/facets'
import { filterMnRows, type MnFilter } from '@/data/masternodes/filter'
import { joinMnRows, type MnRow } from '@/data/masternodes/rows'
import { staleAfterMs } from '@/data/query/stale'
import { radarQueries } from '@/data/radar/queries'
import { PageFrame, useNetwork } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { isDevnet, type NetworkId } from '@/lib/network'
import {
  Empty,
  ErrorState,
  SearchField,
  SegFilter,
  Skeleton,
  Time,
  Unavailable,
  useMediaQuery,
  useNow,
} from '@/ui'
import { useSectionSource } from '@/ui/section-source'
import { staleAgeMs } from '@/ui/source-labels'
import { projectWorld } from '@/ui/world-map'
import { useDebouncedQuery } from '../debounced-query'
import { filterFields } from '../masternodes/filter-fields'
import { countryName, flag } from '../nodes/census-format'
import { fraction, isTiny } from '../nodes/census-math'
import { Notice } from '../nodes/parts'
import { legacyFilter } from './legacy-url'
import {
  concentrationsOfNodes,
  concentrationsOfRows,
  findPlace,
  isNarrowed,
  placeOfRow,
  placesOfGeo,
  placesOfRows,
  populationFilter,
  scopeChange,
  scopeOf,
  type Concentrations,
  type Place,
  type Scope,
  type Share,
} from './map-model'
import { NodeCard } from './NodeCard'
import { PlaceList } from './PlaceList'
import { PlaceMap } from './PlaceMap'
import { inBox, regionBox } from './regions'
import { ShareBar } from './ShareBar'
import { useMapSearch, type MapSearchControls } from './use-map-search'
import './map.css'

const PHONE = '(max-width: 640px)'

/** "Falkenstein, Germany". */
export function placeText(p: Pick<Place, 'city' | 'country'>): string {
  const country = p.country ? countryName(p.country) : undefined
  return [p.city, country === p.city ? undefined : country].filter(Boolean).join(', ')
}

function useShare(total: number): (n: number) => string {
  const { t } = useLingui()
  return (n) => (isTiny(n, total) ? t`<0.1%` : formatPercent(fraction(n, total), 1))
}

interface Board {
  scope: Scope
  narrowed: boolean
  /** Masternode rows, all of them (mn and evo scopes). */
  rows: MnRow[]
  /** The masternodes the page counts. */
  members: MnRow[]
  places: Place[]
  conc: Concentrations | undefined
  /** PoSe-banned masternodes the default leaves out. */
  bannedOut: number
  unplaced: number
  query: UseQueryResult<Sourced<unknown>>
  /** The summary, read for every reachable node's countries and providers. */
  summary: UseQueryResult<Sourced<unknown>> | undefined
  loading: boolean
  tip: number | undefined
}

function useBoard(net: NetworkId, controls: MapSearchControls, enabled: boolean): Board {
  const { search, filter, set } = controls
  const scope = scopeOf(search)
  const nodes = scope === 'nodes'
  const mnQ = useQuery({ ...radarQueries.masternodes(net), enabled: enabled && !nodes })
  const geoQ = useQuery({ ...radarQueries.geo(net), enabled: enabled && nodes })
  const sumQ = useQuery({ ...radarQueries.summary(net), enabled: enabled && nodes })

  const rows = useMemo(
    () => (mnQ.data ? (joinMnRows(mnQ.data, undefined)?.data.rows ?? []) : []),
    [mnQ.data],
  )

  // A link from the old map: its colouring's hidden categories become the filter they meant.
  const legacy = search.color !== undefined || search.hide !== undefined
  useEffect(() => {
    if (!legacy || (!nodes && rows.length === 0 && !mnQ.isError)) return
    const meant = nodes
      ? filter
      : legacyFilter(rows, filter, search.color ?? 'reach', search.hide ?? [])
    set({ ...meant, color: undefined, hide: undefined })
  }, [legacy, nodes, rows, filter, search.color, search.hide, set, mnQ.isError])

  const population = useMemo(() => populationFilter(filter), [filter])
  const members = useMemo(() => filterMnRows(rows, population), [rows, population])
  const bannedOut = useMemo(
    () =>
      filter.status || nodes
        ? 0
        : filterMnRows(rows, { ...filter, status: ['pose-banned'] }).length,
    [rows, filter, nodes],
  )
  const places = useMemo(
    () => (nodes ? (geoQ.data ? placesOfGeo(geoQ.data.data) : []) : placesOfRows(members)),
    [nodes, geoQ.data, members],
  )
  const conc = useMemo(() => {
    if (nodes)
      return geoQ.data
        ? concentrationsOfNodes(places, geoQ.data.data.unlocated, sumQ.data?.data)
        : undefined
    return mnQ.data ? concentrationsOfRows(members, places) : undefined
  }, [nodes, geoQ.data, sumQ.data, mnQ.data, members, places])

  return {
    scope,
    narrowed: !nodes && isNarrowed(filter),
    rows,
    members,
    places,
    conc,
    bannedOut,
    unplaced: nodes ? (geoQ.data?.data.unlocated ?? 0) : (conc?.city.unknown ?? 0),
    query: nodes ? geoQ : mnQ,
    summary: nodes ? sumQ : undefined,
    loading: enabled && (nodes ? geoQ.isPending : mnQ.isPending),
    tip: mnQ.data?.height,
  }
}

/** The page's claim: how few cities hold half of what it counts. */
function useClaim(b: Board): string | undefined {
  const { t } = useLingui()
  const c = b.conc?.city
  if (!c || c.total === 0 || c.toHalf === undefined) return undefined
  const total = formatInt(c.total)
  const k = c.toHalf
  if (k === 1) {
    const top = b.places[0]!
    const pct = formatPercent(fraction(top.n, c.total), 0)
    const where = placeText(top)
    if (b.narrowed) return t`${pct} of these ${total} masternodes run in one city, ${where}`
    if (b.scope === 'evo') return t`${pct} of the ${total} evonodes run in one city, ${where}`
    if (b.scope === 'nodes')
      return t`${pct} of the ${total} reachable nodes run in one city, ${where}`
    return t`${pct} of the ${total} masternodes run in one city, ${where}`
  }
  if (b.narrowed)
    return plural(k, {
      one: `Half of these ${total} masternodes run in # city`,
      other: `Half of these ${total} masternodes run in # cities`,
    })
  if (b.scope === 'evo')
    return plural(k, {
      one: `Half of the ${total} evonodes run in # city`,
      other: `Half of the ${total} evonodes run in # cities`,
    })
  if (b.scope === 'nodes')
    return plural(k, {
      one: `Half of the ${total} reachable nodes run in # city`,
      other: `Half of the ${total} reachable nodes run in # cities`,
    })
  return plural(k, {
    one: `Half of the ${total} masternodes run in # city`,
    other: `Half of the ${total} masternodes run in # cities`,
  })
}

/** The rest of the five-second answer: the same half by country and by hosting provider. */
function useAnswer(b: Board): string | undefined {
  const { t } = useLingui()
  const c = b.conc
  if (!c || c.city.total === 0) return undefined
  const pct = (n: number) => formatPercent(fraction(n, c.city.total), 0)
  const k = c.country.toHalf
  const top = c.country.ranked[0]
  const country =
    k === undefined || !top
      ? undefined
      : k === 1
        ? t`${pct(top.n)} of them run in one country, ${countryName(top.key)}.`
        : plural(k, {
            one: 'Half of them run in # country.',
            other: 'Half of them run in # countries.',
          })
  const j = c.provider.toHalf
  const host = c.provider.ranked[0]
  const provider =
    j === undefined || !host
      ? undefined
      : j === 1
        ? t`${pct(host.n)} run with one hosting provider, ${host.key.replace(/\.$/, '')}.`
        : plural(j, {
            one: 'Half run with # hosting provider.',
            other: 'Half run with # hosting providers.',
          })
  const both = [country, provider].filter(Boolean).join(' ')
  return both || undefined
}

export function MapPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const devnet = isDevnet(net)
  const controls = useMapSearch()
  const board = useBoard(net, controls, !off && !devnet)
  const claim = useClaim(board)
  const answer = useAnswer(board)
  return (
    <PageFrame
      path="/map"
      title={t`Map`}
      layer="network"
      claim={claim}
      lede={
        answer ??
        t`Where the network runs, by city, country and hosting provider, from Radar's latest crawl.`
      }
    >
      {devnet ? (
        <Empty
          kind="unsupported-network"
          title={t`Radar doesn't crawl devnets.`}
          body={t`The map is drawn from Radar's crawl of mainnet and testnet.`}
        />
      ) : off ? (
        <LandOnly />
      ) : (
        <MapBoard board={board} controls={controls} />
      )}
    </PageFrame>
  )
}

/** Decentralized only mode: the crawl is a hosted service, so the map shows the land and says why it is empty. */
function LandOnly() {
  const { t } = useLingui()
  return (
    <div className="rx-mapgrid rx-mapgrid--bare">
      <Unavailable title={t`The map needs Radar's crawl`} source="radar" />
      <PlaceMap
        places={[]}
        region="world"
        onRegion={() => undefined}
        selected={undefined}
        marked={undefined}
        onSelect={() => undefined}
        placeName={placeText}
        count={() => ''}
        share={() => ''}
        summary={t`Map of the world. Radar's crawl places the nodes on it, and it is not read in this mode.`}
        labels={0}
      />
    </div>
  )
}

function MapBoard({ board: b, controls }: { board: Board; controls: MapSearchControls }) {
  const { t } = useLingui()
  const { search, set } = controls
  const phone = useMediaQuery(PHONE)
  const total = b.conc?.city.total ?? 0
  const share = useShare(total)
  useSectionSource([
    b.query.data ? stampOf(b.query.data) : undefined,
    b.summary?.data ? stampOf(b.summary.data) : undefined,
  ])

  const count = (n: number): string =>
    b.scope === 'nodes'
      ? plural(n, { one: '# reachable node', other: '# reachable nodes' })
      : b.scope === 'evo' && !b.narrowed
        ? plural(n, { one: '# evonode', other: '# evonodes' })
        : plural(n, { one: '# masternode', other: '# masternodes' })

  const largest = b.places
    .slice(0, 5)
    .map((p) => `${placeText(p)} ${formatInt(p.n)}`)
    .join('; ')
  const all = count(total)
  const summary = largest
    ? t`Map of the world with a disc for each city, sized by how many nodes run there: ${all}. Largest: ${largest}.`
    : t`Map of the world. The nodes are on their way.`

  const region = search.region ?? 'world'
  const selected = findPlace(b.places, search.place)
  const node = search.protx ? b.rows.find((r) => r.protx === search.protx) : undefined
  const single = !node && search.q && b.members.length === 1 ? b.members[0] : undefined
  const shown = node ?? single
  const nodePlace = shown ? placeOfRow(b.places, shown) : undefined

  const select = (id: string) => {
    const p = findPlace(b.places, id)
    const off = p && !inBox(regionBox(region), ...projectWorld(p.lon, p.lat))
    set({
      place: id,
      protx: undefined,
      ...(off ? { region: undefined } : {}),
    })
  }

  const halfLine =
    b.scope === 'nodes'
      ? t`Half of the reachable nodes run in the cities above.`
      : b.scope === 'evo' && !b.narrowed
        ? t`Half of the evonodes run in the cities above.`
        : b.narrowed
          ? t`Half of these masternodes run in the cities above.`
          : t`Half of the masternodes run in the cities above.`

  return (
    <div className="rx-mapboard">
      <Toolbar board={b} controls={controls} />
      <Notes board={b} controls={controls} />
      {b.query.isError ? (
        <ErrorState error={b.query.error} source="radar" onRetry={() => void b.query.refetch()} />
      ) : !b.loading && total === 0 ? (
        <Empty
          kind="no-match"
          title={t`No masternode matches these filters.`}
          body={
            <button
              type="button"
              className="rx-maplink"
              onClick={() => {
                set(clearedFilters)
              }}
            >
              {t`Clear the filters`}
            </button>
          }
        />
      ) : (
        <>
          <div className="rx-mapgrid" data-map-root>
            <PlaceMap
              places={b.places}
              region={region}
              onRegion={(r) => {
                set({ region: r === 'world' ? undefined : r })
              }}
              selected={selected?.id}
              marked={nodePlace?.id}
              onSelect={select}
              placeName={placeText}
              count={count}
              share={share}
              summary={summary}
              labels={8}
            />
            <div className="rx-mapside" data-map-side>
              {shown ? (
                <NodePanel
                  row={shown}
                  tip={b.tip}
                  place={nodePlace}
                  share={share}
                  onClose={
                    node
                      ? () => {
                          set({ protx: undefined })
                        }
                      : undefined
                  }
                />
              ) : selected ? (
                <PlaceCard
                  place={selected}
                  board={b}
                  count={count}
                  share={share}
                  filter={controls.filter}
                  onClose={() => {
                    set({ place: undefined })
                  }}
                />
              ) : null}
              <h2 className="rx-mapside__title">{t`Cities`}</h2>
              {b.loading ? (
                <Skeleton shape="row" count={8} />
              ) : (
                <PlaceList
                  places={b.places}
                  toHalf={b.conc?.city.toHalf}
                  halfLine={halfLine}
                  selected={selected?.id}
                  onSelect={select}
                  name={(p) => <PlaceName place={p} />}
                  share={share}
                  limit={phone ? 6 : 12}
                />
              )}
            </div>
          </div>
          <Bars board={b} controls={controls} />
        </>
      )}
    </div>
  )
}

const clearedFilters = {
  q: undefined,
  status: undefined,
  reach: undefined,
  country: undefined,
  version: undefined,
  host: undefined,
  dkg: undefined,
  place: undefined,
  protx: undefined,
} as const

function PlaceName({ place }: { place: Place }) {
  const f = place.country ? flag(place.country) : ''
  return (
    <>
      {f ? (
        <span className="rx-flag" aria-hidden="true">
          {f}{' '}
        </span>
      ) : null}
      <span className="rx-places__city">{place.city ?? placeText(place)}</span>
      {place.city && place.country && countryName(place.country) !== place.city ? (
        <span className="rx-places__country">{countryName(place.country)}</span>
      ) : null}
    </>
  )
}

function Toolbar({ board: b, controls }: { board: Board; controls: MapSearchControls }) {
  const { t } = useLingui()
  const { search, set } = controls
  const [text, setText] = useDebouncedQuery(search.q, (q) => {
    set({ q, protx: undefined, place: undefined })
  })
  return (
    <div className="rx-maptools" data-map-tools>
      <SegFilter
        label={t`What to count`}
        options={[
          { id: 'mn', label: t`Masternodes` },
          { id: 'evo', label: t`Evonodes` },
          { id: 'nodes', label: t`All reachable nodes` },
        ]}
        value={b.scope}
        onChange={(id) => {
          set({ ...scopeChange(id as Scope), place: undefined, protx: undefined })
        }}
      />
      {b.scope === 'nodes' ? null : (
        <SearchField
          label={t`Filter masternodes`}
          placeholder={t`ProTx, IP, city or provider`}
          value={text}
          onChange={setText}
        />
      )}
    </div>
  )
}

/** What the page leaves out or narrows to, each with its way back. */
function Notes({ board: b, controls }: { board: Board; controls: MapSearchControls }) {
  const { t } = useLingui()
  const { search, filter, set } = controls
  const hosts = useMemo(() => mnHostLabels(b.rows), [b.rows])
  const now = useNow()
  const asOf = b.query.data?.asOf
  const stale =
    asOf !== undefined && now - asOf > staleAgeMs('radar', staleAfterMs('crawl')) ? asOf : undefined
  const chips: { key: keyof MnFilter; label: string }[] = []
  if (b.scope !== 'nodes') {
    if (filter.q) chips.push({ key: 'q', label: t`Search: ${filter.q}` })
    for (const c of filter.country ?? [])
      chips.push({ key: 'country', label: t`Country: ${countryName(c)}` })
    for (const h of filter.host ?? [])
      chips.push({ key: 'host', label: t`Hosting: ${hosts[h] ?? `AS${h}`}` })
    for (const v of filter.version ?? []) chips.push({ key: 'version', label: t`Version: ${v}` })
    if (filter.reach)
      chips.push({
        key: 'reach',
        label: filter.reach === 'reachable' ? t`Answered the crawl` : t`Did not answer the crawl`,
      })
    if (filter.status && !(filter.status.length === 1 && filter.status[0] === 'enabled'))
      chips.push({
        key: 'status',
        label: filter.status.includes('enabled') ? t`PoSe-banned counted too` : t`PoSe-banned only`,
      })
    for (const d of filter.dkg ?? []) chips.push({ key: 'dkg', label: t`DKG: ${d}` })
    if (filter.type && !(filter.type.length === 1 && filter.type[0] === 'evo'))
      chips.push({ key: 'type', label: t`Regular masternodes only` })
  }
  const unplaced = b.unplaced
  return (
    <div className="rx-mapnotes" data-map-notes>
      {stale !== undefined ? (
        <Notice tone="warn" data-stale-crawl>
          <b>{t`The crawl is stale.`}</b> {t`Radar's last crawl finished`}{' '}
          <Time ms={stale} mode="relative" live />
          {t`, so the figures below may be out of date.`}
        </Notice>
      ) : null}
      {chips.length > 0 ? (
        <ul className="rx-mapchips" aria-label={t`Filters`}>
          {chips.map((c) => (
            <li key={`${c.key}:${c.label}`}>
              <button
                type="button"
                className="rx-mapchip"
                aria-label={t`Remove the filter ${c.label}`}
                onClick={() => {
                  set({ [c.key]: undefined, place: undefined, protx: undefined })
                }}
              >
                {c.label}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
          {chips.length > 1 ? (
            <li>
              <button
                type="button"
                className="rx-maplink"
                onClick={() => {
                  set(clearedFilters)
                }}
              >
                {t`Clear all`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {!b.loading && (b.bannedOut > 0 || unplaced > 0) ? (
        <p className="rx-mapnote" data-left-out>
          {b.bannedOut > 0 ? (
            <>
              {b.scope === 'evo' && !b.narrowed
                ? plural(b.bannedOut, {
                    one: '# PoSe-banned evonode is not counted: it serves nothing until it is revived.',
                    other:
                      '# PoSe-banned evonodes are not counted: they serve nothing until they are revived.',
                  })
                : plural(b.bannedOut, {
                    one: '# PoSe-banned masternode is not counted: it serves nothing until it is revived.',
                    other:
                      '# PoSe-banned masternodes are not counted: they serve nothing until they are revived.',
                  })}{' '}
              <button
                type="button"
                className="rx-maplink"
                onClick={() => {
                  set({ status: ['enabled', 'pose-banned'], place: undefined })
                }}
              >
                {t`Count them too`}
              </button>{' '}
            </>
          ) : null}
          {unplaced > 0
            ? b.scope === 'nodes'
              ? plural(unplaced, {
                  one: '# reachable node is on Tor or I2P and has no place; the shares count it as unknown.',
                  other:
                    '# reachable nodes are on Tor or I2P and have no place; the shares count them as unknown.',
                })
              : plural(unplaced, {
                  one: '# has no location the crawl could find; the shares count it as unknown.',
                  other:
                    '# have no location the crawl could find; the shares count them as unknown.',
                })
            : null}
        </p>
      ) : null}
      {search.protx && !b.loading && !b.rows.some((r) => r.protx === search.protx) ? (
        <p className="rx-mapnote" role="status" data-node-missing>
          {t`The masternode in the address is not in Radar's list: it may have left the network.`}
        </p>
      ) : null}
    </div>
  )
}

function PlaceCard({
  place,
  board: b,
  count,
  share,
  filter,
  onClose,
}: {
  place: Place
  board: Board
  count: (n: number) => string
  share: (n: number) => string
  filter: MnFilter
  onClose: () => void
}) {
  const { t } = useLingui()
  const providers = place.providers.slice(0, 3)
  const more = place.providers.length - providers.length
  const listSearch = {
    ...filterFields(populationFilter(filter)),
    ...(place.country ? { country: [place.country] } : {}),
    ...(place.city ? { q: place.city } : {}),
  }
  return (
    <section className="rx-mapcard" aria-live="polite" data-place-card={place.id}>
      <header className="rx-mapcard__head">
        <h2 className="rx-mapcard__title">
          <PlaceName place={place} />
        </h2>
        <button type="button" className="rx-mapcard__close" aria-label={t`Close`} onClick={onClose}>
          ×
        </button>
      </header>
      <p className="rx-mapcard__lead">
        <b>{count(place.n)}</b> · {t`${share(place.n)} of the total`}
      </p>
      {b.scope === 'nodes' ? null : (
        <dl className="rx-mapcard__facts">
          <div>
            <dt>{t`Answered the last crawl`}</dt>
            <dd>
              {formatInt(place.answering)} / {formatInt(place.n)}
            </dd>
          </div>
          {b.scope === 'mn' ? (
            <div>
              <dt>{t`Evonodes`}</dt>
              <dd>{formatInt(place.evo)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t`Hosting`}</dt>
            <dd>
              <ul className="rx-mapcard__hosts">
                {providers.map((p) => (
                  <li key={p.org}>
                    <span>{p.org}</span> <span>{formatInt(p.n)}</span>
                  </li>
                ))}
                {more > 0 ? <li>{t`and ${formatInt(more)} more`}</li> : null}
              </ul>
            </dd>
          </div>
        </dl>
      )}
      {b.scope === 'nodes' ? null : (
        <Link className="rx-maplink" to="/masternodes" search={listSearch as never} data-place-list>
          {t`Open them in the masternode list`}
        </Link>
      )}
    </section>
  )
}

function NodePanel({
  row,
  tip,
  place,
  share,
  onClose,
}: {
  row: MnRow
  tip: number | undefined
  place: Place | undefined
  share: (n: number) => string
  onClose: (() => void) | undefined
}) {
  const { t } = useLingui()
  let where: ReactNode = null
  if (place) {
    const others = place.n - 1
    const city = placeText(place)
    const part = share(place.n)
    where =
      others > 0
        ? plural(others, {
            one: `It shares ${city} with # other counted masternode: ${part} of the total run there.`,
            other: `It shares ${city} with # other counted masternodes: ${part} of the total run there.`,
          })
        : t`It is the only counted masternode in ${city}.`
  } else if (row.crawl?.lat == null) {
    where = t`The crawl found no location for it, so it is not on the map.`
  } else {
    where = t`It is not among the masternodes counted here (PoSe-banned, or left out by a filter).`
  }
  return (
    <section className="rx-mapcard" aria-live="polite" data-map-node>
      <header className="rx-mapcard__head">
        <h2 className="rx-mapcard__title">{t`This masternode`}</h2>
        {onClose ? (
          <button
            type="button"
            className="rx-mapcard__close"
            aria-label={t`Close`}
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </header>
      <p className="rx-mapcard__lead">{where}</p>
      <NodeCard row={row} tip={tip} />
    </section>
  )
}

function Bars({ board: b, controls }: { board: Board; controls: MapSearchControls }) {
  const { t } = useLingui()
  const { filter, set } = controls
  const countryShare = useShare(b.conc?.country.total ?? 0)
  const providerShare = useShare(b.conc?.provider.total ?? 0)
  // Every reachable node's countries and providers come from the summary, which may still be on its way.
  if (!b.conc || b.conc.country.total === 0 || b.conc.provider.total === 0) return null
  const pickCountry =
    b.scope === 'nodes'
      ? undefined
      : (s: Share) => {
          set({ country: filter.country?.[0] === s.key ? undefined : [s.key], place: undefined })
        }
  const pickHost =
    b.scope === 'nodes'
      ? undefined
      : (s: Share) => {
          const same = filter.host?.join(',') === s.asns?.join(',')
          set({ host: same || !s.asns?.length ? undefined : s.asns, place: undefined })
        }
  return (
    <section className="rx-mapbars" aria-labelledby="map-bars" data-map-bars>
      <h2 id="map-bars" className="rx-mapbars__title">
        {t`Countries and hosting providers`}
      </h2>
      <p className="rx-mapbars__lede">
        {b.scope === 'nodes'
          ? t`The tick marks half of every reachable node.`
          : t`The tick marks half. Pick a country or a provider to see where its masternodes are.`}
      </p>
      <div className="rx-mapbars__grid">
        <ShareBar
          title={t`Countries`}
          c={b.conc.country}
          name={(s) => (
            <>
              <span aria-hidden="true">{flag(s.key)} </span>
              {countryName(s.key)}
            </>
          )}
          plain={(s) => countryName(s.key)}
          share={countryShare}
          unknown={b.scope === 'nodes' ? t`No location (Tor, I2P)` : t`No location`}
          onPick={pickCountry}
          picked={filter.country?.length === 1 ? filter.country[0] : undefined}
        />
        <ShareBar
          title={t`Hosting providers`}
          c={b.conc.provider}
          name={(s) => s.key}
          plain={(s) => s.key}
          share={providerShare}
          unknown={b.scope === 'nodes' ? t`No provider (Tor, I2P)` : t`No provider on record`}
          onPick={pickHost}
          picked={
            b.conc.provider.ranked.find((s) => s.asns?.join(',') === filter.host?.join(','))?.key
          }
        />
      </div>
    </section>
  )
}
