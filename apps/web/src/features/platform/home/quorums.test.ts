import { describe, expect, it } from 'vitest'
import type { QuorumDto } from '@/data/sdk/methods'
import { signingFirst } from './quorums'

const q = (hash: string): QuorumDto => ({
  quorumHash: hash,
  quorumType: 'LLMQ_100_67',
  memberCount: 100,
  threshold: 67,
  isVerified: true,
})

describe('signingFirst @PE-06', () => {
  const list = [q('00aa'), q('00bb'), q('00cc')]

  it('puts the quorum that signed the newest block first, matching PE’s upper-case hash', () => {
    const out = signingFirst(list, '00BB')
    expect(out.map((x) => [x.quorum.quorumHash, x.signing])).toEqual([
      ['00bb', true],
      ['00aa', false],
      ['00cc', false],
    ])
  })

  it('keeps DAPI’s order and marks none while the newest block is unknown or signed by another quorum', () => {
    for (const signer of [undefined, null, 'ffff']) {
      const out = signingFirst(list, signer)
      expect(out.map((x) => x.quorum.quorumHash)).toEqual(['00aa', '00bb', '00cc'])
      expect(out.some((x) => x.signing)).toBe(false)
    }
  })

  it('answers an empty list with an empty list', () => {
    expect(signingFirst([], '00aa')).toEqual([])
  })
})
