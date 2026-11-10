import { describe, expect, it } from 'vitest'
import { createProofStore } from '@/data/sdk/proof-store'

const record = (n: number) => ({
  net: 'mainnet' as const,
  method: 'epoch.current',
  args: {},
  recordedAt: n,
  meta: {
    height: n,
    coreChainLockedHeight: 1,
    epoch: 1,
    timeMs: n,
    protocolVersion: 14,
    chainId: 'evo1',
  },
  proof: {
    grovedbProof: new Uint8Array([n]),
    quorumHash: new Uint8Array(32),
    signature: new Uint8Array(96),
    round: 0,
    blockIdHash: new Uint8Array(32),
    quorumType: 4,
  },
})

describe('proofStore', () => {
  it('keeps the last 300 proofs, newest first', () => {
    const store = createProofStore()
    const first = store.put(record(0))
    for (let i = 1; i <= 300; i++) store.put(record(i))
    expect(store.list()).toHaveLength(300)
    expect(store.get(first.id)).toBeUndefined()
    expect(store.list()[0]!.meta.height).toBe(300)
  })

  it('gives every record its own id and tells subscribers', () => {
    const store = createProofStore()
    let notified = 0
    store.subscribe(() => notified++)
    const a = store.put(record(1))
    const b = store.put(record(2))
    expect(a.id).not.toBe(b.id)
    expect(notified).toBe(2)
    expect(store.snapshot()).toBe(2)
  })
})
