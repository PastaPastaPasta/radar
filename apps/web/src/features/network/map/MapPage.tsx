import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { stampOf } from '@/data/envelope'
import { joinMnRows } from '@/data/masternodes/rows'
import { radarQueries } from '@/data/radar/queries'
import { PageFrame, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Empty,
  ErrorState,
  SearchField,
  SourceLine,
  Unavailable,
  useMediaQuery,
  useReducedMotion,
} from '@/ui'
import { deferred } from '@/ui/deferred'
import { bottomSheet, type BottomSheet, type Rest } from './bottom-sheet'
import { useDebouncedQuery } from './debounced'
import { MapControls, HeadlineText, ListLink, useCategoryLabel } from './MapControls'
import { CityInfo, GroupList } from './MapDetails'
import { colorScheme, geoTotals, headline, mapView, mnPoints } from './map-model'
import type { CityPick, MapTexts } from './MapView'
import { NodeCard } from './NodeCard'
import { PHONE, isPhone } from './phone'
import { mnCount, nodeCount } from './counts'
import { useMapSearch } from './use-map-search'
import './map.css'

const MapView = deferred(() => import('./MapView').then((m) => m.default))

const PANEL_WIDTH = 400

const ATTRIBUTION = 'Basemap © Natural Earth · Geolocation by DB-IP (CC BY 4.0)'

type Mode = 'peek' | 'open' | 'detail'

const restFor = (m: Mode): Rest => (m === 'peek' ? 'collapsed' : 'half')

export function MapPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/map"
      title={t`Map`}
      eyebrow={t`Network`}
      layer="network"
      lede={t`Where the masternodes run, coloured by reachability, version or type.`}
    >
      <MapSurface />
    </PageFrame>
  )
}

function MapSurface() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  if (isDevnet(net)) {
    return (
      <Empty
        kind="unsupported-network"
        title={t`Radar doesn't crawl devnets.`}
        body={t`The map is drawn from Radar's crawl of mainnet and testnet.`}
      />
    )
  }
  return (
    <>
      {off ? <Unavailable title={t`The map needs Radar's crawl`} source="radar" /> : null}
      <MapBoard net={net} crawl={!off} />
    </>
  )
}

