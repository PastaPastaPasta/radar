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

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      tests: { type: 'string', default: path.join(root, 'e2e', 'tests') },
      stories: { type: 'string' },
      strict: { type: 'boolean', default: false },
    },
  })
  const ids = loadStories(values.stories).map((s) => s.id)
  const result = checkStories(ids, collectTags(values.tests))
  console.log(`${result.tagged}/${result.total} stories have at least one tagged test`)
  if (result.missing.length) {
    const byPrefix = Object.groupBy(result.missing, (id) => id.split('-')[0])
    console.log(`missing ${result.missing.length}:`)
    for (const [prefix, list] of Object.entries(byPrefix))
      console.log(`  ${prefix}: ${list.join(' ')}`)
  }
  if (result.unknown.length) console.log(`tags naming no story: ${result.unknown.join(' ')}`)
  if (values.strict && (result.missing.length || result.unknown.length)) process.exit(1)
}
