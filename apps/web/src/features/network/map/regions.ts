import { projectWorld, WORLD_HEIGHT, WORLD_WIDTH } from '@/ui/world-map'

export const REGIONS = ['world', 'europe', 'americas', 'asia'] as const
export type Region = (typeof REGIONS)[number]

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** Each region's longitudes and latitudes. */
const AREAS: Record<
  Exclude<Region, 'world'>,
  [lon0: number, lon1: number, lat0: number, lat1: number]
> = {
  europe: [-12, 36, 34, 64],
  americas: [-128, -32, -42, 56],
  asia: [62, 156, -44, 52],
}

const ASPECT = WORLD_WIDTH / WORLD_HEIGHT

/** The map's view of a region in the world box, widened to the map's own shape so the frame never changes size. */
export function regionBox(region: Region): ViewBox {
  if (region === 'world') return { x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT }
  const [lon0, lon1, lat0, lat1] = AREAS[region]
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= 8; i++) {
    const lon = lon0 + ((lon1 - lon0) * i) / 8
    const lat = lat0 + ((lat1 - lat0) * i) / 8
    for (const [x, y] of [
      projectWorld(lon, lat0),
      projectWorld(lon, lat1),
      projectWorld(lon0, lat),
      projectWorld(lon1, lat),
    ]) {
      xs.push(x)
      ys.push(y)
    }
  }
  let x = Math.min(...xs)
  let y = Math.min(...ys)
  let w = Math.max(...xs) - x
  let h = Math.max(...ys) - y
  if (w / h > ASPECT) {
    const nh = w / ASPECT
    y -= (nh - h) / 2
    h = nh
  } else {
    const nw = h * ASPECT
    x -= (nw - w) / 2
    w = nw
  }
  return { x, y, w, h }
}

export const inBox = (b: ViewBox, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
