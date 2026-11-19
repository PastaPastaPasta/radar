import { useEffect, useState } from 'react'

/** The dot-matrix land's box: 1000 units wide, Equal Earth. The home map and the network map share it. */
export const WORLD_WIDTH = 1000
export const WORLD_HEIGHT = 425.2
const TOP = 11.796436682503357

const A1 = 1.340264
const A2 = -0.081106
const A3 = 0.000893
const A4 = 0.003796
const M = Math.sqrt(3) / 2

/** Equal Earth, scaled to the land layer's 1000-unit-wide box. */
export function projectWorld(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180
  const t = Math.asin(M * Math.sin((lat * Math.PI) / 180))
  const t2 = t * t
  const t6 = t2 * t2 * t2
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
  return [((x + 2.7064) / 5.4128) * WORLD_WIDTH, ((1.3173 - y) / 2.6346) * 487 - TOP]
}

let landPromise: Promise<string> | undefined

/** The dot-matrix land is ~50 kB of path data: it loads after the page, so nothing waits for it. */
export function useWorldLand(): string | undefined {
  const [land, setLand] = useState<string>()
  useEffect(() => {
    let cancelled = false
    landPromise ??= import('./world-land').then((m) => m.LAND_PATH)
    void landPromise.then((d) => {
      if (!cancelled) setLand(d)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return land
}
