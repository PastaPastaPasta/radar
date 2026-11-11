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
})
