import { describe, expect, it } from 'vitest'
import type { SourceStamp } from '@/data/envelope'
import { sourceView } from '@/ui/source-labels'
import { agedFromRead, atTip, pushed } from './freshness'

const MIN = 60_000
const NOW = 1_800_000_000_000
const health = { source: 'dapi', state: 'ok' } as Parameters<typeof sourceView>[1]

const stamp = (over: Partial<SourceStamp>): SourceStamp => ({
  source: 'dapi',
  asOf: NOW,
  fetchedAt: NOW,
  proved: false,
  ...over,
})

const variant = (s: SourceStamp, at: number) => sourceView(s, health, at).variant

describe('home freshness', () => {
  it('keeps a pushed tip calm through a long gap between blocks, and turns it once the header stream has been silent', () => {
    const tip = stamp({ height: 100 })
    expect(variant(tip, NOW + 5 * MIN), 'the bare stamp turns after two minutes').toBe('stale')
    expect(variant(pushed(tip), NOW + 5 * MIN)).toBe('ok')
    expect(variant(pushed(tip), NOW + 21 * MIN)).toBe('stale')
  })

  it('never ages a figure read at the newest block, and still ages one read below it', () => {
    const read = stamp({ height: 100, staleAfterMs: 2 * MIN })
    expect(variant(atTip(read, 100), NOW + 30 * MIN)).toBe('ok')
    expect(variant(atTip(read, 101), NOW + 3 * MIN)).toBe('stale')
    expect(variant(atTip(stamp({ staleAfterMs: 2 * MIN }), 100), NOW + 3 * MIN)).toBe('stale')
    expect(variant(atTip(read, undefined), NOW + 3 * MIN)).toBe('stale')
  })

  it('ages a proof from when it was read, so a quiet chain is calm and a reading that stopped arriving is not', () => {
    const proof = stamp({ source: 'sdk', asOf: NOW - 5 * MIN, fetchedAt: NOW, height: 7 })
    expect(variant(proof, NOW), 'the bare stamp is out of date the moment it lands').toBe('stale')
    const aged = agedFromRead(proof, 2 * MIN)
    expect(variant(aged, NOW + MIN)).toBe('ok')
    expect(variant(aged, NOW + 3 * MIN)).toBe('stale')
  })
})
