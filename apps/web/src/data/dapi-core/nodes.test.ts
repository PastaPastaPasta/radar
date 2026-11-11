import { describe, expect, it } from 'vitest'
import type { NodeInfo } from './discovery'
import { MAX_IN_FLIGHT, NodePool, PER_NODE_LIMIT, SESSION, pressureOf } from './nodes'

const nodes = (n: number): NodeInfo[] =>
  Array.from({ length: n }, (_, i) => ({ url: `https://10.0.0.${i}:443`, host: `10.0.0.${i}:443` }))

function setup(n = 20, activeSize = 8) {
  const clock = { t: 1_000_000 }
  const pool = new NodePool('mainnet', nodes(n), {
    now: () => clock.t,
    random: () => 0.5,
    activeSize,
  })
  return { pool, clock }
}

describe('NodePool selection and budget', () => {
  it('keeps 8 nodes active out of the candidates', () => {
    const { pool } = setup()
    expect(pool.snapshot().capacity).toBe(8 * PER_NODE_LIMIT)
  })

  it('never lets a node take more than 50 requests in a rolling minute', () => {
    const { pool, clock } = setup(1, 1)
    for (let i = 0; i < PER_NODE_LIMIT; i++) {
      const slot = pool.pick()
      expect(slot).toBeDefined()
      pool.begin(slot!)
      pool.end(slot!)
    }
    expect(pool.pick()).toBeUndefined()
    clock.t += 59_999
    expect(pool.pick()).toBeUndefined()
    clock.t += 2
    expect(pool.pick()).toBeDefined()
  })

  it('allows at most 4 requests in flight on a node', () => {
    const { pool } = setup(1, 1)
    const slot = pool.pick()!
    for (let i = 0; i < MAX_IN_FLIGHT; i++) pool.begin(slot)
    expect(pool.pick()).toBeUndefined()
    pool.end(slot)
    expect(pool.pick()).toBe(slot)
  })

  it('prefers the node with the most headroom, then the lowest latency', () => {
    const { pool } = setup(2, 2)
    const [a, b] = [pool.pick()!, pool.pick({ exclude: new Set(['https://10.0.0.0:443']) })]
    expect(b).toBeDefined()
    pool.begin(a)
    pool.end(a)
    expect(pool.pick()).not.toBe(a)
    pool.begin(b!)
    pool.end(b!)
    pool.succeeded(a, 500, {})
    pool.succeeded(b!, 100, {})
    expect(pool.pick()).toBe(b)
  })

  it('smooths latency with an EWMA of 0.3', () => {
    const { pool } = setup(1, 1)
    const slot = pool.pick()!
    pool.succeeded(slot, 100, {})
    pool.succeeded(slot, 200, {})
    expect(slot.ewmaMs).toBeCloseTo(130)
  })

  it('treats a node as full until ratelimit-reset when the server says fewer than 30 are left', () => {
    const { pool, clock } = setup(1, 1)
    const slot = pool.pick()!
    pool.noteRate(slot, { remaining: 29, resetS: 20 })
    expect(pool.pick()).toBeUndefined()
    clock.t += 19_000
    expect(pool.pick()).toBeUndefined()
    clock.t += 1_100
    expect(pool.pick()).toBeDefined()
    pool.noteRate(slot, { remaining: 100, resetS: 20 })
    expect(pool.pick()).toBeDefined()
  })

  it('reports no more than 400 requests of headroom across 8 nodes', () => {
    const { pool } = setup()
    expect(pool.snapshot()).toMatchObject({
      pressure: 'ok',
      headroom: 400,
      capacity: 400,
      benched: 0,
      usedLastMinute: 0,
    })
  })
})

