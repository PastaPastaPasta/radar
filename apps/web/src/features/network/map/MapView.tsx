/*
 * Radar's map, ported from dash-nodes (MIT) `web/assets/map.js`: MapLibre draws the self-hosted Natural Earth basemap
 * on the GPU and the clusters are small DOM donuts. This module is the only importer of `maplibre-gl`; the page loads
 * it on first use.
 */
import {
  LngLatBounds,
  Map as GLMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { RadarGeo } from '@/data/radar/schemas'
import { trustedWorkerUrl } from '@/data/trusted-worker'
import { formatInt, formatNumber } from '@/lib/format'
import { RADAR_MAP_STYLE, useReducedMotion } from '@/ui'
import { isWide } from './phone'
import { TONE_COLOR, TONES, type MapPoint, type Tone } from './map-model'

type GeoPoint = RadarGeo['points'][number]

export interface CityPick {
  point: GeoPoint | null
  nodes: number
  masternodes: number
}

export interface MapTexts {
  /** The map canvas's label. */
  map: string
  zoomIn: string
  zoomOut: string
  /** "12 masternodes: 8 Reachable, 4 Unreachable". */
  mnCluster: (total: number, parts: { key: string; count: number }[]) => string
  /** "40 reachable nodes, 12 of them masternodes". */
  nodeCluster: (nodes: number, masternodes: number) => string
  /** The screen-reader list's label. */
  clusterList: string
}

export interface MapViewProps {
  layer: 'mn' | 'nodes'
  points: MapPoint[]
  geo: GeoPoint[]
  /** The legend's categories, so a donut's segments and label follow the colouring. */
  order: string[]
  toneOf: (key: string) => Tone
  selected: string | undefined
  /** Where the selected masternode is, when it is on the map. */
  selectedAt: [number, number] | undefined
  /** The popup's content on wide screens; phones show it in the sheet. */
  popup: ReactNode
  inlineDetail: boolean
  /** Pixels of the map the controls cover on the left, kept clear when fitting. */
  coverLeft: number
  /** A new key refits the map to the points. */
  fitKey: string
  texts: MapTexts
  onSelect: (protx: string | undefined) => void
  onGroup: (protxs: string[]) => void
  onCity: (pick: CityPick) => void
  onFail: () => void
}

const HIGH = RADAR_MAP_STYLE.sources.lowZoomBelow
const FONT = ['Noto Sans Regular']
const kind = (k: string) => ['==', ['get', 'k'], k] as const
const { ocean, land, label, borderLine, stateLine } = RADAR_MAP_STYLE

const EMPTY = { type: 'FeatureCollection', features: [] } as const

let workerConfigured = false

/**
 * MapLibre's worker is a same-origin file (the CSP allows no blob worker). Under Trusted Types `new Worker` takes a
 * `TrustedScriptURL`, which MapLibre reads as a string first (`endsWith`, `split`), so the two are lent to it.
 */
function configureWorker() {
  if (workerConfigured) return
  workerConfigured = true
  const url = trustedWorkerUrl(new URL(workerUrl, location.href))
  const text = String(url)
  if (typeof url !== 'string') {
    Object.assign(url, {
      endsWith: (suffix: string) => text.endsWith(suffix),
      split: (separator: string | RegExp, limit?: number) => text.split(separator as string, limit),
    })
  }
  setWorkerUrl(url as unknown as string)
}

const toneMatch = (): ExpressionSpecification =>
  ['match', ['get', 'tone'], ...TONES.flatMap((t) => [t, TONE_COLOR[t]]), TONE_COLOR.other] as never

function baseStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: '/map/glyphs/{fontstack}/{range}.pbf',
    sources: {
      low: { type: 'geojson', data: '/map/world-low.json' },
      places: { type: 'geojson', data: '/map/places.json' },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': ocean.dark } },
      {
        id: 'land-low',
        type: 'fill',
        source: 'low',
        maxzoom: HIGH,
        filter: kind('land') as never,
        paint: { 'fill-color': land },
      },
      {
        id: 'border-low',
        type: 'line',
        source: 'low',
        maxzoom: HIGH,
        filter: kind('border') as never,
        paint: { 'line-color': borderLine.color, 'line-width': 0.7 },
      },
      {
        id: 'country-label',
        type: 'symbol',
        source: 'places',
        minzoom: 1.6,
        filter: ['all', kind('country'), ['<=', ['get', 'z'], ['+', ['zoom'], 1.2]]] as never,
        layout: {
          'text-field': ['get', 'n'],
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10.5, 6, 14],
          'text-max-width': 7,
          'text-letter-spacing': 0.04,
          'text-padding': 6,
        },
        paint: {
          'text-color': label.color,
          'text-halo-color': label.haloColor,
          'text-halo-width': label.haloWidth,
          'text-opacity': label.haloOpacity.countries,
        },
      },
      {
        id: 'city-label',
        type: 'symbol',
        source: 'places',
        minzoom: 4.5,
        filter: ['all', kind('city'), ['<=', ['get', 'z'], ['zoom']]] as never,
        layout: {
          'text-field': ['get', 'n'],
          'text-font': FONT,
          'text-size': 11,
          'text-padding': 4,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.6,
        },
        paint: {
          'text-color': label.color,
          'text-halo-color': label.haloColor,
          'text-halo-width': label.haloWidth,
          'text-opacity': label.haloOpacity.cities,
        },
      },
    ],
  }
}

