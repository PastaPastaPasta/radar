import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadStories } from '../lib/stories.mjs'
import { SHARDS } from '../lib/shards.mjs'
import { buildPacket } from '../packet.mjs'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packet.mjs')

describe('stories.yaml and shards', () => {
  const stories = loadStories()

  it('has all 171 stories, each in exactly one shard', () => {
    assert.equal(stories.length, 171)
    const seen = new Map()
    for (const shard of SHARDS) {
      for (const s of buildPacket({ shard }).storiesJson) {
        assert.ok(!seen.has(s.id), `${s.id} in two shards`)
        seen.set(s.id, shard)
      }
    }
    assert.equal(seen.size, 171)
  })

  it('places boundary stories as the shard table says', () => {
    const shard = Object.fromEntries(stories.map((s) => [s.id, s.shard]))
    assert.equal(shard['HY-10'], 'S1')
    assert.equal(shard['HY-11'], 'S1')
    assert.equal(shard['HY-12'], 'S5')
    assert.equal(shard['NX-45'], 'S2')
    assert.equal(shard['NX-50'], 'S3')
    assert.equal(shard['PE-34'], 'S3')
    assert.equal(shard['PE-36'], 'S4')
    assert.equal(shard['X-11'], 'S6')
  })

  it('leaves the write stories out', () => {
    const ids = new Set(stories.map((s) => s.id))
    for (let n = 80; n <= 93; n++) assert.ok(!ids.has(`NX-${n}`))
    for (const id of ['PE-30', 'PE-31', 'PE-32', 'PE-33', 'PE-35', 'IN-07']) assert.ok(!ids.has(id))
  })

  it('gives every story a start URL, production URLs and an expanded persona', () => {
    for (const s of stories) {
      assert.ok(s.radar_start.startsWith('/'), s.id)
      assert.ok(
        s.prod.every((u) => u.startsWith('https://')),
        s.id,
      )
      assert.match(s.story, /^As (an? |anyone)/, s.id)
    }
  })
})

describe('packet', () => {
  it('writes only stories, fixtures and the two files it was given', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'packet-'))
    const rubric = path.join(dir, 'in-rubric.md')
    const browser = path.join(dir, 'in-browser.md')
    writeFileSync(rubric, 'RUBRIC SENTINEL')
    writeFileSync(browser, 'BROWSER SENTINEL')
    const out = path.join(dir, 'S3')
    const summary = JSON.parse(
      execFileSync(
        process.execPath,
        [script, '--shard', 'S3', '--out', out, '--rubric', rubric, '--browser', browser],
        { encoding: 'utf8' },
      ),
    )
    assert.deepEqual(readdirSync(out).sort(), [
      'browser.md',
      'fixtures.json',
      'rubric.md',
      'stories.json',
    ])
    assert.equal(readFileSync(path.join(out, 'rubric.md'), 'utf8'), 'RUBRIC SENTINEL')
    assert.equal(readFileSync(path.join(out, 'browser.md'), 'utf8'), 'BROWSER SENTINEL')
    const stories = JSON.parse(readFileSync(path.join(out, 'stories.json'), 'utf8'))
    assert.equal(stories.length, summary.stories)
    assert.ok(stories.some((s) => s.id === 'PE-34'))
    assert.ok(stories.every((s) => !('shard' in s)))
    const nx =
      stories.find((s) => s.id === 'NX-10') ?? stories.find((s) => s.inputs.includes('identity'))
    void nx
    const fx = JSON.parse(readFileSync(path.join(out, 'fixtures.json'), 'utf8'))
    assert.ok(fx.mainnet.entities.tip)
    assert.ok(fx.testnet.entities.tip)
  })

  it('lists the input keys a story uses', () => {
    const { storiesJson } = buildPacket({ shard: 'S1' })
    const ra30 = storiesJson.find((s) => s.id === 'RA-30')
    assert.deepEqual(ra30.inputs, ['mn_regular'])
    assert.ok(ra30.prod_testnet[0].includes('net=testnet'))
  })

  it('rejects an unknown shard', () => {
    assert.throws(() => buildPacket({ shard: 'S9' }), /unknown shard/)
  })
})
