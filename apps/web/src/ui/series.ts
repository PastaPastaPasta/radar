import { useState } from 'react'
import type { EChartsOption } from 'echarts'

/** How many categorical hues there are. A seventh key is never a new hue: it folds into "Other". */
export const SERIES_SLOTS = 6

/**
 * Which slot each key draws in. Colour follows the entity: a key keeps its slot for as long as it is shown, a key that
 * leaves frees its slot, and a new key takes the lowest free one, so the keys that stay never repaint.
 */
export class SeriesSlots {
  private readonly slots = new Map<string, number>()

  /** The keys now on screen, most important first. Keys past the last free slot get none. */
  assign(keys: readonly string[]): this {
    const live = new Set(keys)
    for (const key of [...this.slots.keys()]) if (!live.has(key)) this.slots.delete(key)
    const used = new Set(this.slots.values())
    for (const key of live) {
      if (this.slots.has(key)) continue
      for (let slot = 1; slot <= SERIES_SLOTS; slot++) {
        if (used.has(slot)) continue
        this.slots.set(key, slot)
        used.add(slot)
        break
      }
    }
    return this
  }

  /** 1 to `SERIES_SLOTS`, or undefined for a key with no slot. */
  slot(key: string): number | undefined {
    return this.slots.get(key)
  }
}

/**
 * One set of slots for the life of a component, so a filter or a new reading does not repaint what stays. Nothing is
 * assigned until `ready`: the order of the keys decides the slots, so it has to be the order the page settles on, not
 * the order of a half-loaded one.
 */
export function useSeriesSlots(
  keys: readonly string[],
  ready = true,
): (key: string) => number | undefined {
  const [slots] = useState(() => new SeriesSlots())
  if (ready) slots.assign(keys)
  return (key) => slots.slot(key)
}

/** The CSS colour of a slot in the order the surrounding layer draws its series. */
export const seriesVar = (slot: number): string => `var(--rx-series-${String(slot)})`

export interface Swatch {
  name: string
  /** The colour the option gives the series itself. */
  color?: string
  /** The slot it takes from the palette when the option gives none. */
  slot?: number
}

type SeriesOption = Extract<NonNullable<EChartsOption['series']>, unknown[]>[number]

const seriesList = (option: EChartsOption): SeriesOption[] =>
  option.series === undefined ? [] : Array.isArray(option.series) ? option.series : [option.series]

const colorIn = (style: unknown): string | undefined =>
  style !== null && typeof style === 'object' && 'color' in style && typeof style.color === 'string'
    ? style.color
    : undefined

function ownColor(series: SeriesOption): string | undefined {
  const s = series as { itemStyle?: unknown; lineStyle?: unknown; areaStyle?: unknown }
  return colorIn(s.itemStyle) ?? colorIn(s.lineStyle) ?? colorIn(s.areaStyle)
}

/**
 * The named series of a chart, each once, with the colour it draws in: its own, or the next palette slot in the order
 * the names first appear. The plot and its legend both read this, so they cannot disagree. A chart with one series has
 * no swatches: its title names it and it draws in the layer's hue.
 */
export function seriesSwatches(option: EChartsOption): Swatch[] {
  const out: Swatch[] = []
  let next = 1
  for (const series of seriesList(option)) {
    if (series.type === 'pie') continue
    const name = typeof series.name === 'string' ? series.name : undefined
    if (!name || out.some((s) => s.name === name)) continue
    const color = ownColor(series)
    out.push(color ? { name, color } : { name, slot: next++ })
  }
  return out.length > 1 ? out : []
}

/** Gives every series that takes a palette slot that slot's colour, and a donut the whole palette. */
export function withSeriesColors(option: EChartsOption, slots: readonly string[]): EChartsOption {
  const all = seriesList(option)
  const swatches = seriesSwatches(option)
  const hasPie = all.some((s) => s.type === 'pie')
  if (swatches.length === 0 && !hasPie) return option
  const slotOf = new Map(swatches.flatMap((s) => (s.slot ? [[s.name, s.slot] as const] : [])))
  const series = all.map((s) => {
    const slot = typeof s.name === 'string' && !ownColor(s) ? slotOf.get(s.name) : undefined
    const color = slot === undefined ? undefined : slots[slot - 1]
    if (color === undefined) return s
    const itemStyle = (s as { itemStyle?: object }).itemStyle
    return { ...s, itemStyle: { ...itemStyle, color } }
  })
  return {
    ...option,
    ...(hasPie && option.color === undefined ? { color: [...slots] } : {}),
    series,
  }
}

const TOKEN = /^var\((--[\w-]+)\)$/

function resolved<T>(holder: T, read: (name: string) => string): T {
  if (holder === null || typeof holder !== 'object') return holder
  let out = holder
  for (const key of ['itemStyle', 'lineStyle', 'areaStyle'] as const) {
    const style = (holder as Record<string, unknown>)[key]
    const name = TOKEN.exec(colorIn(style) ?? '')?.[1]
    const value = name ? read(name) : ''
    if (value) out = { ...out, [key]: { ...(style as object), color: value } }
  }
  return out
}

/**
 * Lets a chart name a colour by its token (`itemStyle: { color: 'var(--dh-good)' }`): a canvas cannot read a custom
 * property, so each is replaced with its value where the chart stands. A status keeps one colour in the plot, its
 * tile and its badge, in both themes.
 */
export function withTokenColors(
  option: EChartsOption,
  read: (name: string) => string,
): EChartsOption {
  const all = seriesList(option)
  let changed = false
  const series = all.map((s) => {
    let next = resolved(s, read)
    const data = (s as { data?: unknown }).data
    if (Array.isArray(data)) {
      const items = data.map((d) => resolved(d as unknown, read))
      if (items.some((d, i) => d !== data[i])) next = { ...next, data: items } as typeof next
    }
    if (next !== s) changed = true
    return next
  })
  return changed ? { ...option, series } : option
}
