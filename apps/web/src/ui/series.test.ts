import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EChartsOption } from 'echarts'
import { SeriesSlots, seriesSwatches, withSeriesColors, withTokenColors } from './series'

const SLOTS = ['#1', '#2', '#3', '#4', '#5', '#6']

describe('SeriesSlots', () => {
  it('gives keys the slots in order', () => {
    const slots = new SeriesSlots().assign(['24.0.0', '23.1.10', '23.1.8'])
    expect(['24.0.0', '23.1.10', '23.1.8'].map((k) => slots.slot(k))).toEqual([1, 2, 3])
  })

  it('keeps a key in its slot when another key leaves or arrives', () => {
    const slots = new SeriesSlots().assign(['a', 'b', 'c'])
    slots.assign(['b', 'c', 'd'])
    expect(slots.slot('b')).toBe(2)
    expect(slots.slot('c')).toBe(3)
    expect(slots.slot('d')).toBe(1)
    expect(slots.slot('a')).toBeUndefined()
  })

  it('keeps a key in its slot when the order changes', () => {
    const slots = new SeriesSlots().assign(['a', 'b', 'c'])
    slots.assign(['c', 'a', 'b'])
    expect(['a', 'b', 'c'].map((k) => slots.slot(k))).toEqual([1, 2, 3])
  })

  it('never invents a seventh hue', () => {
    const slots = new SeriesSlots().assign(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(slots.slot('f')).toBe(6)
    expect(slots.slot('g')).toBeUndefined()
  })
})

describe('seriesSwatches', () => {
  it('names each series once and gives the palette slots in order of first appearance', () => {
    const swatches = seriesSwatches({
      series: [
        { type: 'bar', name: 'Shielded', data: [] },
        { type: 'bar', name: 'Unshielded', data: [] },
        { type: 'line', name: 'Shielded', data: [] },
      ],
    })
    expect(swatches).toEqual([
      { name: 'Shielded', slot: 1 },
      { name: 'Unshielded', slot: 2 },
    ])
  })

  it('keeps a colour the option chose and spends no slot on it', () => {
    const swatches = seriesSwatches({
      series: [
        { type: 'line', name: 'Passing', itemStyle: { color: 'green' }, data: [] },
        { type: 'line', name: 'All nodes', data: [] },
      ],
    })
    expect(swatches).toEqual([
      { name: 'Passing', color: 'green' },
      { name: 'All nodes', slot: 1 },
    ])
  })

  it('has nothing to say about one series or a donut', () => {
    expect(seriesSwatches({ series: [{ type: 'bar', name: 'Blocks', data: [] }] })).toEqual([])
    expect(seriesSwatches({ series: [{ type: 'pie', name: 'Share', data: [] }] })).toEqual([])
  })
})

describe('withSeriesColors', () => {
  it('draws each series in the colour its legend swatch shows', () => {
    const out = withSeriesColors(
      {
        series: [
          { type: 'bar', name: 'Shielded', data: [] },
          { type: 'bar', name: 'Unshielded', itemStyle: { borderRadius: 2 }, data: [] },
        ],
      },
      SLOTS,
    )
    expect(out.series).toMatchObject([
      { itemStyle: { color: '#1' } },
      { itemStyle: { color: '#2', borderRadius: 2 } },
    ])
  })

  it('leaves a chart with one series to the layer hue', () => {
    const option = { series: [{ type: 'bar' as const, name: 'Blocks', data: [] }] }
    expect(withSeriesColors(option, SLOTS)).toBe(option)
  })

  it('hands a donut the whole palette for slices that carry no colour', () => {
    const out = withSeriesColors({ series: [{ type: 'pie', data: [{ value: 1 }] }] }, SLOTS)
    expect(out.color).toEqual(SLOTS)
  })
})

describe('withTokenColors', () => {
  const read = (name: string) => ({ '--dh-good': '#167a46', '--dh-warn': '#94500a' })[name] ?? ''

  it('replaces a token with its value in a series and in a donut’s slices', () => {
    const option = {
      series: [
        { type: 'bar', name: 'A', itemStyle: { color: 'var(--dh-good)', borderRadius: 2 } },
        {
          type: 'pie',
          data: [
            { name: 'Funded', value: 1, itemStyle: { color: 'var(--dh-good)' } },
            { name: 'Not passing', value: 2, itemStyle: { color: 'var(--dh-warn)' } },
            { name: 'Plain', value: 3 },
          ],
        },
      ],
    } as EChartsOption
    const out = withTokenColors(option, read) as { series: Record<string, unknown>[] }
    expect(out.series[0]?.itemStyle).toEqual({ color: '#167a46', borderRadius: 2 })
    expect(out.series[1]?.data).toEqual([
      { name: 'Funded', value: 1, itemStyle: { color: '#167a46' } },
      { name: 'Not passing', value: 2, itemStyle: { color: '#94500a' } },
      { name: 'Plain', value: 3 },
    ])
  })

  it('leaves a literal colour, an unknown token and a chart without tokens alone', () => {
    const option = {
      series: [
        { type: 'line', name: 'A', lineStyle: { color: '#123456' } },
        { type: 'line', name: 'B', lineStyle: { color: 'var(--nope)' } },
      ],
    } as EChartsOption
    expect(withTokenColors(option, read)).toBe(option)
  })
})

describe('the categorical slots per theme', () => {
  const tokens = readFileSync(join(import.meta.dirname, '../styles/radar-tokens.css'), 'utf8')
  const slots = (block: string) =>
    [...block.matchAll(/--rx-s([1-6]): (#[0-9a-f]{6});/g)].map((m) => `${m[1]}=${m[2]}`)
  const blockAfter = (opening: string) => {
    const from = tokens.indexOf(opening)
    expect(from).toBeGreaterThanOrEqual(0)
    return tokens.slice(from, tokens.indexOf('\n}', from))
  }

  it('gives the dark theme the reader picks the same steps as the dark theme the system picks @W2-40', () => {
    const system = slots(blockAfter(":root:not([data-theme='light']) {"))
    const picked = slots(blockAfter(":root[data-theme='dark'] {"))
    expect(system).toHaveLength(6)
    expect(picked).toEqual(system)
    expect(picked).not.toEqual(slots(blockAfter(':root {')))
  })
})
