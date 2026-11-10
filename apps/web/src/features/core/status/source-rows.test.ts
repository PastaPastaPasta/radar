import { describe, expect, it } from 'vitest'
import type { HealthState, SourceHealth } from '@/data/health'
import type { SourceId } from '@/data/envelope'
import { offers, overallState, sourceRows } from './source-rows'

const h = (source: SourceId, state: HealthState): SourceHealth => ({
  source,
  net: 'mainnet',
  state,
})

describe('offers', () => {
  it('has DAPI and the SDK everywhere and the indexes only on mainnet and testnet', () => {
    expect(offers('devnet-ruby', 'dapi')).toBe(true)
    expect(offers('devnet-ruby', 'sdk')).toBe(true)
    for (const s of ['radar', 'pe', 'hyphen', 'rate'] as const) {
      expect(offers('devnet-ruby', s), s).toBe(false)
    }
    expect(offers('testnet', 'pe')).toBe(true)
    expect(offers('testnet', 'rate')).toBe(false)
    expect(offers('mainnet', 'rate')).toBe(true)
  })
})

describe('sourceRows', () => {
  it('lists every source in order and fills in the ones that have not been called', () => {
    const rows = sourceRows('mainnet', [h('pe', 'ok')])
    expect(rows.map((r) => r.source)).toEqual(['dapi', 'sdk', 'radar', 'pe', 'hyphen', 'rate'])
    expect(rows.find((r) => r.source === 'pe')?.health.state).toBe('ok')
    expect(rows.find((r) => r.source === 'radar')?.health.state).toBe('unknown')
  })
})

describe('overallState', () => {
  const rows = (states: Partial<Record<SourceId, HealthState>>, net = 'mainnet' as const) =>
    sourceRows(
      net,
      Object.entries(states).map(([s, st]) => h(s as SourceId, st)),
    )

  it('is down when an offered source is down', () => {
    expect(overallState(rows({ dapi: 'ok', pe: 'down' }))).toBe('down')
  })

  it('is attention for stale, degraded or slow', () => {
    expect(overallState(rows({ dapi: 'ok', hyphen: 'stale' }))).toBe('attention')
    expect(overallState(rows({ radar: 'degraded', dapi: 'ok' }))).toBe('attention')
    expect(overallState(rows({ sdk: 'slow', dapi: 'ok' }))).toBe('attention')
  })

  it('is checking until something has answered, ok after', () => {
    expect(overallState(rows({}))).toBe('checking')
    expect(overallState(rows({ dapi: 'ok' }))).toBe('ok')
  })

  it('ignores sources the network does not offer', () => {
    expect(overallState(rows({ dapi: 'ok', sdk: 'ok', pe: 'down' }, 'mainnet'))).toBe('down')
    const devnet = sourceRows('devnet-ruby', [h('dapi', 'ok'), h('pe', 'down')])
    expect(overallState(devnet)).toBe('ok')
  })
})
