import { beforeEach, describe, expect, it } from 'vitest'
import { parseGroveProof, ProofParseError, resetGroveParser } from './grove-proof'
import { proofBytes, proofText, wasmBytes, type ProofFixture } from './proof-fixtures'

const FIXTURES: ProofFixture[] = [
  'testnet-dpns-domain-asc',
  'testnet-dpns-domain-desc',
  'testnet-release-range-sum',
  'testnet-grades-semester-avg',
]

beforeEach(() => {
  resetGroveParser()
})

describe('parseGroveProof', () => {
  it.each(FIXTURES)('decodes %s to the parser text it was recorded with', async (name) => {
    expect((await parseGroveProof(proofBytes(name), wasmBytes())).trimEnd()).toBe(
      proofText(name).trimEnd(),
    )
  })

  it('refuses empty input before loading anything', async () => {
    await expect(parseGroveProof(new Uint8Array())).rejects.toMatchObject({ reason: 'empty' })
  })

  it('reports bytes that are not a proof, and the next call still works', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const error = await parseGroveProof(bytes, wasmBytes()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProofParseError)
    expect(['truncated', 'invalid', 'trap']).toContain((error as ProofParseError).reason)
    const text = await parseGroveProof(proofBytes('testnet-dpns-domain-asc'), wasmBytes())
    expect(text.trimEnd()).toBe(proofText('testnet-dpns-domain-asc').trimEnd())
  })

  it('reports a proof cut short as truncated', async () => {
    const whole = proofBytes('testnet-dpns-domain-asc')
    const error = await parseGroveProof(whole.slice(0, 40), wasmBytes()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProofParseError)
  })
})
