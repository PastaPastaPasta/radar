import { useLingui } from '@lingui/react/macro'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatInt } from '@/lib/format'
import { SegFilter } from '@/ui'
import { projectWorld, useWorldLand } from '@/ui/world-map'
import { discPx, placeLabels, smallestToScale, type Place } from './map-model'
import { inBox, regionBox, REGIONS, type Region } from './regions'

export interface PlaceMapProps {
  places: readonly Place[]
  region: Region
  onRegion: (region: Region) => void
  selected: string | undefined
  /** Where the masternode the address names is, ringed: on its city's disc when it is counted, or on its own spot. */
  marked: { lon: number; lat: number; place: string | undefined } | undefined
  onSelect: (id: string) => void
  placeName: (p: Place) => string
  /** "671 masternodes". */
  count: (n: number) => string
  share: (n: number) => string
  /** One sentence for screen readers: what the map shows. */
  summary: string
  /** Most labels to draw on a wide map. */
  labels: number
}

/** Before the map is measured, as wide as it is on a desktop. */
const GUESS_PX = 820

/** The ring round a masternode that no counted disc stands for: its own spot. */
const MIN_RING_PX = 3

function useWidth(ref: React.RefObject<Element | null>): number {
  const [w, setW] = useState(GUESS_PX)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const now = el.getBoundingClientRect().width
      if (now > 0) setW(now)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [ref])
  return w
}

/**
 * The dot-matrix world with one disc per city, its area by how many nodes run there. Nothing on it can be reached
 * only by pointer: the list beside it holds every place, and the discs repeat what it says.
 */
