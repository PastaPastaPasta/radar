import { describe, expect, it, vi } from 'vitest'
import type { BudgetSnapshot } from './dapi-core/budget'
import { createHealthRegistry } from './health'

function setup() {
  let now = 1_000_000
  const reg = createHealthRegistry(() => now)
  const advance = (ms: number) => {
    now += ms
  }
  return { reg, advance }
}

const ok = (latencyMs = 100) => ({ ok: true, latencyMs })
const fail = (kind: 'network' | 'timeout' | 'http' | 'invalid-response' | 'rate-limited') => ({
  ok: false,
  latencyMs: 50,
  kind,
})

describe('health registry states', () => {
  it('starts unknown', () => {
    const { reg } = setup()
    expect(reg.get('mainnet', 'pe')).toMatchObject({
      source: 'pe',
      net: 'mainnet',
      state: 'unknown',
    })
  })

  it('is ok after a success', () => {
    const { reg } = setup()
    reg.report('mainnet', 'pe', ok())
    const h = reg.get('mainnet', 'pe')
    expect(h.state).toBe('ok')
    expect(h.lastOkAt).toBe(1_000_000)
    expect(h.p50LatencyMs).toBe(100)
  })

  it('is down after 3 consecutive network, timeout or http failures, and recovers on success', () => {
    const { reg } = setup()
    reg.report('mainnet', 'hyphen', ok())
    reg.report('mainnet', 'hyphen', fail('network'))
    reg.report('mainnet', 'hyphen', fail('timeout'))
    expect(reg.get('mainnet', 'hyphen').state).not.toBe('down')
    reg.report('mainnet', 'hyphen', fail('http'))
    const h = reg.get('mainnet', 'hyphen')
    expect(h.state).toBe('down')
    expect(h.lastError).toMatchObject({ kind: 'http' })
    reg.report('mainnet', 'hyphen', ok())
    expect(reg.get('mainnet', 'hyphen').state).not.toBe('down')
  })

  it('does not count rate limits or invalid responses towards down', () => {
    const { reg } = setup()
    for (let i = 0; i < 4; i++) reg.report('mainnet', 'pe', fail('rate-limited'))
    expect(reg.get('mainnet', 'pe').state).not.toBe('down')
  })

  it('is down on two failures with no success in 120 s', () => {
    const { reg, advance } = setup()
    reg.report('mainnet', 'radar', ok())
    advance(121_000)
    reg.report('mainnet', 'radar', fail('network'))
    reg.report('mainnet', 'radar', fail('network'))
    expect(reg.get('mainnet', 'radar').state).toBe('down')
  })

  it('is degraded at 25 % failures over the last calls', () => {
    const { reg } = setup()
    for (let i = 0; i < 6; i++) reg.report('mainnet', 'pe', ok())
    reg.report('mainnet', 'pe', fail('rate-limited'))
    reg.report('mainnet', 'pe', fail('rate-limited'))
    expect(reg.get('mainnet', 'pe').state).toBe('degraded')
  })

  it('is degraded for 5 minutes after an invalid response, then ok', () => {
    const { reg, advance } = setup()
    for (let i = 0; i < 20; i++) reg.report('mainnet', 'pe', ok())
    reg.report('mainnet', 'pe', fail('invalid-response'))
    expect(reg.get('mainnet', 'pe').state).toBe('degraded')
    for (let i = 0; i < 20; i++) reg.report('mainnet', 'pe', ok())
    advance(5 * 60_000 + 1)
    expect(reg.get('mainnet', 'pe').state).toBe('ok')
  })

  it('is slow when p50 latency over the last 10 calls exceeds 3 s (5 s for dapi and sdk)', () => {
    const { reg } = setup()
    for (let i = 0; i < 10; i++) reg.report('mainnet', 'pe', ok(3500))
    for (let i = 0; i < 10; i++) reg.report('mainnet', 'dapi', ok(3500))
    for (let i = 0; i < 10; i++) reg.report('mainnet', 'sdk', ok(5500))
    expect(reg.get('mainnet', 'pe').state).toBe('slow')
    expect(reg.get('mainnet', 'dapi').state).toBe('ok')
    expect(reg.get('mainnet', 'sdk').state).toBe('slow')
  })

  it('p50 uses only the last 10 calls', () => {
    const { reg } = setup()
    for (let i = 0; i < 10; i++) reg.report('mainnet', 'pe', ok(9000))
    for (let i = 0; i < 10; i++) reg.report('mainnet', 'pe', ok(100))
    expect(reg.get('mainnet', 'pe')).toMatchObject({ state: 'ok', p50LatencyMs: 100 })
  })

  it('is stale when lag passes the per-source threshold, and stale outranks degraded and slow', () => {
    const { reg } = setup()
    reg.report('mainnet', 'hyphen', ok())
    reg.setLag('mainnet', 'hyphen', { blocks: 3, detail: 'indexed to block 10' })
    expect(reg.get('mainnet', 'hyphen').state).toBe('ok')
    reg.setLag('mainnet', 'hyphen', { blocks: 4, detail: 'indexed to block 10 (4 behind)' })
    expect(reg.get('mainnet', 'hyphen').state).toBe('stale')

    reg.report('mainnet', 'pe', ok())
    reg.setLag('mainnet', 'pe', { blocks: 10, detail: 'x' })
    expect(reg.get('mainnet', 'pe').state).toBe('ok')
    reg.setLag('mainnet', 'pe', { blocks: 11, detail: 'x' })
    expect(reg.get('mainnet', 'pe').state).toBe('stale')

    reg.report('mainnet', 'radar', ok())
    reg.setLag('mainnet', 'radar', { ms: 45 * 60_000, detail: 'x' })
    expect(reg.get('mainnet', 'radar').state).toBe('ok')
    reg.setLag('mainnet', 'radar', { ms: 45 * 60_000 + 1, detail: 'x' })
    expect(reg.get('mainnet', 'radar').state).toBe('stale')
    reg.setLag('mainnet', 'radar', undefined)
    expect(reg.get('mainnet', 'radar').state).toBe('ok')
  })

  it('down outranks stale', () => {
    const { reg } = setup()
    reg.setLag('mainnet', 'hyphen', { blocks: 99, detail: 'x' })
    for (let i = 0; i < 3; i++) reg.report('mainnet', 'hyphen', fail('network'))
    expect(reg.get('mainnet', 'hyphen').state).toBe('down')
  })

  it('dapi is degraded under tight or exhausted budget pressure', () => {
    const { reg } = setup()
    reg.report('mainnet', 'dapi', ok())
    const snap = (pressure: BudgetSnapshot['pressure']): BudgetSnapshot => ({
      pressure,
      headroom: 10,
      capacity: 100,
      benched: 0,
      usedLastMinute: 90,
    })
    reg.setBudget('mainnet', snap('ok'))
    expect(reg.get('mainnet', 'dapi').state).toBe('ok')
    reg.setBudget('mainnet', snap('tight'))
    expect(reg.get('mainnet', 'dapi')).toMatchObject({
      state: 'degraded',
      budget: { pressure: 'tight' },
    })
    reg.setBudget('mainnet', snap('exhausted'))
    expect(reg.get('mainnet', 'dapi').state).toBe('degraded')
  })

  it('keeps networks and sources apart', () => {
    const { reg } = setup()
    for (let i = 0; i < 3; i++) reg.report('mainnet', 'pe', fail('network'))
    expect(reg.get('mainnet', 'pe').state).toBe('down')
    expect(reg.get('testnet', 'pe').state).toBe('unknown')
    expect(reg.get('mainnet', 'hyphen').state).toBe('unknown')
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const { reg } = setup()
    const cb = vi.fn()
    const off = reg.subscribe(cb)
    reg.report('mainnet', 'pe', ok())
    reg.setLag('mainnet', 'pe', undefined)
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    reg.report('mainnet', 'pe', ok())
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('returns a referentially stable snapshot until something changes', () => {
    const { reg } = setup()
    reg.report('mainnet', 'pe', ok())
    const a = reg.get('mainnet', 'pe')
    expect(reg.get('mainnet', 'pe')).toBe(a)
    reg.report('mainnet', 'pe', ok(200))
    expect(reg.get('mainnet', 'pe')).not.toBe(a)
  })
})
