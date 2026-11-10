#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { SHARDS, shardOf } from './lib/shards.mjs'
import { productionUrl } from './lib/sites.mjs'
import { FIXTURES_DIR, loadFixtures, loadStories, storyInputs } from './lib/stories.mjs'

export function buildPacket({ shard, stories = loadStories(), fixturesDir = FIXTURES_DIR }) {
  if (!SHARDS.includes(shard))
    throw new Error(`unknown shard ${shard}; expected one of ${SHARDS.join(', ')}`)
  const mine = stories.filter((s) => shardOf(s.id) === shard)
  const storiesJson = mine.map((s) => {
    const entry = {
      id: s.id,
      group: s.group,
      story: s.story,
      acceptance: s.acceptance,
      inputs: storyInputs(s),
      radar_start: s.radar_start,
      prod: s.prod,
      prod_testnet: s.prod.map((u) => productionUrl(u, 'testnet')),
      phone: s.phone,
    }
    if (s.network) entry.network = s.network
    return entry
  })
  const fixtures = {}
  for (const net of ['mainnet', 'testnet']) {
    const f = loadFixtures(net, fixturesDir)
    if (f) fixtures[net] = { generatedAt: f.generatedAt, entities: f.entities, missing: f.missing }
  }
  const prodHosts = [...new Set(mine.flatMap((s) => s.prod.map((u) => new URL(u).host)))].sort()
  return { storiesJson, fixtures, prodHosts }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      shard: { type: 'string' },
      out: { type: 'string' },
      rubric: { type: 'string' },
      browser: { type: 'string' },
      'fixtures-dir': { type: 'string', default: FIXTURES_DIR },
    },
  })
  if (!values.shard || !values.out || !values.rubric || !values.browser) {
    console.error(
      'usage: node review/packet.mjs --shard S1 --out DIR --rubric rubric.md --browser browser.md [--fixtures-dir DIR]',
    )
    process.exit(2)
  }
  for (const f of [values.rubric, values.browser])
    if (!existsSync(f)) throw new Error(`not found: ${f}`)
  const { storiesJson, fixtures, prodHosts } = buildPacket({
    shard: values.shard,
    fixturesDir: values['fixtures-dir'],
  })
  mkdirSync(values.out, { recursive: true })
  writeFileSync(path.join(values.out, 'stories.json'), JSON.stringify(storiesJson, null, 2) + '\n')
  writeFileSync(path.join(values.out, 'fixtures.json'), JSON.stringify(fixtures, null, 2) + '\n')
  copyFileSync(values.rubric, path.join(values.out, 'rubric.md'))
  copyFileSync(values.browser, path.join(values.out, 'browser.md'))
  console.log(
    JSON.stringify({
      shard: values.shard,
      out: values.out,
      stories: storiesJson.length,
      production_hosts: prodHosts,
    }),
  )
}