describe('benching', () => {
  it('benches for ratelimit-reset seconds, else 60 s, and brings in a replacement', () => {
    const { pool, clock } = setup()
    const slot = pool.pick()!
    pool.benchRateLimited(slot, { resetS: 12 })
    expect(slot.benchedUntil).toBe(clock.t + 12_000)
    expect(pool.snapshot().capacity).toBe(400)
    expect(pool.snapshot().benched).toBe(1)
    const other = pool.pick({ exclude: new Set() })!
    pool.benchRateLimited(other, {})
    expect(other.benchedUntil).toBe(clock.t + 60_000)
  })

  it('rests an unreachable node 1, 5, then 10 minutes, and comes back for it after', () => {
    const { pool, clock } = setup()
    const slot = pool.pick()!
    pool.benchUnreachable(slot)
    expect(slot.benchedUntil).toBe(clock.t + 60_000)
    pool.benchUnreachable(slot)
    expect(slot.benchedUntil).toBe(clock.t + 300_000)
    pool.benchUnreachable(slot)
    expect(slot.benchedUntil).toBe(clock.t + 600_000)
    clock.t += 600_001
    expect(pool.snapshot().benched).toBe(0)
  })

  it('rests an unreachable node for the session only after five misses while other nodes answer', () => {
    const { pool, clock } = setup()
    const slot = pool.pick()!
    const other = pool.pick({ exclude: new Set([slot.url]) })!
    for (let i = 0; i < 6; i++) {
      pool.succeeded(other, 10, {})
      pool.benchUnreachable(slot)
      clock.t += 700_000
    }
    expect(slot.benchedUntil).toBe(SESSION)
    expect(pool.pick({ exclude: new Set() })).not.toBe(slot)
  })

  it('does not rest a node for the session when nothing has answered lately: that is the client offline', () => {
    const { pool, clock } = setup()
    const slot = pool.pick()!
    for (let i = 0; i < 8; i++) {
      pool.benchUnreachable(slot)
      clock.t += 700_000
    }
    expect(slot.benchedUntil).toBeLessThan(SESSION)
  })

  it('benches a failing node for 60 s, then 10 min from the third strike', () => {
    const { pool, clock } = setup()
    const slot = pool.pick()!
    pool.benchFailing(slot)
    expect(slot.benchedUntil).toBe(clock.t + 60_000)
    pool.benchFailing(slot)
    expect(slot.benchedUntil).toBe(clock.t + 60_000)
    pool.benchFailing(slot)
    expect(slot.benchedUntil).toBe(clock.t + 600_000)
    pool.succeeded(slot, 10, {})
    expect(slot.strikes).toBe(0)
  })

  it('lets a node back in after its bench ends', () => {
    const { pool, clock } = setup(2, 2)
    const a = pool.pick()!
    pool.benchFailing(a)
    clock.t += 60_001
    expect(pool.snapshot().benched).toBe(0)
  })

  it('moves pressure to tight at 3 benched nodes and exhausted at 6', () => {
    const { pool } = setup(20, 8)
    const benched: string[] = []
    const bench = () => {
      const s = pool.pick({ exclude: new Set(benched) })!
      benched.push(s.url)
      pool.benchFailing(s)
    }
    for (let i = 0; i < 2; i++) bench()
    expect(pool.snapshot().pressure).toBe('ok')
    bench()
    expect(pool.snapshot().pressure).toBe('tight')
    for (let i = 0; i < 3; i++) bench()
    expect(pool.snapshot().pressure).toBe('exhausted')
  })

  it('has nothing to pick, but something to wait for, when every node is resting', () => {
    const { pool } = setup(2, 2)
    pool.benchUnreachable(pool.pick()!)
    pool.benchUnreachable(pool.pick()!)
    expect(pool.pick()).toBeUndefined()
    expect(pool.hasUsableNode()).toBe(true)
    expect(pool.nextChangeAt()).toBeDefined()
  })

  it('leaves a node that is behind the best tip out of height-sensitive calls', () => {
    const { pool, clock } = setup(2, 2)
    const a = pool.pick()!
    const b = pool.pick({ exclude: new Set([a.url]) })!
    pool.noteTip(a, 1000)
    pool.noteTip(b, 997)
    expect(pool.pick({ heightSensitive: true })).toBe(a)
    pool.begin(a)
    for (let i = 0; i < MAX_IN_FLIGHT; i++) pool.begin(a)
    expect(pool.pick({ heightSensitive: true })).toBeUndefined()
    expect(pool.pick({ heightSensitive: false })).toBe(b)
    pool.noteTip(b, 999)
    expect(pool.pick({ heightSensitive: true })).toBe(b)
    clock.t += 1
  })
})

describe('pressure', () => {
  it('is ok at 50 % headroom or more, tight from 20 % to 50 %, exhausted below 20 %', () => {
    expect(pressureOf(200, 400, 0)).toBe('ok')
    expect(pressureOf(199, 400, 0)).toBe('tight')
    expect(pressureOf(80, 400, 0)).toBe('tight')
    expect(pressureOf(79, 400, 0)).toBe('exhausted')
    expect(pressureOf(0, 0, 0)).toBe('exhausted')
  })

  it('canAfford asks whether n more requests keep the pool at ok', () => {
    const { pool } = setup()
    expect(pool.canAfford(200)).toBe(true)
    expect(pool.canAfford(201)).toBe(false)
  })

  it('counts requests across the rolling minute and forgets them after', () => {
    const { pool, clock } = setup()
    const slot = pool.pick()!
    for (let i = 0; i < 10; i++) {
      pool.begin(slot)
      pool.end(slot)
    }
    expect(pool.snapshot().usedLastMinute).toBe(10)
    expect(pool.snapshot().headroom).toBe(390)
    clock.t += 60_001
    expect(pool.snapshot().usedLastMinute).toBe(0)
  })
})
