import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadFixtures, loadStories, storyInputs } from '../lib/stories.mjs'

const TYPES = [
  'proregtx',
  'proupservtx',
  'proupregtx',
  'uprevtx',
  'qctx',
  'assetlock',
  'assetunlock',
  'cbtx',
]

describe('special transaction samples @HY-07', () => {
  for (const [network, types] of [
    ['mainnet', TYPES],
    ['testnet', [...TYPES, 'mnhf']],
  ]) {
    it(`${network} has one sample of every type that exists there`, () => {
      const samples = loadFixtures(network).entities.special_txs
      assert.deepEqual(Object.keys(samples).sort(), [...types].sort())
      for (const id of Object.values(samples)) assert.match(id, /^[0-9a-f]{64}$/)
      assert.equal(new Set(Object.values(samples)).size, types.length)
    })
  }

  it('the story names every sample as an input', () => {
    const story = loadStories().find((s) => s.id === 'HY-07')
    assert.ok(storyInputs(story).includes('special_txs'))
    for (const type of [...TYPES, 'mnhf'])
      assert.match(story.acceptance, new RegExp(`\\{special_txs\\.${type}\\}`))
  })
})
