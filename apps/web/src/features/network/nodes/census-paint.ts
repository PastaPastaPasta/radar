type Rgb = [number, number, number]

function parseHex(color: string): Rgb | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return undefined
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
}

const toHex = (c: Rgb): string =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const mix = (a: Rgb, b: Rgb, w: number): Rgb => a.map((v, i) => v * (1 - w) + b[i]! * w) as Rgb

/** `a` moved `w` of the way to `b`, for two hex colours; `a` unchanged when either isn't one. */
export function mixHex(a: string, b: string, w: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return x && y ? toHex(mix(x, y, w)) : a
}

/** Whichever of two hex colours is lighter; `a` when either isn't one. */
export function lighterHex(a: string, b: string): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return x && y && luminance(y) > luminance(x) ? b : a
}

interface Paint {
  background: string
  color: string
}

/**
 * A segment's fill and the colour of the label written on it. The label takes whichever of the two inks reads better,
 * and the fill moves away from it in small steps until the label reaches 4.5:1, so a mid-tone slot keeps its hue.
 */
export function paintFor(fill: string, ink: string, surface: string): Paint {
  const bg = parseHex(fill)
  const dark = parseHex(ink)
  const light = parseHex(surface)
  if (!bg || !dark || !light) return { background: fill, color: ink }
  const text = contrast(bg, dark) >= contrast(bg, light) ? dark : light
  const away: Rgb = luminance(text) > luminance(bg) ? [0, 0, 0] : [255, 255, 255]
  let out = bg
  for (let w = 0.05; contrast(out, text) < 4.5 && w <= 0.6; w += 0.05) out = mix(bg, away, w)
  return { background: toHex(out), color: toHex(text) }
}
