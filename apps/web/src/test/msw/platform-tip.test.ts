import { afterEach, describe, expect, it } from 'vitest'
import { CURRENT_QUORUMS_REQUEST, decodeCurrentQuorums } from '@/data/platform-dapi/quorums'
import { proposerTurns } from '@/lib/proposer-order'
import { loadDapiFixture } from '@/test/fixtures/dapi-load'
import { requestKey } from './dapi-transport'
import { takeFixtureMisses } from './handlers'
import {
  advancedEpochAnswer,
  advancedQuorumsAnswer,
  advancePlatformTip,
  resetPlatformTip,
} from './platform-tip'

async function recorded(): Promise<Uint8Array> {
  const f = await loadDapiFixture(
    'mainnet',
    'getCurrentQuorumsInfo',
    requestKey(CURRENT_QUORUMS_REQUEST),
  )
  return Uint8Array.from(atob(f!.response!), (c) => c.charCodeAt(0))
}
const decode = (bytes: Uint8Array) =>
  decodeCurrentQuorums(bytes, { net: 'mainnet', now: Number.MAX_SAFE_INTEGER })

afterEach(() => {
  resetPlatformTip()
})

describe('the fixture Platform tip', () => {
  it('moves the active set on with the proposer when the turn crosses into the next set', async () => {
    const bytes = await recorded()
    const q = decode(bytes)
    const turns = proposerTurns(q)
    const crossing = turns.find((t) => t.quorumHash !== q.current)!
    advancePlatformTip(crossing.slot)
    const moved = decode(advancedQuorumsAnswer(bytes, 'mainnet'))
    expect(moved.current).toBe(crossing.quorumHash)
    expect(moved.lastProposer).toBe(crossing.proTxHash)
    expect(moved.meta.height).toBe(q.meta.height + crossing.slot)
    const next = turns.find((t) => t.slot === crossing.slot + 1)!
    expect(proposerTurns(moved)[0]!.proTxHash).toBe(next.proTxHash)
  })

  it('keeps the active set while the turn stays in it', async () => {
    const bytes = await recorded()
    const q = decode(bytes)
    advancePlatformTip(1)
    const moved = decode(advancedQuorumsAnswer(bytes, 'mainnet'))
    expect(moved.current).toBe(q.current)
    expect(moved.lastProposer).toBe(proposerTurns(q)[0]!.proTxHash)
  })

  it('fails as a fixture miss when no recorded turn places the advance, instead of answering at the wrong height', async () => {
    const bytes = await recorded()
    advancePlatformTip(1_000_000)
    expect(() => advancedQuorumsAnswer(bytes, 'mainnet')).toThrow(/No recorded turn places/)
    expect(takeFixtureMisses()).toEqual([
      'the validator sets 1000000 blocks past the mainnet recording',
    ])
  })

  it('adds each call’s own spacing to the time, so a later, faster block never moves time back', () => {
    const answer = { ok: true, meta: { height: 100, timeMs: 1_000_000 } }
    advancePlatformTip(2, 135_000)
    advancePlatformTip(1, 1_000)
    expect(advancedEpochAnswer(answer).meta).toEqual({ height: 103, timeMs: 1_271_000 })
  })
})
