import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import { shardOf } from './shards.mjs'

export const REVIEW_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const STORIES_PATH = path.join(REVIEW_DIR, 'stories.yaml')
export const FIXTURES_DIR = path.join(REVIEW_DIR, 'fixtures')

const REQUIRED = ['id', 'group', 'story', 'acceptance', 'shard', 'radar_start', 'prod', 'phone']

export function loadStories(file = STORIES_PATH) {
  const doc = YAML.parse(readFileSync(file, 'utf8'))
  const stories = doc?.stories
  if (!Array.isArray(stories)) throw new Error(`${file}: expected a top-level "stories" list`)
  const seen = new Set()
  for (const s of stories) {
    for (const k of REQUIRED)
      if (s[k] === undefined) throw new Error(`${s.id ?? '?'}: missing "${k}"`)
    if (seen.has(s.id)) throw new Error(`duplicate story id ${s.id}`)
    seen.add(s.id)
    if (s.shard !== shardOf(s.id))
      throw new Error(`${s.id}: shard ${s.shard} should be ${shardOf(s.id)}`)
    if (!Array.isArray(s.prod) || s.prod.length === 0)
      throw new Error(`${s.id}: prod must be a non-empty list`)
  }
  return stories
}

const PLACEHOLDER = /\{([a-z0-9_]+)(?:\.([a-z0-9_]+))?\}/g

export function placeholderKeys(...texts) {
  const keys = new Set()
  for (const t of texts) for (const m of String(t ?? '').matchAll(PLACEHOLDER)) keys.add(m[1])
  return [...keys].sort()
}

export function storyInputs(story) {
  return placeholderKeys(story.story, story.acceptance, story.radar_start, ...story.prod)
}

export function resolveTemplate(template, entities) {
  const missing = []
  const out = template.replace(PLACEHOLDER, (whole, key, field) => {
    const e = entities?.[key]
    const v = e == null ? undefined : field ? e[field] : e.id
    if (v === undefined || v === null || v === '') {
      missing.push(field ? `${key}.${field}` : key)
      return whole
    }
    return encodeURIComponent(String(v))
  })
  return { url: out, missing }
}

export function loadFixtures(network, dir = FIXTURES_DIR) {
  try {
    return JSON.parse(readFileSync(path.join(dir, `${network}.json`), 'utf8'))
  } catch {
    return null
  }
}

export function storyNetwork(story) {
  return story.network ?? 'mainnet'
}
