import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { signedMessageEntity } from '../fixtures.mjs'
import { FIXTURES_DIR } from '../lib/stories.mjs'

describe('signed_message fixture', () => {
  for (const network of ['mainnet', 'testnet']) {
    it(`matches the committed ${network} fixture`, () => {
      const committed = JSON.parse(readFileSync(`${FIXTURES_DIR}/${network}.json`, 'utf8'))
      assert.deepEqual(signedMessageEntity(network), committed.entities.signed_message)
    })
  }
})
