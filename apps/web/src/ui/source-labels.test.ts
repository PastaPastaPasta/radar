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
