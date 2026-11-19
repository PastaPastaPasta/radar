import { msg, plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { MessageDescriptor } from '@lingui/core'
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
import { isTiny } from '../nodes/census-math'
import { Notice } from '../nodes/parts'
import { legacyHidden, legacyKey } from './legacy-url'
import {
  concentrationsOfNodes,
  concentrationsOfRows,
  findPlace,
  halfForm,
  isNarrowed,
  placesOfGeo,
  placesOfRows,
  populationFilter,
  scopeChange,
  scopeOf,
  shownFraction,
  standingOf,
  type Concentrations,
  type Place,
  type Scope,
  type Share,
  type Standing,
} from './map-model'
import { NodeCard } from './NodeCard'
import { placeText } from './place-text'
import { PlaceList } from './PlaceList'
import { PlaceMap } from './PlaceMap'
import { inBox, regionBox } from './regions'
import { ShareBar } from './ShareBar'
import { useMapSearch, type MapSearchControls } from './use-map-search'
import './map.css'

const PHONE = '(max-width: 640px)'

function useShare(total: number): (n: number) => string {
  const { t } = useLingui()
  return (n) => (isTiny(n, total) ? t`<0.1%` : formatPercent(shownFraction(n, total, 1), 1))
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
  /** An old map link's hidden categories, applied as they were. */
  legacy: { keyOf: (r: MnRow) => string; hide: string[] } | undefined
}

/** The noun the page counts in: an evonode view says evonodes, whatever else narrows it. */
type Noun = 'mn' | 'evo' | 'nodes'
const nounOf = (b: Pick<Board, 'scope'>): Noun => b.scope

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

  // A link from the old map: what its colouring hid stays hidden, and a colouring alone meant nothing to count.
  const hiddenBy = useMemo(
    () =>
      nodes || !search.hide ? undefined : legacyHidden(search.color ?? 'reach', rows, search.hide),
    [nodes, search.hide, search.color, rows],
  )
  useEffect(() => {
    if (search.color !== undefined && search.hide === undefined) set({ color: undefined })
  }, [search.color, search.hide, set])

  const population = useMemo(() => populationFilter(filter), [filter])
  const members = useMemo(() => {
    const passed = filterMnRows(rows, population)
    return hiddenBy ? passed.filter((r) => !hiddenBy(r)) : passed
  }, [rows, population, hiddenBy])
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
    narrowed: !nodes && (isNarrowed(filter) || hiddenBy !== undefined),
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
    legacy:
      hiddenBy && search.hide
        ? { keyOf: legacyKey(search.color ?? 'reach', rows), hide: search.hide }
        : undefined,
  }
}

/** The page's claim: how few cities hold half of what it counts. */
function useClaim(b: Board): string | undefined {
  const { t } = useLingui()
  const c = b.conc?.city
  if (!c || c.total === 0) return undefined
  const form = halfForm(c)
  if (form.kind === 'none') return undefined
  const noun = nounOf(b)
  const claimTotal = c.total
  if (claimTotal === 1) {
    const where = placeText(b.places[0]!)
    if (noun === 'evo') return t`The only evonode counted runs in ${where}`
    if (noun === 'nodes') return t`The only reachable node runs in ${where}`
    return t`The only masternode counted runs in ${where}`
  }
  const tot =
    noun === 'evo'
      ? plural(claimTotal, { one: '# evonode', other: '# evonodes' })
      : noun === 'nodes'
        ? plural(claimTotal, { one: '# reachable node', other: '# reachable nodes' })
        : plural(claimTotal, { one: '# masternode', other: '# masternodes' })
  if (form.kind === 'one') {
    const top = b.places.find((p) => p.id === form.share.key)!
    const pct = formatPercent(shownFraction(form.share.n, form.total, 0), 0)
    const where = placeText(top)
    return b.narrowed
      ? t`${pct} of these ${tot} run in one city, ${where}`
      : t`${pct} of the ${tot} run in one city, ${where}`
  }
  const claimCities = form.k
  const cities = plural(claimCities, { one: '# city', other: '# cities' })
  return b.narrowed
    ? t`Half of these ${tot} run in ${cities}`
    : t`Half of the ${tot} run in ${cities}`
}

