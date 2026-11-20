import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceHealth } from '@/data/health'
import type { SourceStamp } from '@/data/envelope'
import { sourceView, stampViolation } from './source-labels'

const NOW = 1_700_000_000_000
const health: SourceHealth = { source: 'sdk', net: 'mainnet', state: 'ok' }
const proof = {
  id: 'p',
  method: 'getIdentityWithProofInfo',
  platformHeight: 1,
  coreChainLockedHeight: 1,
  epoch: 1,
  timeMs: NOW,
  protocolVersion: 12,
  chainId: 'dash-1',
  quorumType: 106,
  quorumHash: '00'.repeat(32),
  round: 0,
  proofBytes: 1,
}
const stamp = (extra: Partial<SourceStamp> = {}): SourceStamp => ({
  source: 'sdk',
  asOf: NOW,
  fetchedAt: NOW,
  proved: false,
  ...extra,
})

afterEach(() => vi.restoreAllMocks())

describe('stampViolation', () => {
  it('accepts a proved sdk stamp with a proof and an unproved stamp without one', () => {
    expect(stampViolation(stamp({ proved: true, proof }))).toBeUndefined()
    expect(stampViolation(stamp())).toBeUndefined()
    expect(stampViolation(stamp({ source: 'pe' }))).toBeUndefined()
  })

  it('flags proved without proof, proof without proved, and proved on another source', () => {
    expect(stampViolation(stamp({ proved: true }))).toMatch(/no proof/)
    expect(stampViolation(stamp({ proof }))).toMatch(/not marked proved/)
    expect(stampViolation(stamp({ source: 'pe', proved: true, proof }))).toMatch(/only sdk/)
  })
})

describe('sourceView invariant', () => {
  it('logs once per offending stamp and still renders', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bad = stamp({ proved: true })
    expect(sourceView(bad, health, NOW).label).toBe('Proof-checked')
    sourceView(bad, health, NOW + 1000)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]?.[0])).toContain('no proof')
  })

  it('stays quiet for a well-formed stamp', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    sourceView(stamp({ proved: true, proof }), health, NOW)
    expect(log).not.toHaveBeenCalled()
  })
})

describe('sourceView stale age', () => {
  const pe = (extra: Partial<SourceStamp>) => stamp({ source: 'pe', ...extra })
  const peHealth: SourceHealth = { source: 'pe', net: 'mainnet', state: 'ok' }

  it("uses the stamp's own limit where it is longer than the source's", () => {
    const old = NOW - 11 * 60_000
    expect(sourceView(pe({ asOf: old }), peHealth, NOW).variant).toBe('stale')
    expect(sourceView(pe({ asOf: old, staleAfterMs: 20 * 60_000 }), peHealth, NOW).variant).toBe(
      'ok',
    )
  })

  it('leaves a reading a few minutes old in quiet ink, whatever its refresh interval @X-05', () => {
    const sdk = stamp({ proved: true, proof, asOf: NOW - 2 * 60_000, staleAfterMs: 40_000 })
    expect(sourceView(sdk, health, NOW)).toMatchObject({ variant: 'proof', age: '2 min ago' })
    expect(
      sourceView(pe({ asOf: NOW - 9 * 60_000, staleAfterMs: 40_000 }), peHealth, NOW),
    ).toMatchObject({ variant: 'ok' })
    expect(
      sourceView(
        stamp({ source: 'radar', asOf: NOW - 25 * 60_000 }),
        { ...health, source: 'radar' },
        NOW,
      ).variant,
    ).toBe('ok')
    expect(
      sourceView(
        stamp({ source: 'radar', asOf: NOW - 31 * 60_000 }),
        { ...health, source: 'radar' },
        NOW,
      ).variant,
    ).toBe('stale')
  })

  it('still turns at once when the source itself reports trouble', () => {
    expect(sourceView(pe({ asOf: NOW - 1000 }), { ...peHealth, state: 'stale' }, NOW).variant).toBe(
      'stale',
    )
    expect(sourceView(pe({ asOf: NOW - 1000, fallback: 'dapi-down' }), peHealth, NOW).variant).toBe(
      'stale',
    )
  })
})

