import { describe, expect, it } from 'vitest'
import type { ProofRecord } from '@/data/sdk/proof-store'
import { evidenceFile, evidenceName, jsonSafe } from './evidence'

const record = (over: Partial<ProofRecord> = {}): ProofRecord => ({
  id: 'proof-1',
  net: 'testnet',
  method: 'identities.fetch',
  args: { id: 'abc', amount: 5n, bytes: new Uint8Array([1, 255]) },
  recordedAt: Date.UTC(2026, 10, 10, 12, 0, 0),
  node: '192.0.2.1:1443',
  meta: {
    height: 1234,
    coreChainLockedHeight: 5678,
    epoch: 9,
    timeMs: Date.UTC(2026, 10, 10, 11, 59, 58),
    protocolVersion: 14,
    chainId: 'dash-testnet-51',
  },
  proof: {
    grovedbProof: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    quorumHash: new Uint8Array([1, 2, 3]),
    signature: new Uint8Array([4, 5]),
    round: 2,
    blockIdHash: new Uint8Array([6]),
    quorumType: 6,
  },
  ...over,
})

describe('evidence export @NX-61', () => {
  it('turns bigints, bytes and maps into plain JSON', () => {
    expect(jsonSafe({ a: 5n, b: new Uint8Array([1, 255]), c: new Map([['k', [1n]]]) })).toEqual({
      a: '5',
      b: '01ff',
      c: { k: ['1'] },
    })
  })

  it('holds one figure’s proof with everything needed to check it again', () => {
    const file = evidenceFile([record()], Date.UTC(2026, 10, 10, 12, 5, 0), 'abc123')
    expect(file).toMatchObject({
      format: 'radar-proof-evidence',
      version: 1,
      exportedAt: '2026-11-10T12:05:00.000Z',
      app: 'abc123',
    })
    expect(file.proofs).toHaveLength(1)
    expect(file.proofs[0]).toMatchObject({
      id: 'proof-1',
      network: 'testnet',
      method: 'identities.fetch',
      args: { id: 'abc', amount: '5', bytes: '01ff' },
      node: '192.0.2.1:1443',
      platformHeight: 1234,
      coreChainLockedHeight: 5678,
      epoch: 9,
      protocolVersion: 14,
      chainId: 'dash-testnet-51',
      quorum: { type: 6, hash: '010203', round: 2 },
      signature: '0405',
      blockIdHash: '06',
      grovedbProof: { bytes: 4, hex: 'deadbeef' },
      verification: { result: 'verified' },
    })
    expect(() => JSON.stringify(file)).not.toThrow()
  })

  it('records a missing node as null and names the file after its scope and time', () => {
    const rest = record()
    delete rest.node
    expect(evidenceFile([rest], 0, 'x').proofs[0]?.node).toBeNull()
    expect(evidenceName('all', Date.UTC(2026, 10, 10, 12, 5, 0))).toBe(
      'radar-proof-all-2026-11-10T12-05-00-000Z.json',
    )
  })
})
