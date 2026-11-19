import { describe, expect, it, vi } from 'vitest'
import type { DapiTransport } from '@/data/dapi-core'
import { proposerTurns } from '@/lib/proposer-order'
import { loadDapiFixture } from '@/test/fixtures/dapi-load'
import { requestKey } from '@/test/msw/dapi-transport'
import { encodeCurrentQuorums } from '@/test/msw/platform-tip'
import { createPlatformDapi } from '@/data/platform-dapi/client'
import { platformDapiQueries } from '@/data/platform-dapi/queries'
import {
  CURRENT_QUORUMS_REQUEST,
  decodeCurrentQuorums,
  QuorumsDecodeError,
} from '@/data/platform-dapi/quorums'

async function recorded(net: 'mainnet' | 'testnet'): Promise<Uint8Array> {
  const f = await loadDapiFixture(net, 'getCurrentQuorumsInfo', requestKey(CURRENT_QUORUMS_REQUEST))
  if (!f?.response) throw new Error('no recording')
  return Uint8Array.from(atob(f.response), (c) => c.charCodeAt(0))
}

const decode = (bytes: Uint8Array, net: 'mainnet' | 'testnet' = 'mainnet', now = Date.now()) =>
  decodeCurrentQuorums(bytes, { net, now })

describe('decodeCurrentQuorums', () => {
  it('reads mainnet’s 24 sets of up to 100, the active one, the last proposer and the block it is at', async () => {
    const q = decode(await recorded('mainnet'))
    expect(q.sets).toHaveLength(24)
    expect(q.order).toHaveLength(24)
    expect(q.sets.every((s) => s.members.length > 90 && s.members.length <= 100)).toBe(true)
    expect(q.sets.some((s) => s.quorumHash === q.current)).toBe(true)
    expect(q.lastProposer).toMatch(/^[0-9a-f]{64}$/)
    expect(q.meta).toMatchObject({ height: 469065, epoch: 88, chainId: 'evo1' })
    const members = q.sets[0]!.members.map((m) => m.proTxHash)
    expect(members).toEqual([...members].sort())
    const turns = proposerTurns(q)
    expect(turns[0]!.slot).toBe(1)
    expect(new Set(turns.map((t) => t.proTxHash)).size).toBe(turns.length)
  })

  it('reads testnet’s smaller sets', async () => {
    const q = decode(await recorded('testnet'), 'testnet')
    expect(q.meta.chainId).toBe('dash-testnet-51')
    expect(q.sets.length).toBeGreaterThan(0)
    expect(proposerTurns(q).length).toBeGreaterThan(12)
  })

  it('refuses an answer that is cut short, empty, or names a hash of the wrong size', async () => {
    const bytes = await recorded('testnet')
    expect(() => decode(bytes.subarray(0, 1000), 'testnet')).toThrow(QuorumsDecodeError)
    expect(() => decode(new Uint8Array())).toThrow('No v0 answer')
    // v0 { last_block_proposer: 3 bytes }
    expect(() => decode(new Uint8Array([0x0a, 0x05, 0x22, 0x03, 1, 2, 3]))).toThrow(/not 32/)
  })
})

describe('what the decoder refuses', () => {
  const good = async () => decode(await recorded('mainnet'))

  it('a block time no clock can show, which would throw when drawn', async () => {
    const q = await good()
    expect(() => decode(encodeCurrentQuorums(q, { timeMs: 2n ** 63n }))).toThrow(/block time/)
  })

  it('a block time more than a minute past the browser’s clock', async () => {
    const q = await good()
    const now = q.meta.timeMs
    expect(() => decode(encodeCurrentQuorums(q), 'mainnet', now - 61_000)).toThrow(/future/)
    expect(decode(encodeCurrentQuorums(q), 'mainnet', now - 59_000).meta.timeMs).toBe(now)
  })

  it('a height past what a number holds exactly', async () => {
    const q = await good()
    expect(() => decode(encodeCurrentQuorums(q, { height: 2n ** 60n }))).toThrow(/block height/)
  })

  it('an answer with no rotation: a broken read, not an order that ran out', async () => {
    const q = await good()
    expect(() => decode(encodeCurrentQuorums({ ...q, order: [] }))).toThrow(/rotation/)
  })

  it('an answer for another network', async () => {
    const testnet = await recorded('testnet')
    const mainnet = await recorded('mainnet')
    expect(() => decode(testnet, 'mainnet')).toThrow(/dash-testnet-51, not mainnet/)
    expect(() => decode(mainnet, 'testnet')).toThrow(/evo1, not testnet/)
  })
})

describe('platformDapi.currentQuorums', () => {
  const transportOf = (answers: { response: Uint8Array; node: string }[]) => {
    const unary = vi.fn(() => Promise.resolve(answers.shift()!))
    const reportInvalid = vi.fn()
    return { unary, reportInvalid, transport: { unary, reportInvalid } as unknown as DapiTransport }
  }

  it('stamps the answer as one node’s unproved word, at the block and time it reports', async () => {
    const t = transportOf([{ response: await recorded('mainnet'), node: '1.2.3.4:443' }])
    const client = createPlatformDapi({
      transport: () => t.transport,
      now: () => 1_900_000_000_000,
    })
    const answer = await client.currentQuorums('mainnet')
    expect(answer).toMatchObject({
      source: 'dapi',
      proved: false,
      height: 469065,
      node: '1.2.3.4:443',
    })
    expect(answer.asOf).toBe(answer.data.meta.timeMs)
    expect(t.unary).toHaveBeenCalledWith(
      'mainnet',
      'getCurrentQuorumsInfo',
      CURRENT_QUORUMS_REQUEST,
      expect.objectContaining({ priority: 'list' }),
    )
  })

  it('refuses an unreadable answer, rests that node and asks another', async () => {
    const t = transportOf([
      { response: new Uint8Array([0x0a, 0x00]), node: 'bad:443' },
      { response: await recorded('testnet'), node: 'good:1443' },
    ])
    const client = createPlatformDapi({ transport: () => t.transport, now: () => Date.now() })
    const answer = await client.currentQuorums('testnet')
    expect(answer.node).toBe('good:1443')
    expect(t.reportInvalid).toHaveBeenCalledWith('testnet', 'bad:443', expect.any(String))
    expect(t.unary).toHaveBeenLastCalledWith(
      'testnet',
      'getCurrentQuorumsInfo',
      CURRENT_QUORUMS_REQUEST,
      expect.objectContaining({ avoidNodes: ['bad:443'] }),
    )
  })

  it('gives up after two unreadable answers', async () => {
    const t = transportOf([
      { response: new Uint8Array([0x0a, 0x00]), node: 'a:443' },
      { response: new Uint8Array([0x0a, 0x00]), node: 'b:443' },
    ])
    const client = createPlatformDapi({ transport: () => t.transport, now: () => Date.now() })
    await expect(client.currentQuorums('mainnet')).rejects.toMatchObject({
      source: 'dapi',
      kind: 'invalid-response',
    })
  })
})

describe('platformDapiQueries.currentQuorums', () => {
  it('reads only when the schedule asks: never on focus, and never again by itself after a refusal', () => {
    const options = platformDapiQueries.currentQuorums('mainnet')
    expect(options.refetchOnWindowFocus).toBe(false)
    expect(options.retry).toBe(false)
  })
})
