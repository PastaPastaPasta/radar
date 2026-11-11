import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { committedBusyAddress, committedSpecialTxs, signedMessageEntity } from '../fixtures.mjs'
import { FIXTURES_DIR } from '../lib/stories.mjs'

describe('signed_message fixture', () => {
  for (const network of ['mainnet', 'testnet']) {
    it(`matches the committed ${network} fixture`, () => {
      const committed = JSON.parse(readFileSync(`${FIXTURES_DIR}/${network}.json`, 'utf8'))
      assert.deepEqual(signedMessageEntity(network), committed.entities.signed_message)
    })
  }
})

describe('special_txs fixture', () => {
  it('is carried over when the fixtures are regenerated', () => {
    for (const network of ['mainnet', 'testnet']) {
      const committed = JSON.parse(readFileSync(`${FIXTURES_DIR}/${network}.json`, 'utf8'))
      assert.ok(committed.entities.special_txs)
      assert.deepEqual(committedSpecialTxs(network), committed.entities.special_txs)
    }
  })
})

describe('busy_address fixture', () => {
  it('is committed for mainnet and carried over when the fixtures are regenerated', () => {
    const committed = JSON.parse(readFileSync(`${FIXTURES_DIR}/mainnet.json`, 'utf8'))
    assert.match(committed.entities.busy_address.id, /^X[1-9A-HJ-NP-Za-km-z]{33}$/)
    assert.deepEqual(committedBusyAddress('mainnet'), committed.entities.busy_address)
  })
})
