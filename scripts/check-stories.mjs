#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadStories } from '../review/lib/stories.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TAG = /@((?:RA|NX|PE|IN|HY|X)-\d{2})\b/g

export function collectTags(dir) {
  const tags = new Map()
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.spec\.[cm]?[jt]sx?$/.test(entry.name)) {
        const text = readFileSync(full, 'utf8')
        for (const m of text.matchAll(TAG)) {
          const files = tags.get(m[1]) ?? new Set()
          files.add(path.relative(root, full))
          tags.set(m[1], files)
        }
      }
    }
  }
  walk(dir)
  return tags
}

export function checkStories(storyIds, tags) {
  const missing = storyIds.filter((id) => !tags.has(id))
  const unknown = [...tags.keys()].filter((id) => !storyIds.includes(id))
  return { total: storyIds.length, tagged: storyIds.length - missing.length, missing, unknown }
}

/** For one package's own check: which of `wanted` have no tagged test, and which name no story. */
export function checkOnly(storyIds, wanted, tags) {
  const unknown = wanted.filter((id) => !storyIds.includes(id))
  const missing = wanted.filter((id) => storyIds.includes(id) && !tags.has(id))
  return { covered: wanted.length - unknown.length - missing.length, missing, unknown }
}

/** A tag that names no story always fails; missing stories fail only with `--strict`. */
export function failed(result, strict) {
  return result.unknown.length > 0 || (strict && result.missing.length > 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      tests: { type: 'string', default: path.join(root, 'e2e', 'tests') },
      stories: { type: 'string' },
      strict: { type: 'boolean', default: false },
      only: { type: 'string' },
    },
  })
  const ids = loadStories(values.stories).map((s) => s.id)
  if (values.only) {
    const wanted = values.only
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    const only = checkOnly(ids, wanted, collectTags(values.tests))
    console.log(`${only.covered}/${wanted.length} named stories have at least one tagged test`)
    if (only.missing.length)
      console.log(`missing ${only.missing.length}: ${only.missing.join(' ')}`)
    if (only.unknown.length) console.log(`naming no story: ${only.unknown.join(' ')}`)
    process.exit(only.missing.length + only.unknown.length > 0 ? 1 : 0)
  }
  const result = checkStories(ids, collectTags(values.tests))
  console.log(`${result.tagged}/${result.total} stories have at least one tagged test`)
  if (result.missing.length) {
    const byPrefix = Object.groupBy(result.missing, (id) => id.split('-')[0])
    console.log(`missing ${result.missing.length}:`)
    for (const [prefix, list] of Object.entries(byPrefix))
      console.log(`  ${prefix}: ${list.join(' ')}`)
  }
  if (result.unknown.length) console.log(`tags naming no story: ${result.unknown.join(' ')}`)
  if (failed(result, values.strict)) process.exit(1)
}