/** The detailed file (lakes, state lines) is fetched only once someone zooms in. */
function addDetail(map: GLMap) {
  if (map.getSource('high')) return
  map.addSource('high', { type: 'geojson', data: '/map/world-high.json' })
  const before = 'country-label'
  map.addLayer(
    {
      id: 'land-high',
      type: 'fill',
      source: 'high',
      minzoom: HIGH,
      filter: kind('land') as never,
      paint: { 'fill-color': land },
    },
    before,
  )
  map.addLayer(
    {
      id: 'lake',
      type: 'fill',
      source: 'high',
      minzoom: HIGH,
      filter: kind('lake') as never,
      paint: { 'fill-color': ocean.dark },
    },
    before,
  )
  map.addLayer(
    {
      id: 'state',
      type: 'line',
      source: 'high',
      minzoom: HIGH,
      filter: kind('state') as never,
      paint: { 'line-color': stateLine.color, 'line-width': stateLine.width },
    },
    before,
  )
  map.addLayer(
    {
      id: 'border-high',
      type: 'line',
      source: 'high',
      minzoom: HIGH,
      filter: kind('border') as never,
      paint: {
        'line-color': borderLine.color,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 8, 1.4],
      },
    },
    before,
  )
}

const collection = (features: object[]) => ({ type: 'FeatureCollection' as const, features })
const feature = (lon: number, lat: number, properties: Record<string, unknown>) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [lon, lat] },
  properties,
})

const mnData = (points: MapPoint[]) =>
  collection(points.map((p) => feature(p.lon, p.lat, { protx: p.protx, tone: p.tone, evo: p.evo })))
const nodeData = (geo: GeoPoint[]) =>
  collection(
    geo.map((p, i) => feature(p.lon, p.lat, { i, nodes: p.nodes, masternodes: p.masternodes })),
  )

const compact = (n: number) =>
  n < 1000 ? formatInt(n) : formatNumber(n, { notation: 'compact', maximumFractionDigits: 1 })

function donut(
  segments: [Tone, number][],
  total: number,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const size = Math.round(26 + Math.min(30, Math.sqrt(total) * 1.6))
  let at = 0
  const stops = segments
    .filter(([, n]) => n > 0)
    .map(([tone, n]) => {
      const end = at + (n / total) * 100
      const stop = `${TONE_COLOR[tone]} ${at.toFixed(2)}% ${end.toFixed(2)}%`
      at = end
      return stop
    })
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'rx-map-donut'
  button.setAttribute('aria-label', label)
  button.title = label
  button.dataset.donut = ''
  button.dataset.count = String(total)
  button.style.width = `${size}px`
  button.style.height = `${size}px`
  button.style.background = `conic-gradient(${stops.join(', ')})`
  const count = document.createElement('span')
  count.textContent = compact(total)
  button.append(count)
  button.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  return button
}

function pingMarker(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'rx-map-selected'
  el.dataset.selected = ''
  for (const tag of ['i', 'i', 'i', 'b']) el.append(document.createElement(tag))
  return el
}

