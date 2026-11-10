import { beforeAll, describe, expect, it } from 'vitest'
import { loadDapiManifest } from '@/test/fixtures/dapi-load'
import { fixtureCore } from '@/test/core-client'
import { blockReward, cbTxOf, coinbaseTag, difficultyFromBits, poolOf } from './block-info'

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