describe('sourceView data age', () => {
  const hyphen = (extra: Partial<SourceStamp> = {}) =>
    stamp({ source: 'hyphen', asOf: NOW - 8000, fetchedAt: NOW - 8000, ...extra })
  const behind = (lag: SourceHealth['lag']): SourceHealth => ({
    source: 'hyphen',
    net: 'mainnet',
    state: 'ok',
    lag,
  })
  const detail = 'indexed to block 2,570,010 (9 minutes behind)'

  it('says how far an index trails the chain in place of when it was read @X-05', () => {
    const v = sourceView(hyphen(), behind({ blocks: 4, ms: 9 * 60_000, detail }), NOW)
    expect(v).toMatchObject({ label: 'Indexed by Hyphen', lag: detail, variant: 'ok' })
    expect(v.age).toBeUndefined()
  })

  it('keeps the read age while the index is at the tip or one block off', () => {
    expect(sourceView(hyphen(), behind({ blocks: 1, ms: 150_000, detail }), NOW).age).toBe(
      '8 s ago',
    )
    expect(sourceView(hyphen(), behind(undefined), NOW).age).toBe('8 s ago')
  })

  it('goes by time when the index gives no block count', () => {
    expect(sourceView(hyphen(), behind({ ms: 6 * 60_000, detail }), NOW).lag).toBe(detail)
    expect(sourceView(hyphen(), behind({ ms: 60_000, detail }), NOW).age).toBe('8 s ago')
  })

  it('leaves a record that cannot change, and a source that is not an index, alone', () => {
    const lag = { blocks: 40, detail }
    expect(sourceView(hyphen({ immutable: true }), behind(lag), NOW).lag).toBeUndefined()
    expect(
      sourceView(
        stamp({ source: 'dapi', asOf: NOW - 8000 }),
        { ...behind(lag), source: 'dapi' },
        NOW,
      ).age,
    ).toBe('8 s ago')
  })

  it('keeps counting a pushed figure from the last live update once updates stop @X-05', () => {
    const dapi = stamp({ source: 'dapi', asOf: NOW - 1000, pushed: true })
    const dapiHealth: SourceHealth = { ...health, source: 'dapi' }
    const stopped = { state: 'stopped', lastEventAt: NOW - 4 * 60_000 } as const
    expect(sourceView(dapi, dapiHealth, NOW, stopped).age).toBe('4 min ago')
    expect(sourceView(dapi, dapiHealth, NOW + 60_000, stopped).age).toBe('5 min ago')
    expect(
      sourceView(dapi, dapiHealth, NOW, { state: 'live', lastEventAt: NOW - 4 * 60_000 }).age,
    ).toBe('1 s ago')
    const older = stamp({ source: 'dapi', asOf: NOW - 6 * 60_000, pushed: true })
    expect(sourceView(older, dapiHealth, NOW, stopped).age).toBe('6 min ago')
    expect(
      sourceView(stamp({ source: 'pe', asOf: NOW - 1000 }), dapiHealth, NOW, stopped).age,
    ).toBe('1 s ago')
    const read = stamp({ source: 'dapi', asOf: NOW - 1000 })
    expect(sourceView(read, dapiHealth, NOW, stopped).age, 'a fresh DAPI read').toBe('1 s ago')
  })

  it('says Radar crawled it everywhere, and gives no age to a document that carries none @X-01', () => {
    const radarHealth: SourceHealth = { ...health, source: 'radar' }
    const crawled = sourceView(stamp({ source: 'radar', asOf: NOW - 180_000 }), radarHealth, NOW)
    expect(crawled).toMatchObject({ label: 'Crawled by Radar', age: '3 min ago' })
    const untimed = sourceView(
      stamp({ source: 'radar', asOf: NOW - 2000, asOfFetched: true }),
      radarHealth,
      NOW,
    )
    expect(untimed.label).toBe('Crawled by Radar')
    expect(untimed.age).toBeUndefined()
  })

  it('says when a document comes from an earlier crawl, and names Radar’s own checks apart from the crawl @RA-12', () => {
    const radarHealth: SourceHealth = { ...health, source: 'radar' }
    const earlier = sourceView(
      stamp({ source: 'radar', asOf: NOW - 17 * 60_000, radarTime: 'earlier-crawl' }),
      radarHealth,
      NOW,
    )
    expect(earlier).toMatchObject({
      label: 'Crawled by Radar · an earlier crawl',
      age: '17 min ago',
    })
    const checked = sourceView(
      stamp({ source: 'radar', asOf: NOW - 11 * 60_000, radarTime: 'reading' }),
      radarHealth,
      NOW,
    )
    expect(checked).toMatchObject({ label: 'Checked by Radar', age: '11 min ago' })
  })

  it('turns a crawl stale at 30 minutes, the one crawl threshold @RA-12', () => {
    const radarHealth: SourceHealth = { ...health, source: 'radar' }
    const at = (min: number) =>
      sourceView(stamp({ source: 'radar', asOf: NOW - min * 60_000 }), radarHealth, NOW).variant
    expect(at(29)).not.toBe('stale')
    expect(at(31)).toBe('stale')
  })
})

describe('sourceView fallbacks', () => {
  it('gives an SDK that has failed its own label, distinct from the cold one @IN-09', () => {
    const pe = { source: 'pe' as const, asOf: NOW, fetchedAt: NOW, proved: false }
    const down = sourceView({ ...pe, fallback: 'sdk-down' }, health, NOW)
    const cold = sourceView({ ...pe, fallback: 'sdk-cold' }, health, NOW)
    expect(down.label).toBe('Indexed by Platform Explorer · proofs unavailable')
    expect(down.label).not.toBe(cold.label)
    expect(down.spinner).toBe(false)
    expect(down.age).toBeDefined()
  })
})

describe('Insight source line', () => {
  it('labels an Insight answer, with its age, and switches the label with the source', () => {
    const base = { asOf: NOW - 5_000, fetchedAt: NOW - 5_000, proved: false } as const
    const insight = sourceView(
      { source: 'insight', ...base },
      { ...health, source: 'insight' },
      NOW,
    )
    expect(insight).toMatchObject({ label: 'Indexed by Insight', variant: 'ok' })
    expect(insight.age).toBe('5 s ago')
    const hyphen = sourceView({ source: 'hyphen', ...base }, { ...health, source: 'hyphen' }, NOW)
    expect(hyphen.label).toBe('Indexed by Hyphen')
  })

  it('turns warning past its age limit and says Insight isn’t answering when it is down', () => {
    const old = { asOf: NOW - 11 * 60_000, fetchedAt: NOW - 11 * 60_000, proved: false } as const
    expect(
      sourceView({ source: 'insight', ...old }, { ...health, source: 'insight' }, NOW).variant,
    ).toBe('stale')
    const down = sourceView(
      { source: 'insight', ...old },
      { ...health, source: 'insight', state: 'down' },
      NOW,
    )
    expect(down.label).toBe("Insight isn't answering")
  })
})