export default function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GLMap | null>(null)
  const [ready, setReady] = useState(false)
  const [clusters, setClusters] = useState<string[]>([])
  const reduced = useReducedMotion()
  const latest = useRef(props)
  const reducedRef = useRef(reduced)
  useEffect(() => {
    latest.current = props
    reducedRef.current = reduced
  })
  const popupRef = useRef<Popup | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const [holder] = useState(() => document.createElement('div'))
  const shown = useRef<string | undefined>(undefined)
  const fitted = useRef<string | undefined>(undefined)
  const donuts = useRef(new Map<string, Marker>())

  const refreshRef = useRef<(reset?: boolean) => void>(() => undefined)

  useEffect(() => {
    const el = container.current
    if (!el) return
    configureWorker()
    const t0 = latest.current.texts
    let map: GLMap
    try {
      map = new GLMap({
        container: el,
        style: baseStyle(),
        center: [12, 30],
        zoom: 1.4,
        minZoom: 0.8,
        maxZoom: 9,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
        attributionControl: false,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        locale: {
          'NavigationControl.ZoomIn': t0.zoomIn,
          'NavigationControl.ZoomOut': t0.zoomOut,
        },
      })
    } catch {
      latest.current.onFail()
      return
    }
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    const canvas = map.getCanvas()
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', t0.map)
    map.on('zoom', () => {
      if (map.isStyleLoaded() && map.getZoom() >= HIGH - 0.6) addDetail(map)
    })
    const zoomed = () => {
      el.dataset.zoom = map.getZoom().toFixed(1)
    }
    map.on('moveend', zoomed)
    zoomed()

    map.on('error', (e) => {
      if (e.error && /webgl/i.test(String(e.error.message))) latest.current.onFail()
    })

    const clusterFeatures = (source: 'mn' | 'nodes') =>
      map.querySourceFeatures(
        source,
        source === 'mn' ? { filter: ['has', 'point_count'] } : undefined,
      )

    async function zoomInto(
      source: string,
      id: number,
      center: [number, number],
      atBottom: () => void,
    ) {
      const zoom = await map.getSource<GeoJSONSource>(source)!.getClusterExpansionZoom(id)
      if (zoom > map.getMaxZoom()) {
        atBottom()
        return
      }
      map.easeTo({ center, zoom, duration: reducedRef.current ? 0 : 450 })
      if (document.activeElement?.matches('.rx-map-donut:focus-visible')) map.getCanvas().focus()
    }

    const refresh = (reset = false) => {
      const p = latest.current
      if (reset) {
        for (const m of donuts.current.values()) m.remove()
        donuts.current = new Map()
      }
      const source = p.layer
      if (!map.getSource(source) || !map.isSourceLoaded(source)) return
      const next = new Map<string, Marker>()
      const texts: string[] = []
      for (const f of clusterFeatures(source) as MapGeoJSONFeature[]) {
        const props = (f.properties ?? {}) as Record<string, number | boolean>
        const coords = (f.geometry as { coordinates: number[] }).coordinates as [number, number]
        const id = props.cluster ? `c${String(props.cluster_id)}` : `p${String(props.i)}`
        if (next.has(id)) continue
        const marker =
          donuts.current.get(id) ??
          new Marker({ element: source === 'mn' ? mnDonut(f, coords) : nodeDonut(f, coords) })
            .setLngLat(coords)
            .addTo(map)
        next.set(id, marker)
        texts.push(marker.getElement().getAttribute('aria-label') ?? '')
      }
      for (const [id, m] of donuts.current) if (!next.has(id)) m.remove()
      donuts.current = next
      setClusters((prev) => {
        const nextTexts = texts.slice(0, 40)
        return prev.length === nextTexts.length && prev.every((v, i) => v === nextTexts[i])
          ? prev
          : nextTexts
      })
    }
    refreshRef.current = refresh

    function mnDonut(f: MapGeoJSONFeature, coords: [number, number]) {
      const p = latest.current
      const c = f.properties as Record<string, number>
      const parts = p.order
        .map((key) => ({ key, count: c[p.toneOf(key)] ?? 0 }))
        .filter((x) => x.count)
      const tones = [...new Set(p.order.map(p.toneOf))]
      return donut(
        tones.map((t) => [t, c[t] ?? 0] as [Tone, number]),
        c.point_count ?? 0,
        p.texts.mnCluster(c.point_count ?? 0, parts),
        () => {
          const id = c.cluster_id ?? 0
          void zoomInto('mn', id, coords, () => {
            void map
              .getSource<GeoJSONSource>('mn')!
              .getClusterLeaves(id, Infinity, 0)
              .then((leaves: { properties?: Record<string, unknown> | null }[]) => {
                latest.current.onGroup(leaves.map((l) => String(l.properties?.protx)))
              })
          })
        },
      )
    }

    function nodeDonut(f: MapGeoJSONFeature, coords: [number, number]) {
      const p = latest.current
      const c = f.properties as Record<string, number>
      const nodes = c.nodes ?? 0
      const masternodes = c.masternodes ?? 0
      const pick = (): CityPick => ({
        point: c.cluster ? null : (latest.current.geo[c.i ?? 0] ?? null),
        nodes,
        masternodes,
      })
      return donut(
        [
          ['s2', masternodes],
          ['evo', nodes - masternodes],
        ],
        nodes,
        p.texts.nodeCluster(nodes, masternodes),
        () => {
          if (c.cluster) {
            void zoomInto('nodes', c.cluster_id ?? 0, coords, () => {
              latest.current.onCity(pick())
            })
          } else latest.current.onCity(pick())
        },
      )
    }

    map.once('load', () => {
      map.addSource('mn', {
        type: 'geojson',
        data: mnData([]),
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 9,
        clusterProperties: Object.fromEntries(
          TONES.map((t) => [t, ['+', ['case', ['==', ['get', 'tone'], t], 1, 0]]]),
        ),
      })
      map.addLayer({
        id: 'mn-point',
        type: 'circle',
        source: 'mn',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': toneMatch(),
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1,
            ['case', ['get', 'evo'], 4.5, 3.5],
            8,
            ['case', ['get', 'evo'], 8, 6.5],
          ],
          'circle-stroke-color': land,
          'circle-stroke-width': 1.5,
        },
      })
      map.addSource('nodes', {
        type: 'geojson',
        data: nodeData([]),
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 9,
        clusterProperties: {
          nodes: ['+', ['get', 'nodes']],
          masternodes: ['+', ['get', 'masternodes']],
        },
      })
      map.addLayer({
        id: 'nodes-anchor',
        type: 'circle',
        source: 'nodes',
        paint: { 'circle-radius': 0, 'circle-opacity': 0 },
      })
      map.on('click', 'mn-point', (e) => {
        const protx = e.features?.[0]?.properties.protx as string | undefined
        if (protx) {
          shown.current = protx
          latest.current.onSelect(protx)
        }
      })
      map.on('mouseenter', 'mn-point', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'mn-point', () => {
        map.getCanvas().style.cursor = ''
      })
      let last = 0
      map.on('render', () => {
        const now = performance.now()
        if (now - last > 120) {
          last = now
          refresh()
        }
      })
      map.on('idle', () => {
        refresh()
      })
      el.dataset.ready = ''
      setReady(true)
    })

    const donutMap = donuts.current
    return () => {
      popupRef.current?.remove()
      markerRef.current?.remove()
      popupRef.current = null
      markerRef.current = null
      for (const m of donutMap.values()) m.remove()
      donutMap.clear()
      map.remove()
      mapRef.current = null
      refreshRef.current = () => undefined
      shown.current = undefined
      fitted.current = undefined
    }
  }, [])

  const { layer, points, geo, order, toneOf, fitKey } = props
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const mn = map.getSource<GeoJSONSource>('mn')
    const nodes = map.getSource<GeoJSONSource>('nodes')
    void mn?.setData(mnData(layer === 'mn' ? points : []))
    void nodes?.setData(layer === 'nodes' ? nodeData(geo) : EMPTY)
    refreshRef.current(true)
  }, [ready, layer, points, geo, order, toneOf])

  const hasData = layer === 'mn' ? points.length > 0 : geo.length > 0
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !hasData || fitted.current === fitKey) return
    fitted.current = fitKey
    if (latest.current.selected) return
    const b = new LngLatBounds()
    const coords: [number, number][] =
      latest.current.layer === 'mn'
        ? latest.current.points.map((p) => [p.lon, p.lat])
        : latest.current.geo.map((p) => [p.lon, p.lat])
    for (const c of coords) b.extend(c)
    const wide = isWide()
    const cover = latest.current.coverLeft
    map.fitBounds(b, {
      padding: wide ? { top: 60, bottom: 60, left: cover + 20, right: 70 } : 30,
      maxZoom: 5,
      duration: 0,
    })
  }, [ready, hasData, fitKey])

  const { selected, selectedAt, inlineDetail, popup } = props
  const [lon, lat] = selectedAt ?? []
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const oldPopup = popupRef.current
    popupRef.current = null
    oldPopup?.remove()
    markerRef.current?.remove()
    markerRef.current = null
    if (!selected || lon === undefined || lat === undefined) return
    markerRef.current = new Marker({ element: pingMarker() }).setLngLat([lon, lat]).addTo(map)
    if (shown.current !== selected) {
      shown.current = selected
      const options = { center: [lon, lat] as [number, number], zoom: Math.max(map.getZoom(), 6) }
      if (reducedRef.current) map.jumpTo(options)
      else map.easeTo({ ...options, duration: 400 })
    }
    if (!inlineDetail) {
      const p = new Popup({
        offset: 12,
        maxWidth: '320px',
        className: 'rx-map-popup',
        focusAfterOpen: false,
      })
        .setLngLat([lon, lat])
        .setDOMContent(holder)
        .addTo(map)
      p.on('close', () => {
        if (popupRef.current === p) {
          popupRef.current = null
          shown.current = undefined
          latest.current.onSelect(undefined)
        }
      })
      popupRef.current = p
    }
  }, [ready, selected, lon, lat, inlineDetail, holder])

  const { texts } = props
  return (
    <>
      <div
        ref={container}
        className="rx-map-canvas"
        data-map-view
        role="region"
        aria-label={texts.map}
      />
      <ul className="dh-sr" aria-label={texts.clusterList} data-map-clusters>
        {clusters.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      {selected && !inlineDetail ? createPortal(popup, holder) : null}
    </>
  )
}
