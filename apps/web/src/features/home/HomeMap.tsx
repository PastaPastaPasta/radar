import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import type { RadarGeo } from '@/data/radar/schemas'
import { useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { SourceLine } from '@/ui'
import {
  projectWorld as project,
  useWorldLand as useLand,
  WORLD_HEIGHT as HEIGHT,
  WORLD_WIDTH as WIDTH,
} from '@/ui/world-map'

type Point = RadarGeo['points'][number]

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
  const off = useDecentralizedOnly()
  const geo = useQuery({ ...radarQueries.geo(net), enabled: !isDevnet(net) && !off })
  const land = useLand()
  const points = useMemo(
    () =>
      (geo.data?.data.points ?? []).filter((p) => p.nodes > 0).sort((a, b) => b.nodes - a.nodes),
    [geo.data],
  )
  const places = useMemo(
    () => points.filter((p) => p.masternodes > 0).sort((a, b) => b.masternodes - a.masternodes),
    [points],
  )
  const masternodes = places.reduce((n, p) => n + p.masternodes, 0)
  // Radar's geo counts every registered masternode's address that answered, PoSe-banned ones too, so it is more than
  // the enabled masternodes the hero and /map count.
  const scope = t`PoSe-banned included`
  const summary =
    points.length > 0
      ? t`${formatInt(masternodes)} answering masternodes in ${formatInt(places.length)} places`
      : t`The node map`

  return (
    <div className="rx-hero__map" data-map={points.length > 0 ? 'nodes' : 'land'}>
      <svg
        className="rx-map"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          points.length > 0
            ? t`Map of the world with a disc for each place Radar found masternodes. ${summary}, ${scope}.`
            : t`Map of the world with a disc for each place Radar found masternodes. ${summary}.`
        }
      >
        {land ? <path className="land" d={land} /> : null}
        <g>
          {[...points].reverse().map((p) => {
            const [x, y] = project(p.lon, p.lat)
            return (
              <g key={`${p.lat},${p.lon}`}>
                <title>
                  {place(p)}: {t`${formatInt(p.masternodes)} masternodes`}
                </title>
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
      {points.length > 0 ? (
        <>
          <div className="rx-maplegend" data-src-hover>
            <span className="rx-maplegend__key">
              <i className="d" aria-hidden="true" />
              <span className="rx-maplegend__sum">{summary}</span>
            </span>
            <span className="rx-maplegend__scope" data-map-scope>
              {scope}
            </span>
            <span className="rx-maplegend__key rx-maplegend__key--other">
              <i className="d d--all" aria-hidden="true" />
              <span className="rx-maplegend__long">{t`Other reachable addresses`}</span>
              <span className="rx-maplegend__short">{t`Other addresses`}</span>
            </span>
            {geo.data ? (
              <span className="rx-fig__src">
                <SourceLine stamp={stampOf(geo.data)} compact />
              </span>
            ) : null}
          </div>
          <ul className="dh-sr" aria-label={t`Places with the most masternodes`}>
            {places.slice(0, 8).map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                {place(p)}: {t`${formatInt(p.masternodes)} masternodes`}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