/** The rest of the five-second answer: the same half by country and by hosting provider, each of its own total. */
function useAnswer(b: Board): string | undefined {
  const { t } = useLingui()
  const c = b.conc
  if (!c || c.city.total === 0) return undefined
  const pct = (f: { share: Share; total: number }) =>
    formatPercent(shownFraction(f.share.n, f.total, 0), 0)
  const cf = halfForm(c.country)
  const k = cf.kind === 'half' ? cf.k : 0
  const country =
    cf.kind === 'one'
      ? t`${pct(cf)} of them run in one country, ${countryName(cf.share.key)}.`
      : cf.kind === 'half'
        ? plural(k, {
            one: 'Half of them run in # country.',
            other: 'Half of them run in # countries.',
          })
        : undefined
  const pf = halfForm(c.provider)
  const j = pf.kind === 'half' ? pf.k : 0
  const provider =
    pf.kind === 'one'
      ? t`${pct(pf)} run with one hosting provider, ${pf.share.key.replace(/\.$/, '')}.`
      : pf.kind === 'half'
        ? plural(j, {
            one: 'Half run with # hosting provider.',
            other: 'Half run with # hosting providers.',
          })
        : undefined
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
  const { search, filter, set } = controls
  const phone = useMediaQuery(PHONE)
  const total = b.conc?.city.total ?? 0
  const share = useShare(total)
  useSectionSource([
    b.query.data ? stampOf(b.query.data) : undefined,
    b.summary?.data ? stampOf(b.summary.data) : undefined,
  ])

  const noun = nounOf(b)
  const count = (n: number): string =>
    noun === 'nodes'
      ? plural(n, { one: '# reachable node', other: '# reachable nodes' })
      : noun === 'evo'
        ? plural(n, { one: '# evonode', other: '# evonodes' })
        : plural(n, { one: '# masternode', other: '# masternodes' })

  const largest = b.places
    .slice(0, 5)
    .map((p) => `${placeText(p)} ${formatInt(p.n)}`)
    .join('; ')
  const all = count(total)
  const summary = largest
    ? t`Map with a disc for each city, sized by how many nodes run there: ${all}. Largest: ${largest}.`
    : t`Map of the land. No city is drawn.`

  const region = search.region ?? 'world'
  const selected = findPlace(b.places, search.place)
  const node = search.protx ? b.rows.find((r) => r.protx === search.protx) : undefined
  const single = !node && search.q && b.members.length === 1 ? b.members[0] : undefined
  const shown = node ?? single
  const standing = shown ? standingOf(shown, b.members, b.places, filter) : undefined
  const marked =
    shown?.crawl?.lat != null && shown.crawl.lon != null
      ? {
          lat: shown.crawl.lat,
          lon: shown.crawl.lon,
          place: standing?.kind === 'counted' ? standing.place.id : undefined,
        }
      : undefined

  const select = (id: string | undefined) => {
    if (id === undefined) {
      set({ place: undefined })
      return
    }
    const p = findPlace(b.places, id)
    const off = p && !inBox(regionBox(region), ...projectWorld(p.lon, p.lat))
    set({ place: id, protx: undefined, ...(off ? { region: undefined } : {}) })
  }
  const clear = () => {
    set(clearedFilters(b.scope))
  }

  const halfLine =
    noun === 'nodes'
      ? t`Half of the reachable nodes run in the cities above.`
      : noun === 'evo'
        ? b.narrowed
          ? t`Half of these evonodes run in the cities above.`
          : t`Half of the evonodes run in the cities above.`
        : b.narrowed
          ? t`Half of these masternodes run in the cities above.`
          : t`Half of the masternodes run in the cities above.`

  return (
    <div className="rx-mapboard">
      <Toolbar board={b} controls={controls} />
      <Notes board={b} controls={controls} />
      {b.query.isError ? (
        <ErrorState error={b.query.error} source="radar" onRetry={() => void b.query.refetch()} />
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
              marked={marked}
              onSelect={select}
              placeName={placeText}
              count={count}
              share={share}
              summary={summary}
              labels={8}
            />
            <div className="rx-mapside" data-map-side>
              {shown && standing ? (
                <NodePanel
                  row={shown}
                  tip={b.tip}
                  standing={standing}
                  share={share}
                  onClose={
                    node
                      ? () => {
                          set({ protx: undefined })
                        }
                      : undefined
                  }
                  onCountBanned={() => {
                    set({ status: ['enabled', 'pose-banned'], place: undefined })
                  }}
                  onCountTypes={() => {
                    set({ type: undefined, place: undefined })
                  }}
                  onClear={clear}
                />
              ) : selected ? (
                <PlaceCard
                  place={selected}
                  board={b}
                  count={count}
                  share={share}
                  filter={filter}
                  onClose={() => {
                    set({ place: undefined })
                  }}
                />
              ) : null}
              <h2 className="rx-mapside__title">{t`Cities`}</h2>
              {b.loading ? (
                <Skeleton shape="row" count={8} />
              ) : total === 0 ? (
                <NoneCounted board={b} onClear={clear} />
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
          {total > 0 ? <Bars board={b} controls={controls} /> : null}
        </>
      )}
    </div>
  )
}

/** The filters off, the view kept: an evonode view stays one. */
const clearedFilters = (scope: Scope) =>
  ({
    q: undefined,
    status: undefined,
    reach: undefined,
    country: undefined,
    version: undefined,
    host: undefined,
    dkg: undefined,
    type: scope === 'evo' ? (['evo'] as ['evo']) : undefined,
    color: undefined,
    hide: undefined,
    place: undefined,
    protx: undefined,
  }) as const

/** Nothing to count: say why, and offer the way back only where a filter is the reason. */
function NoneCounted({ board: b, onClear }: { board: Board; onClear: () => void }) {
  const { t } = useLingui()
  const noun = nounOf(b)
  if (noun === 'nodes')
    return <Empty kind="none-yet" title={t`The latest crawl placed no reachable node.`} />
  if (!b.narrowed)
    return (
      <Empty
        kind="none-yet"
        title={
          noun === 'evo'
            ? t`The crawl lists no enabled evonode.`
            : t`The crawl lists no enabled masternode.`
        }
      />
    )
  return (
    <Empty
      kind="no-match"
      title={
        noun === 'evo'
          ? t`No evonode matches these filters.`
          : t`No masternode matches these filters.`
      }
      body={
        <button type="button" className="rx-maplink" onClick={onClear}>
          {t`Clear the filters`}
        </button>
      }
    />
  )
}

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

/** What an old map link's colouring called each category. */
const LEGACY_LABEL: Record<string, MessageDescriptor> = {
  reachable: msg`Answered the crawl`,
  unreachable: msg`Did not answer the crawl`,
  unchecked: msg`Not checked`,
  enabled: msg`Enabled`,
  banned: msg`PoSe-banned`,
  regular: msg`Regular masternodes`,
  evo: msg`Evonodes`,
  other: msg`Other versions`,
  unknown: msg`Unknown version`,
}

interface Chip {
  key: keyof MnFilter | 'hide'
  label: string
}

/** The masternode filters in the address, each as a chip's words. */
function useChips(b: Board, filter: MnFilter): Chip[] {
  const { t, i18n } = useLingui()
  const hosts = useMemo(() => mnHostLabels(b.rows), [b.rows])
  const chips: Chip[] = []
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
  if (filter.type?.length === 1 && filter.type[0] === 'regular')
    chips.push({ key: 'type', label: t`Regular masternodes only` })
  if (b.legacy) {
    const names = b.legacy.hide
      .map((k) => {
        const d = LEGACY_LABEL[k]
        return d ? i18n._(d) : k
      })
      .join(', ')
    chips.push({ key: 'hide', label: t`Left out by an old map link: ${names}` })
  }
  return chips
}

/** What the page leaves out or narrows to, each with its way back. */
function Notes({ board: b, controls }: { board: Board; controls: MapSearchControls }) {
  const { t } = useLingui()
  const { search, filter, set } = controls
  const now = useNow()
  const asOf = b.query.data?.asOf
  const stale =
    asOf !== undefined && now - asOf > staleAgeMs('radar', staleAfterMs('crawl')) ? asOf : undefined
  const chips = useChips(b, filter)
  const remove = (c: Chip) => {
    set(
      c.key === 'hide'
        ? { hide: undefined, color: undefined, place: undefined, protx: undefined }
        : { [c.key]: undefined, place: undefined, protx: undefined },
    )
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
      {chips.length > 0 && b.scope === 'nodes' ? (
        <p className="rx-mapnote" data-filters-off>
          {t`Masternode filters are off while every reachable node is counted: ${chips
            .map((c) => c.label)
            .join('; ')}.`}{' '}
          <button
            type="button"
            className="rx-maplink"
            onClick={() => {
              set(clearedFilters(b.scope))
            }}
          >
            {t`Clear them`}
          </button>
        </p>
      ) : chips.length > 0 ? (
        <ul className="rx-mapchips" aria-label={t`Filters`}>
          {chips.map((c) => (
            <li key={`${c.key}:${c.label}`}>
              <button
                type="button"
                className="rx-mapchip"
                aria-label={t`Remove the filter ${c.label}`}
                onClick={() => {
                  remove(c)
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
                  set(clearedFilters(b.scope))
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
              {nounOf(b) === 'evo'
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
                  one: '# reachable node has no place, most likely on Tor or I2P; the shares count it as unknown.',
                  other:
                    '# reachable nodes have no place, most of them on Tor or I2P; the shares count them as unknown.',
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
  // The list's search is words a row must all hold: the visitor's own search, then the city.
  const q = [filter.q?.trim(), place.city].filter(Boolean).join(' ')
  const listSearch = {
    ...filterFields(populationFilter(filter)),
    ...(place.country ? { country: [place.country] } : {}),
    ...(q ? { q } : {}),
  }
  return (
    <section className="rx-mapcard" data-place-card={place.id}>
      <header className="rx-mapcard__head">
        <h2 className="rx-mapcard__title">
          <PlaceName place={place} />
        </h2>
        <button type="button" className="rx-mapcard__close" aria-label={t`Close`} onClick={onClose}>
          ×
        </button>
      </header>
      <p className="rx-mapcard__lead" aria-live="polite">
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
  standing,
  share,
  onClose,
  onCountBanned,
  onCountTypes,
  onClear,
}: {
  row: MnRow
  tip: number | undefined
  standing: Standing
  share: (n: number) => string
  onClose: (() => void) | undefined
  onCountBanned: () => void
  onCountTypes: () => void
  onClear: () => void
}) {
  const { t } = useLingui()
  let where: ReactNode
  let action: { label: string; run: () => void } | undefined
  switch (standing.kind) {
    case 'counted': {
      const place = standing.place
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
      break
    }
    case 'unplaced':
      where = t`The crawl found no location for it, so it is not on the map.`
      break
    case 'banned':
      where = t`It is PoSe-banned, so it is not counted here. The ring marks where it is.`
      action = { label: t`Count PoSe-banned masternodes too`, run: onCountBanned }
      break
    case 'type':
      where =
        standing.type === 'regular'
          ? t`It is a regular masternode, and this view counts evonodes. The ring marks where it is.`
          : t`It is an evonode, and this view counts regular masternodes. The ring marks where it is.`
      action = { label: t`Count every masternode`, run: onCountTypes }
      break
    case 'filtered':
      where = t`The filters leave it out, so it is not counted here. The ring marks where it is.`
      action = { label: t`Clear the filters`, run: onClear }
      break
  }
  return (
    <section className="rx-mapcard" data-map-node data-standing={standing.kind}>
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
      <p className="rx-mapcard__lead" aria-live="polite">
        {where}
        {action ? (
          <>
            {' '}
            <button type="button" className="rx-maplink" onClick={action.run} data-node-action>
              {action.label}
            </button>
          </>
        ) : null}
      </p>
      <NodeCard row={row} tip={tip} />
    </section>
  )
}

function Bars({ board: b, controls }: { board: Board; controls: MapSearchControls }) {
  const { t } = useLingui()
  const { filter, set } = controls
  const countryShare = useShare(b.conc?.country.total ?? 0)
  const providerShare = useShare(b.conc?.provider.total ?? 0)
  const nodes = b.scope === 'nodes'
  const head = (
    <>
      <h2 id="map-bars" className="rx-mapbars__title">
        {t`Countries and hosting providers`}
      </h2>
      <p className="rx-mapbars__lede">
        {nodes
          ? t`The tick marks half of every reachable node.`
          : t`The tick marks half. Pick a country or a provider to see where its masternodes are.`}
      </p>
    </>
  )
  // Every reachable node's countries and providers come from the summary: the city map stays while it loads or fails.
  if (nodes && b.summary?.isError)
    return (
      <section className="rx-mapbars" aria-labelledby="map-bars" data-map-bars="error">
        {head}
        <ErrorState
          error={b.summary.error}
          source="radar"
          compact
          onRetry={() => void b.summary?.refetch()}
        />
      </section>
    )
  if (nodes && b.summary?.isPending)
    return (
      <section className="rx-mapbars" aria-labelledby="map-bars" data-map-bars="loading">
        {head}
        <Skeleton shape="block" count={2} />
      </section>
    )
  if (!b.conc || b.conc.country.total === 0 || b.conc.provider.total === 0) return null
  const pickCountry = nodes
    ? undefined
    : (s: Share) => {
        set({ country: filter.country?.[0] === s.key ? undefined : [s.key], place: undefined })
      }
  const pickHost = nodes
    ? undefined
    : (s: Share) => {
        const same = filter.host?.join(',') === s.asns?.join(',')
        set({ host: same || !s.asns?.length ? undefined : s.asns, place: undefined })
      }
  return (
    <section className="rx-mapbars" aria-labelledby="map-bars" data-map-bars>
      {head}
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
          unknown={nodes ? t`No location (mostly Tor and I2P)` : t`No location`}
          onPick={pickCountry}
          picked={filter.country?.length === 1 ? filter.country[0] : undefined}
        />
        <ShareBar
          title={t`Hosting providers`}
          c={b.conc.provider}
          name={(s) => s.key}
          plain={(s) => s.key}
          share={providerShare}
          unknown={nodes ? t`No provider on record (mostly Tor and I2P)` : t`No provider on record`}
          onPick={pickHost}
          picked={
            b.conc.provider.ranked.find((s) => s.asns?.join(',') === filter.host?.join(','))?.key
          }
        />
      </div>
    </section>
  )
}
