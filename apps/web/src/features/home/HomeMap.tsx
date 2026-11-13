import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import type { RadarGeo } from '@/data/radar/schemas'
import { useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { SourceLine } from '@/ui'

type Point = RadarGeo['points'][number]

const WIDTH = 1000
const HEIGHT = 425.2
const TOP = 11.796436682503357

const A1 = 1.340264
const A2 = -0.081106
const A3 = 0.000893
const A4 = 0.003796
const M = Math.sqrt(3) / 2

/** Equal Earth, scaled to the land layer's 1000-unit-wide box. */
export function project(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180
  const t = Math.asin(M * Math.sin((lat * Math.PI) / 180))
  const t2 = t * t
  const t6 = t2 * t2 * t2
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
  return [((x + 2.7064) / 5.4128) * WIDTH, ((1.3173 - y) / 2.6346) * 487 - TOP]
}

let landPromise: Promise<string> | undefined

/** The dot-matrix land is ~50 kB of path data: it loads after the page, so the hero never waits for it. */
function useLand(): string | undefined {
  const [land, setLand] = useState<string>()
  useEffect(() => {
    let cancelled = false
    landPromise ??= import('./map-land').then((m) => m.LAND_PATH)
    void landPromise.then((d) => {
      if (!cancelled) setLand(d)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return land
}

function radius(n: number): number {
  return 2 + Math.sqrt(n) * 0.85
}

function place(p: Point): string {
  return [p.city, p.country].filter(Boolean).join(', ')
}

/** The home hero's dot-matrix world map: one disc per city the crawl found masternodes in, sized by how many. */
export function HomeMap() {
  const { t } = useLingui()
  const net = useNetwork()
  const devnet = isDevnet(net)
  const off = useDecentralizedOnly()
  const geo = useQuery({ ...radarQueries.geo(net), enabled: !devnet && !off })
  const land = useLand()
  const points = useMemo(
    () =>
      [...(geo.data?.data.points ?? [])]
        .filter((p) => p.nodes > 0)
        .sort((a, b) => b.nodes - a.nodes),
    [geo.data],
  )
  const masternodes = points.reduce((n, p) => n + p.masternodes, 0)
  const top = points.find((p) => p.masternodes > 0)
  const [tx, ty] = top ? project(top.lon, top.lat) : [0, 0]
  const txShare = tx / WIDTH
  const summary =
    points.length > 0
      ? t`${formatInt(masternodes)} masternodes in ${formatInt(points.length)} places`
      : t`The node map`

  return (
    <div className="rx-scope__map" data-map={points.length > 0 ? 'nodes' : 'land'}>
      <svg
        className="rx-map"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t`Map of the world with a disc for each place Radar found masternodes. ${summary}.`}
      >
        {land ? <path className="land" d={land} /> : null}
        <g>
          {[...points].reverse().map((p) => {
            const [x, y] = project(p.lon, p.lat)
            return (
              <g key={`${p.lat},${p.lon}`}>
                <circle
                  className="mn mn--all"
                  cx={x.toFixed(1)}
                  cy={y.toFixed(1)}
                  r={radius(p.nodes).toFixed(2)}
                />
                {p.masternodes > 0 ? (
                  <circle
                    className="mn"
                    cx={x.toFixed(1)}
                    cy={y.toFixed(1)}
                    r={radius(p.masternodes).toFixed(2)}
                  />
                ) : null}
              </g>
            )
          })}
        </g>
      </svg>
      {top ? (
        <div
          className="rx-callout"
          data-layer="network"
          style={{
            left: `${txShare * 100}%`,
            top: `${(ty / HEIGHT) * 100}%`,
            transform:
              txShare < 0.4 ? 'translate(12px, -50%)' : 'translate(calc(-100% - 12px), -50%)',
          }}
        >
          <b>{place(top)}</b>
          <span>{t`${formatInt(top.masternodes)} masternodes, the most of any place`}</span>
        </div>
      ) : null}
      <div className="rx-maplegend">
        {points.length > 0 ? (
          <>
            <span className="rx-maplegend__key">
              <i className="d" aria-hidden="true" />
              <span className="rx-maplegend__long">{t`Masternodes`}</span>
            </span>
            <span className="rx-maplegend__key rx-maplegend__key--other">
              <i className="d d--all" aria-hidden="true" />
              <span className="rx-maplegend__long">{t`Other reachable nodes`}</span>
              <span className="rx-maplegend__short">{t`Other nodes`}</span>
            </span>
            <span className="rx-maplegend__sum">
              <span className="rx-maplegend__full">{summary}</span>
              <span className="rx-maplegend__brief">{t`${formatInt(masternodes)} masternodes`}</span>
            </span>
          </>
        ) : devnet ? (
          <span>{t`Radar doesn't crawl devnets, so there is nothing to map.`}</span>
        ) : off ? (
          <span data-unavailable="mode">
            {t`The node map needs Radar's crawler, which Decentralized only mode doesn't use.`}
          </span>
        ) : geo.isError ? (
          <span>{t`Radar isn't answering, so the map shows no nodes.`}</span>
        ) : null}
        {geo.data ? <SourceLine stamp={stampOf(geo.data)} compact /> : null}
      </div>
      {points.length > 0 ? (
        <ul className="dh-sr" aria-label={t`Places with the most masternodes`}>
          {points.slice(0, 8).map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              {place(p)}: {t`${formatInt(p.masternodes)} masternodes`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
