import { describe, expect, it } from 'vitest'
import type { HyMetrics } from '@/data/hyphen/schemas'
import { buildOption, formatHashrate, METRICS, points } from './options'
import { rangeWindow } from './ranges'

const row = (height: number, txCount: number, extra: Partial<HyMetrics> = {}): HyMetrics => ({
  height,
  txCount,
  utxosSpendable: 10,
  utxosUnspendable: 1,
  blockchainSize: 1,
  circulatingSupply: 1_000_000_000n,
  difficulty: 2,
  hashrate: 3.4e15,
  ...extra,
})

describe('chart metrics', () => {
  it('turns the cumulative transaction count into transactions per bucket', () => {
    const p = points(METRICS.transactions, [row(10, 100), row(13, 130), row(16, 175)])
    expect(p).toEqual([
      { height: 13, value: 30 },
      { height: 16, value: 45 },
    ])
  })

  it('skips buckets with no credit pool balance', () => {
    const p = points(METRICS['credit-pool'], [row(1, 1), row(2, 2, { creditPoolBalance: 5n })])
    expect(p).toEqual([{ height: 2, value: 5 }])
  })

  it('labels money axes with the reader’s unit and the network’s ticker', () => {
    const supply = 12_000_000n * 100_000_000n
    expect(METRICS.supply.format(Number(supply))).toMatch(/DASH$/)
    expect(METRICS.supply.format(Number(supply), { unit: 'DASH', testnet: true })).toMatch(/tDASH$/)
    expect(METRICS.supply.format(Number(supply), { unit: 'mDASH', testnet: false })).toMatch(
      /mDASH$/,
    )
  })

  it('formats a hash rate in the largest fitting unit', () => {
    expect(formatHashrate(3.4357e15)).toBe('3.44 PH/s')
    expect(formatHashrate(114_846)).toBe('114.85 kH/s')
    expect(formatHashrate(12)).toBe('12 H/s')
  })

  it('builds one series with a value per point and the height as its label', () => {
    const option = buildOption(METRICS.hashrate, [{ height: 1_234, value: 5 }], 'Hash rate')
    expect(option.series).toHaveLength(1)
    expect((option.xAxis as { data: string[] }).data).toEqual(['1,234'])
  })

  it('sizes the all-time range to the chain height and waits for it', () => {
    expect(rangeWindow('all', 2_570_013)).toEqual({ blocks: 2_570_013, points: 120 })
    expect(rangeWindow('all', undefined)).toBeUndefined()
    expect(rangeWindow('1d', undefined)).toEqual({ blocks: 576, points: 96 })
  })

  describe('axis labels @HY-02 @IN-16', () => {
    const DASH = 100_000_000
    interface Axis {
      axisLabel: { formatter: (v: number) => string }
    }

    /** The ticks a value axis lays over [low, high]: multiples of a 1, 2 or 5 step, about five of them. */
    function ticks(low: number, high: number): number[] {
      const raw = (high - low) / 5
      const power = 10 ** Math.floor(Math.log10(raw))
      const step = ([1, 2, 5, 10].find((m) => m * power >= raw) ?? 10) * power
      const out: number[] = []
      for (let v = Math.ceil(low / step) * step; v <= high; v += step) out.push(v)
      return out
    }

    function labels(
      id: keyof typeof METRICS,
      values: number[],
      units?: { unit: 'DASH'; testnet: boolean },
    ) {
      const metric = METRICS[id]
      const data = values.map((value, i) => ({ height: i, value }))
      const axis = buildOption(metric, data, 'x', units).yAxis as Axis
      const low = metric.shape === 'bar' ? Math.min(0, ...values) : Math.min(...values)
      return ticks(low, Math.max(...values)).map((v) => axis.axisLabel.formatter(v))
    }

    const distinct = (l: string[]) => expect(new Set(l).size).toBe(l.length)

    it('tells the ticks of a slowly moving supply apart', () => {
      const l = labels('supply', [13_170_100 * DASH, 13_170_350 * DASH, 13_170_700 * DASH])
      distinct(l)
      expect(l.length).toBeGreaterThan(2)
    })

    it('tells the ticks of a count that barely moves apart', () => {
      const l = labels('utxos', [4_530_000, 4_531_500, 4_533_000])
      distinct(l)
      expect(l.length).toBeGreaterThan(2)
    })

    it('tells the ticks of a hash rate apart', () => {
      distinct(labels('hashrate', [3.4357e15, 3.4359e15, 3.436e15]))
    })

    it('keeps small nonzero difficulties distinct from zero', () => {
      const l = labels('difficulty', [0.0038, 0.004, 0.0042])
      distinct(l)
      expect(l.every((label) => label !== '0')).toBe(true)
    })

    it('stays short when the values span a wide range', () => {
      expect(labels('supply', [1_000_000 * DASH, 13_000_000 * DASH])).toEqual(
        expect.arrayContaining([expect.stringMatching(/^\d+ M\u00a0DASH$/)]),
      )
    })

    it('shows a small difficulty with its significant digits in tooltips and tables', () => {
      expect(METRICS.difficulty.format(0.004010969129951115)).toBe('0.004011')
    })
  })
})