function MapBoard({ net, crawl }: { net: ReturnType<typeof useNetwork>; crawl: boolean }) {
  const { t } = useLingui()
  const label = useCategoryLabel()
  const controls = useMapSearch()
  const { search, filter, hidden, set } = controls
  const phone = useMediaQuery(PHONE)

  const mnQ = useQuery({ ...radarQueries.masternodes(net), enabled: crawl })
  const geoQ = useQuery({ ...radarQueries.geo(net), enabled: crawl })
  const rows = useMemo(
    () => (mnQ.data ? (joinMnRows(mnQ.data, undefined)?.data.rows ?? []) : []),
    [mnQ.data],
  )
  const tip = mnQ.data?.height
  const geo = geoQ.data?.data
  const layer = search.layer === 'nodes' && !geoQ.isError ? 'nodes' : 'mn'

  const scheme = useMemo(() => colorScheme(search.color, rows), [search.color, rows])
  const view = useMemo(() => mapView(rows, filter, scheme, hidden), [rows, filter, scheme, hidden])
  const points = useMemo(() => mnPoints(view.visible, scheme), [view.visible, scheme])
  const byProtx = useMemo(() => new Map(rows.map((r) => [r.protx, r])), [rows])
  const totals = useMemo(() => (geo ? geoTotals(geo) : undefined), [geo])
  const stats = useMemo(() => headline(view.visible), [view.visible])

  const selected = search.protx ? view.visible.find((r) => r.protx === search.protx) : undefined
  const selectedAt =
    selected?.crawl?.lat != null && selected.crawl.lon != null
      ? ([selected.crawl.lon, selected.crawl.lat] as [number, number])
      : undefined

  const [mode, setModeState] = useState<Mode>(() => (search.protx && phone ? 'detail' : 'peek'))
  const [group, setGroup] = useState<string[] | null>(null)
  const [city, setCity] = useState<CityPick | null>(null)
  const [failed, setFailed] = useState(false)

  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const sheet = useRef<BottomSheet | null>(null)
  const modeRef = useRef(mode)
  const snapNext = useRef(false)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      el.style.setProperty('--rx-map-top', `${el.getBoundingClientRect().top + window.scrollY}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [])

  const setMode = (m: Mode, move = true) => {
    snapNext.current = move
    setModeState(m)
  }
  useEffect(() => {
    modeRef.current = mode
    if (snapNext.current) {
      snapNext.current = false
      sheet.current?.snap(restFor(mode))
    }
  }, [mode])

  useEffect(() => {
    if (!crawl || !panel.current || !handle.current || !head.current || !body.current) return
    const s = bottomSheet({
      panel: panel.current,
      handle: handle.current,
      head: head.current,
      body: body.current,
      active: isPhone,
      restFor: () => restFor(modeRef.current),
      onDragEnd: (rest) => {
        if (rest === 'collapsed' && modeRef.current !== 'peek') setMode('peek', false)
        else if (rest !== 'collapsed' && modeRef.current === 'peek') setMode('open', false)
      },
    })
    sheet.current = s
    return () => {
      s.destroy()
      sheet.current = null
    }
  }, [crawl])

  const reduced = useReducedMotion()

  const select = (protx: string | undefined) => {
    set({ protx })
    if (protx) {
      if (phone) setMode('detail')
    } else if (phone && modeRef.current === 'detail') {
      setMode(group || city ? 'detail' : 'peek')
    }
  }
  const showGroup = (protxs: string[]) => {
    setCity(null)
    setGroup(protxs)
    setMode(phone ? 'detail' : 'open')
  }
  const showCity = (pick: CityPick) => {
    setGroup(null)
    setCity(pick)
    setMode(phone ? 'detail' : 'open')
  }
  const closeDetails = () => {
    setGroup(null)
    setCity(null)
    if (phone) setMode('peek')
  }
  const back = () => {
    set({ protx: undefined })
    if (!group && !city) setMode('peek')
  }

  const [text, setText] = useDebouncedQuery(search.q, (q) => {
    set({ q, protx: undefined })
  })

  useEffect(() => {
    const el = root.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isPhone() || modeRef.current === 'peek') return
      setMode('peek')
      handle.current?.focus()
    }
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
    }
  }, [])

  const texts: MapTexts = {
    map: t`Map of the network's nodes`,
    zoomIn: t`Zoom in`,
    zoomOut: t`Zoom out`,
    clusterList: t`Places on the map`,
    mnCluster: (total, parts) => {
      const list = parts.map((p) => `${formatInt(p.count)} ${label(p.key)}`).join(', ')
      return t`${mnCount(total)}: ${list}`
    },
    nodeCluster: (nodes, masternodes) =>
      t`${nodeCount(nodes)}, ${formatInt(masternodes)} of them masternodes`,
  }

  const loading = crawl && mnQ.isPending
  const stamp = mnQ.data ? stampOf(mnQ.data) : undefined
  const detailNode = selected && phone
  const groupRows = group?.flatMap((p) => byProtx.get(p) ?? []) ?? []

  return (
    <div
      ref={root}
      className="rx-map rx-plate"
      data-map-root
      data-mode={mode}
      data-layer={layer}
      data-reduced-motion={reduced ? '' : undefined}
    >
      <MapView
        layer={layer}
        points={points}
        geo={geo?.points ?? EMPTY_GEO}
        order={scheme.order}
        toneOf={scheme.toneOf}
        selected={selected?.protx}
        selectedAt={selectedAt}
        popup={selected ? <NodeCard row={selected} tip={tip} /> : null}
        inlineDetail={phone}
        coverLeft={crawl && !phone ? PANEL_WIDTH : 0}
        fitKey={`${net}:${layer}:${points.length > 0 || (geo?.points.length ?? 0) > 0}`}
        texts={texts}
        onSelect={select}
        onGroup={showGroup}
        onCity={showCity}
        onFail={() => {
          setFailed(true)
        }}
      />
      <details className="rx-map-attrib" data-map-attrib>
        <summary aria-label={t`Map attribution`}>i</summary>
        <p>{ATTRIBUTION}</p>
      </details>
      {failed ? (
        <p className="rx-map-fail rx-note" role="status" data-map-failed>
          {t`The map could not start in this browser. The filters and the list still work.`}
        </p>
      ) : null}
      {crawl ? (
        <aside
          ref={panel}
          className="rx-map-panel"
          data-mode={mode}
          data-layer={layer}
          aria-label={t`Map controls`}
          data-map-panel
        >
          <button
            ref={handle}
            type="button"
            className="rx-map-handle"
            aria-expanded={mode !== 'peek'}
            aria-label={t`Map controls`}
            onClick={() => {
              setMode(mode === 'peek' ? 'open' : 'peek')
            }}
          >
            <span />
          </button>
          <div ref={head} className="rx-map-head">
            <div className="rx-map-searchrow">
              <SearchField
                label={t`Search masternodes`}
                placeholder={t`Search ProTx, IP, city, hosting`}
                value={text}
                onChange={setText}
              />
              <button
                type="button"
                className="dh-btn dh-btn--sm rx-map-filters"
                onClick={() => {
                  setMode('open')
                }}
              >
                {t`Filters`}
              </button>
            </div>
            <p className="rx-map-headline" role="status" data-map-headline>
              {loading ? (
                t`Loading the network…`
              ) : layer === 'nodes' && totals ? (
                t`${nodeCount(totals.nodes)} in ${formatInt(totals.places)} places; ${formatInt(totals.masternodes)} are masternodes.`
              ) : mnQ.isError ? (
                t`Couldn't load the masternode list.`
              ) : (
                <HeadlineText h={stats} />
              )}
            </p>
          </div>
          <div ref={body} className="rx-map-body">
            {mnQ.isError ? (
              <ErrorState
                error={mnQ.error}
                source="radar"
                compact
                onRetry={() => void mnQ.refetch()}
              />
            ) : (
              <div className="rx-map-controls" data-map-controls>
                <MapControls
                  rows={rows}
                  view={view}
                  scheme={scheme}
                  controls={controls}
                  geo={totals}
                  layer={layer}
                  onChanged={() => {
                    setGroup(null)
                    setCity(null)
                  }}
                />
              </div>
            )}
            {group && layer === 'mn' && !detailNode ? (
              <GroupList rows={groupRows} onOpen={select} onClose={closeDetails} />
            ) : null}
            {city && layer === 'nodes' ? <CityInfo pick={city} onClose={closeDetails} /> : null}
            {detailNode ? (
              <section className="rx-map-node" data-map-node aria-live="polite">
                <button type="button" className="rx-map-link" onClick={back}>
                  {group ? t`← Back to the list` : t`Close`}
                </button>
                <NodeCard row={selected} tip={tip} />
              </section>
            ) : null}
            <p className="rx-map-foot">
              {layer === 'nodes' ? (
                totals?.unlocated ? (
                  plural(totals.unlocated, {
                    one: '# reachable node on Tor or I2P has no location, so it is not drawn.',
                    other:
                      '# reachable nodes on Tor or I2P have no location, so they are not drawn.',
                  })
                ) : null
              ) : (
                <>
                  {stats.missing > 0 ? (
                    <>
                      {plural(stats.missing, {
                        one: '# masternode is not on the map: no address registered, or not crawled yet.',
                        other:
                          '# masternodes are not on the map: no address registered, or not crawled yet.',
                      })}{' '}
                    </>
                  ) : null}
                  <ListLink scheme={scheme} controls={controls} />
                </>
              )}
            </p>
            {stamp ? (
              <p className="rx-map-source">
                <SourceLine stamp={stamp} compact />
              </p>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  )
}

const EMPTY_GEO: never[] = []
