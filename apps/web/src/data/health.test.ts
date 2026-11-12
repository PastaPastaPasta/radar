import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BudgetSnapshot } from './dapi-core/budget'
import { createHealthRegistry } from './health'

const START = 1_000_000

function setup() {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  const reg = createHealthRegistry()
  const advance = (ms: number) => vi.advanceTimersByTime(ms)
  return { reg, advance }
}

afterEach(() => vi.useRealTimers())

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
    expect(h.lastOkAt).toBe(START)
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

  it('is down on a failing call with no success in 120 s', () => {
    const { reg, advance } = setup()
    reg.report('mainnet', 'radar', ok())
    advance(121_000)
    reg.report('mainnet', 'radar', fail('network'))
    expect(reg.get('mainnet', 'radar').state).toBe('down')
    reg.report('mainnet', 'radar', ok())
    expect(reg.get('mainnet', 'radar').state).not.toBe('down')
  })

  it('is down on the first failure of a source that has never answered', () => {
    const { reg } = setup()
    reg.report('mainnet', 'radar', fail('timeout'))
    expect(reg.get('mainnet', 'radar').state).toBe('down')
  })

  it('does not go down on a lone failure inside 120 s of a success', () => {
    const { reg, advance } = setup()
    reg.report('mainnet', 'radar', ok())
    advance(60_000)
    reg.report('mainnet', 'radar', fail('network'))
    expect(reg.get('mainnet', 'radar').state).not.toBe('down')
  })

  it('does not go down on failures of other kinds when nothing has succeeded', () => {
    const { reg } = setup()
    reg.report('mainnet', 'radar', fail('rate-limited'))
    reg.report('mainnet', 'radar', fail('invalid-response'))
    expect(reg.get('mainnet', 'radar').state).toBe('degraded')
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
    expect(reg.get('mainnet', 'pe').state).toBe('degraded')
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
    reg.setLag('mainnet', 'hyphen', { blocks: 6, detail: 'indexed to block 10' })
    expect(reg.get('mainnet', 'hyphen').state).toBe('ok')
    reg.setLag('mainnet', 'hyphen', { blocks: 7, detail: 'indexed to block 10 (7 behind)' })
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

  it('judges both indexes by the page rule: stale past 6, fresh again at 2, and unmoved by a probe with nothing to measure', () => {
    const { reg } = setup()
    for (const source of ['hyphen', 'insight'] as const) {
      reg.report('testnet', source, ok())
      reg.setLag('testnet', source, { blocks: 7, detail: 'x' })
      expect(reg.get('testnet', source)).toMatchObject({ state: 'stale', index: 'stale' })
      for (const behind of [6, 4, 3]) {
        reg.setLag('testnet', source, { blocks: behind, detail: 'x' })
        expect(reg.get('testnet', source).state).toBe('stale')
      }
      reg.setLag('testnet', source, { detail: 'indexed to block 10' })
      expect(reg.get('testnet', source).state).toBe('stale')
      reg.setLag('testnet', source, { blocks: 2, detail: 'x' })
      expect(reg.get('testnet', source)).toMatchObject({ state: 'ok', index: 'fresh' })
      reg.setLag('testnet', source, { blocks: 5, detail: 'x' })
      expect(reg.get('testnet', source).state).toBe('ok')
    }
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

describe('DAPI health counts nodes, not attempts', () => {
  const failAt = (node: string, nodes: number, kind: 'network' | 'timeout' = 'network') => ({
    ok: false,
    kind,
    node,
    nodes,
  })

  it('stays up while only some nodes have failed, however many attempts that took', () => {
    const { reg } = setup()
    reg.report('mainnet', 'dapi', ok())
    for (let i = 0; i < 10; i++) reg.report('mainnet', 'dapi', failAt(`n${i % 3}`, 30))
    expect(reg.get('mainnet', 'dapi').state).not.toBe('down')
  })

  it('goes down when 16 distinct nodes have failed since the last answer', () => {
    const { reg } = setup()
    reg.report('mainnet', 'dapi', ok())
    for (let i = 0; i < 15; i++) reg.report('mainnet', 'dapi', failAt(`n${i}`, 30))
    expect(reg.get('mainnet', 'dapi').state).not.toBe('down')
    reg.report('mainnet', 'dapi', failAt('n15', 30))
    expect(reg.get('mainnet', 'dapi').state).toBe('down')
    reg.report('mainnet', 'dapi', ok())
    expect(reg.get('mainnet', 'dapi').state).not.toBe('down')
  })

  it('goes down on a devnet when its few nodes have all failed', () => {
    const { reg } = setup()
    reg.report('devnet-x', 'dapi', ok())
    reg.report('devnet-x', 'dapi', failAt('a', 2))
    expect(reg.get('devnet-x', 'dapi').state).not.toBe('down')
    reg.report('devnet-x', 'dapi', failAt('b', 2, 'timeout'))
    expect(reg.get('devnet-x', 'dapi').state).toBe('down')
  })

  it('forgets failures after two minutes', () => {
    const { reg, advance } = setup()
    reg.report('devnet-x', 'dapi', ok())
    reg.report('devnet-x', 'dapi', failAt('a', 2))
    advance(121_000)
    reg.report('devnet-x', 'dapi', failAt('b', 2))
    expect(reg.get('devnet-x', 'dapi').state).not.toBe('down')
  })
})

describe('health registry over time', () => {
  it('notifies when the invalid-response memory ends with no new call', () => {
    const { reg, advance } = setup()
    reg.report('mainnet', 'pe', ok())
    reg.report('mainnet', 'pe', fail('invalid-response'))
    for (let i = 0; i < 20; i++) reg.report('mainnet', 'pe', ok())
    const cb = vi.fn()
    reg.subscribe(cb)

    advance(5 * 60_000)
    expect(cb).not.toHaveBeenCalled()
    expect(reg.get('mainnet', 'pe').state).toBe('degraded')
    advance(1)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(reg.get('mainnet', 'pe').state).toBe('ok')
  })

  it('notifies when 120 s of silence turns a failing source down', () => {
    const { reg, advance } = setup()
    reg.report('mainnet', 'hyphen', ok())
    reg.report('mainnet', 'hyphen', fail('network'))
    expect(reg.get('mainnet', 'hyphen').state).not.toBe('down')
    const cb = vi.fn()
    reg.subscribe(cb)

    advance(120_000)
    expect(cb).not.toHaveBeenCalled()
    advance(1)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(reg.get('mainnet', 'hyphen').state).toBe('down')
  })

  it('schedules nothing once the boundary has passed or a success supersedes it', () => {
    const { reg, advance } = setup()
    reg.report('mainnet', 'hyphen', ok())
    reg.report('mainnet', 'hyphen', fail('network'))
    reg.report('mainnet', 'hyphen', ok())
    const cb = vi.fn()
    reg.subscribe(cb)
    advance(10 * 60_000)
    expect(cb).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns the same snapshot between notifications even as the clock moves', () => {
    const { reg } = setup()
    reg.report('mainnet', 'pe', ok())
    reg.report('mainnet', 'pe', fail('invalid-response'))
    const a = reg.get('mainnet', 'pe')
    vi.setSystemTime(START + 60 * 60_000)
    expect(reg.get('mainnet', 'pe')).toBe(a)
    expect(a.state).toBe('degraded')
  })

  it('stops its timer on reset', () => {
    const { reg } = setup()
    reg.report('mainnet', 'pe', ok())
    reg.report('mainnet', 'pe', fail('invalid-response'))
    expect(vi.getTimerCount()).toBe(1)
    reg.reset()
    expect(vi.getTimerCount()).toBe(0)
  })
})
