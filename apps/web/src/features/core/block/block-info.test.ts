import { beforeAll, describe, expect, it } from 'vitest'
import { loadDapiManifest } from '@/test/fixtures/dapi-load'
import { fixtureCore } from '@/test/core-client'
import { blockReward, cbTxOf, coinbaseTag, difficultyFromBits, poolOf } from './block-info'

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))
const coinbaseWith = (script: string) =>
  ({ inputs: [{ coinbase: script }] }) as unknown as Parameters<typeof coinbaseTag>[0]

describe('coinbaseTag', () => {
  it('keeps the words and drops the height push, extra nonce and signature bytes @IN-03', () => {
    const script = hex([
      0x03,
      0x37,
      0x27,
      0x27,
      ...ascii('/ViaBTC/Mined by dash'),
      0x00,
      0x2d,
      0x64,
      0x9f,
      0x20,
      0x79,
    ])
    expect(coinbaseTag(coinbaseWith(script))).toBe('/ViaBTC/Mined by dash')
  })

  it('is empty when the script carries no words', () => {
    expect(coinbaseTag(coinbaseWith(hex([0x03, 0x01, 0x02, 0x03, 0x00])))).toBe('')
    expect(coinbaseTag(undefined)).toBe('')
  })
})

describe('difficultyFromBits', () => {
  it('reads the compact target like Dash Core', () => {
    expect(difficultyFromBits('1d00ffff')).toBe(1)
    expect(difficultyFromBits('1c00ffff')).toBe(256)
    expect(difficultyFromBits('1e0ffff0')).toBeCloseTo(0.000244, 6)
  })
})

describe.each(['mainnet', 'testnet'] as const)('block facts from the %s recording', (net) => {
  const { core } = fixtureCore()
  let tipHeight = 0
  beforeAll(async () => {
    tipHeight = (await loadDapiManifest(net)).tip.height
  })

  it('matches the difficulty the node reports for the tip', async () => {
    const [block, status] = await Promise.all([
      core.block(net, { height: tipHeight }),
      core.status(net),
    ])
    expect(block.data).not.toBeNull()
    const ours = difficultyFromBits(block.data!.bits)
    expect(Math.abs(ours - status.data.difficulty) / status.data.difficulty).toBeLessThan(1e-6)
  })

  it('totals the coinbase outputs and finds the cbTx', async () => {
    const block = (await core.block(net, { height: tipHeight })).data!
    expect(blockReward(block)).toBeGreaterThan(0n)
    expect(cbTxOf(block)?.height).toBe(tipHeight)
  })

  it('reads the coinbase tag without throwing', async () => {
    const block = (await core.block(net, { height: tipHeight })).data!
    expect(poolOf(block.txs[0])).toBe(net === 'mainnet' ? 'ViaBTC' : undefined)
    expect(typeof coinbaseTag(block.txs[0])).toBe('string')
    expect(['string', 'undefined']).toContain(typeof poolOf(block.txs[0]))
  })
})