export function PlaceMap({
  places,
  region,
  onRegion,
  selected,
  marked,
  onSelect,
  placeName,
  count,
  share,
  summary,
  labels,
}: PlaceMapProps) {
  const { t } = useLingui()
  const land = useWorldLand()
  const frame = useRef<HTMLDivElement>(null)
  const px = useWidth(frame)
  const box = regionBox(region)
  const zoomed = region !== 'world'
  /** Map units per screen pixel. */
  const unit = box.w / px
  const scale = (zoomed ? 1.25 : 1) * (box.w / 1000)
  /** A disc's radius in map units: its area follows the count, down to the smallest size that stays visible. */
  const radius = (n: number) => discPx(n, unit, scale) * unit
  const smallest = smallestToScale(unit, scale)
  const [hover, setHover] = useState<string>()

  const discs = useMemo(
    () =>
      places.map((p) => {
        const [x, y] = projectWorld(p.lon, p.lat)
        return { p, x, y }
      }),
    [places],
  )
  const font = (px < 520 ? 11.5 : 12.5) * unit
  const placed = useMemo(() => {
    const boxes = discs
      .filter((d) => inBox(box, d.x, d.y))
      .map((d) => {
        const text = `${d.p.city ?? d.p.country ?? ''} ${formatInt(d.p.n)}`
        return {
          id: d.p.id,
          x: d.x,
          y: d.y,
          r: radius(d.p.n),
          w: text.length * font * 0.56 + font * 0.4,
          h: font * 1.25,
        }
      })
    const max = px < 520 ? Math.min(labels, 4) : labels
    return new Map(placeLabels(boxes, box, max).map((l) => [l.id, l]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `box` follows `region`
  }, [discs, region, scale, font, labels, px])

  const tip = hover ? discs.find((d) => d.p.id === hover) : undefined
  const selectedDisc = selected ? discs.find((d) => d.p.id === selected) : undefined
  const markedDisc = marked?.place ? discs.find((d) => d.p.id === marked.place) : undefined
  const mark = markedDisc
    ? { x: markedDisc.x, y: markedDisc.y, r: radius(markedDisc.p.n) }
    : marked
      ? (() => {
          const [x, y] = projectWorld(marked.lon, marked.lat)
          return { x, y, r: MIN_RING_PX * unit }
        })()
      : undefined
  const regionLabels: Record<Region, string> = {
    world: t`World`,
    europe: t`Europe`,
    americas: t`Americas`,
    asia: t`Asia and Oceania`,
  }

  return (
    <figure className="rx-pmap" data-map-figure data-region={region}>
      <div className="rx-pmap__tools">
        <SegFilter
          label={t`Region`}
          options={REGIONS.map((r) => ({ id: r, label: regionLabels[r] }))}
          value={region}
          onChange={(r) => {
            onRegion(r as Region)
          }}
        />
      </div>
      <div
        ref={frame}
        className="rx-pmap__frame"
        data-map-view
        data-ready={land ? '' : undefined}
        onPointerLeave={() => {
          setHover(undefined)
        }}
      >
        <svg
          className="rx-pmap__svg"
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          role="img"
          aria-label={`${regionLabels[region]}. ${summary}`}
        >
          {land ? (
            <path className="rx-pmap__land" d={land} style={{ strokeWidth: zoomed ? 2.2 : 2.6 }} />
          ) : null}
          <g className="rx-pmap__discs">
            {discs.map(({ p, x, y }) => (
              <circle
                key={p.id}
                className="rx-pmap__disc"
                data-place={p.id}
                data-on={p.id === selected || p.id === hover ? '' : undefined}
                cx={x}
                cy={y}
                r={radius(p.n)}
                style={{ strokeWidth: 1.1 * unit }}
                onPointerEnter={() => {
                  setHover(p.id)
                }}
                onClick={() => {
                  onSelect(p.id)
                }}
              />
            ))}
          </g>
          {selectedDisc ? (
            <circle
              className="rx-pmap__ring"
              data-selected=""
              cx={selectedDisc.x}
              cy={selectedDisc.y}
              r={radius(selectedDisc.p.n) + 3 * unit}
              style={{ strokeWidth: 2 * unit }}
            />
          ) : null}
          {mark ? (
            <circle
              className="rx-pmap__ring rx-pmap__ring--node"
              data-marked={marked?.place ? 'place' : 'spot'}
              cx={mark.x}
              cy={mark.y}
              r={mark.r + 6 * unit}
              style={{ strokeWidth: 2 * unit }}
            />
          ) : null}
          <g className="rx-pmap__labels" aria-hidden="true" style={{ fontSize: font }}>
            {discs.map(({ p }) => {
              const l = placed.get(p.id)
              if (!l) return null
              return (
                <text key={p.id} x={l.x} y={l.y + font * 0.95} style={{ strokeWidth: 3 * unit }}>
                  {p.city ?? p.country} <tspan className="rx-pmap__n">{formatInt(p.n)}</tspan>
                </text>
              )
            })}
          </g>
        </svg>
        {tip && inBox(box, tip.x, tip.y) ? (
          <p
            className="rx-pmap__tip"
            role="presentation"
            data-below={tip.y - box.y < box.h * 0.3 ? '' : undefined}
            style={{
              left: `${String(((tip.x - box.x) / box.w) * 100)}%`,
              top: `${String(((tip.y - box.y) / box.h) * 100)}%`,
            }}
          >
            <b>{placeName(tip.p)}</b>
            <span>
              {count(tip.p.n)} · {share(tip.p.n)}
            </span>
          </p>
        ) : null}
      </div>
      <figcaption className="rx-pmap__key">
        <span className="rx-pmap__sizes" aria-hidden="true">
          {[10, 100, 500].map((n) => {
            const r = discPx(n, unit, scale)
            return (
              <span key={n} data-key-n={n}>
                <svg width={2 * r + 2} height={2 * r + 2}>
                  <circle className="rx-pmap__disc" cx={r + 1} cy={r + 1} r={r} />
                </svg>
                {formatInt(n)}
              </span>
            )
          })}
        </span>
        <span>
          {t`One disc per city; its area is the count. A city is where the node's IP address is registered, so it marks a data centre's region, not a building.`}
          {smallest > 1 ? (
            <>
              {' '}
              {t`At this size, cities with fewer than ${formatInt(smallest)} are drawn at the smallest size.`}
            </>
          ) : null}
        </span>
        <span className="rx-pmap__credit">
          {t`Locations: DB-IP (CC BY 4.0). Land: Natural Earth.`}
        </span>
      </figcaption>
    </figure>
  )
}
