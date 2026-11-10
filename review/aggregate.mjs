#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { loadStories } from './lib/stories.mjs'

const VERDICTS = ['PASS', 'PARTIAL', 'FAIL', 'BLOCKED']
const SEVERITIES = ['blocker', 'high', 'medium', 'low']
const FIRST_SHARDS = ['S1', 'S2', 'S3', 'S4', 'S5']
const WHOLE_SHARD = 'S6'

const round1 = (n) => Math.round(n * 10) / 10
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

function num(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new Error(`${what} must be a number, got ${JSON.stringify(v)}`)
  return v
}

export function validateReview(review, source = 'review') {
  if (!review || typeof review !== 'object') throw new Error(`${source}: not an object`)
  if (typeof review.shard !== 'string') throw new Error(`${source}: missing shard`)
  if (!Array.isArray(review.stories)) throw new Error(`${source}: missing stories`)
  for (const s of review.stories) {
    if (!VERDICTS.includes(s.verdict))
      throw new Error(`${source}: ${s.id}: bad verdict ${JSON.stringify(s.verdict)}`)
  }
  num(review.scores?.ux, `${source}: scores.ux`)
  num(review.scores?.design, `${source}: scores.design`)
}

export function aggregate(reviews, { allStoryIds } = {}) {
  const warnings = []
  const byShard = new Map()
  for (const r of reviews) {
    if (byShard.has(r.shard)) warnings.push(`shard ${r.shard} appears twice; using the later file`)
    byShard.set(r.shard, r)
  }

  const verdictOf = new Map()
  const shardOfStory = new Map()
  for (const shard of [
    ...FIRST_SHARDS,
    WHOLE_SHARD,
    ...[...byShard.keys()].filter((k) => ![...FIRST_SHARDS, WHOLE_SHARD].includes(k)),
  ]) {
    const r = byShard.get(shard)
    if (!r) continue
    for (const s of r.stories) {
      if (verdictOf.has(s.id)) {
        warnings.push(
          `story ${s.id} reviewed in ${shardOfStory.get(s.id)} and ${shard}; counted once (${shardOfStory.get(s.id)})`,
        )
        continue
      }
      verdictOf.set(s.id, s)
      shardOfStory.set(s.id, shard)
    }
  }

  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  if (allStoryIds) {
    for (const id of [...verdictOf.keys()]) if (!allStoryIds.includes(id)) verdictOf.delete(id)
  }
  for (const s of verdictOf.values()) counts[s.verdict]++
  const missing = allStoryIds ? allStoryIds.filter((id) => !verdictOf.has(id)) : []
  const unknown = allStoryIds
    ? [...shardOfStory.keys()].filter((id) => !allStoryIds.includes(id))
    : []
  if (missing.length)
    warnings.push(`${missing.length} stories have no verdict and count as not passing`)
  if (unknown.length)
    warnings.push(
      `${unknown.length} reviewed stories are not in stories.yaml and are ignored: ${unknown.join(', ')}`,
    )
  const total = verdictOf.size + missing.length
  const denominator = total - counts.BLOCKED
  const parityShare = denominator > 0 ? counts.PASS / denominator : 0
  const parityScore = 10 * parityShare

  const first = FIRST_SHARDS.map((k) => byShard.get(k)).filter(Boolean)
  const whole = byShard.get(WHOLE_SHARD)
  if (first.length < FIRST_SHARDS.length) {
    warnings.push(`missing shards: ${FIRST_SHARDS.filter((k) => !byShard.has(k)).join(', ')}`)
  }
  if (!whole) warnings.push(`missing shard ${WHOLE_SHARD}`)

  const weights = first.map((r) => r.stories.length)
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const uxFirst =
    first.length && weightSum
      ? first.reduce((a, r, i) => a + r.scores.ux * weights[i], 0) / weightSum
      : null
  const ux =
    uxFirst !== null && whole
      ? (3 * uxFirst + whole.scores.ux) / 4
      : (uxFirst ?? whole?.scores.ux ?? null)

  const designFirst = first.length ? mean(first.map((r) => r.scores.design)) : null
  const designUncapped =
    designFirst !== null && whole
      ? (designFirst + whole.scores.design) / 2
      : (designFirst ?? whole?.scores.design ?? null)
  const cappedShards = [...byShard.values()]
    .filter((r) => r.scores.design_cap_applied === true)
    .map((r) => r.shard)
  const designCapApplied = cappedShards.length >= 2
  const capValues = [...byShard.values()]
    .filter((r) => r.scores.design_cap_applied === true)
    .map((r) => r.scores.design_cap_value)
    .filter((v) => typeof v === 'number')
  const designCapValue = capValues.length ? Math.min(...capValues) : null
  let design = designUncapped
  if (designCapApplied && designUncapped !== null) {
    if (designCapValue === null)
      warnings.push(
        'design cap applied by two or more shards but no cap value is known; pass --design-cap to apply it',
      )
    else design = Math.min(designUncapped, designCapValue)
  }

  const overall =
    ux !== null && design !== null ? 0.5 * ux + 0.3 * design + 0.2 * parityScore : null

  const defects = {}
  for (const sev of SEVERITIES) defects[sev] = 0
  const seenDefects = new Set()
  for (const s of verdictOf.values()) {
    for (const d of s.defects ?? []) {
      const key = `${d.url}|${d.steps}`
      if (seenDefects.has(key)) continue
      seenDefects.add(key)
      if (d.severity in defects) defects[d.severity]++
    }
  }
  const uxDeltas = [...verdictOf.values()]
    .map((s) => s.ux_delta)
    .filter((v) => typeof v === 'number')

  const shards = {}
  for (const [k, r] of byShard) {
    const c = Object.fromEntries(
      VERDICTS.map((v) => [v, r.stories.filter((s) => s.verdict === v).length]),
    )
    shards[k] = {
      reviewer_model: r.reviewer_model ?? null,
      stories: r.stories.length,
      verdicts: c,
      scores: r.scores,
    }
  }

  return {
    parity: {
      stories: total,
      verdicts: counts,
      unreviewed: missing.length,
      parity_share: parityShare,
      parity_score: parityScore,
      not_pass: [...verdictOf.values()]
        .filter((s) => s.verdict !== 'PASS')
        .map((s) => ({ id: s.id, verdict: s.verdict, shard: shardOfStory.get(s.id) })),
      unreviewed_ids: missing,
    },
    ux: {
      story_weighted_s1_s5: uxFirst,
      s6: whole?.scores.ux ?? null,
      aggregate: ux,
      mean_ux_delta: uxDeltas.length ? mean(uxDeltas) : null,
    },
    design: {
      mean_s1_s5: designFirst,
      s6: whole?.scores.design ?? null,
      uncapped: designUncapped,
      cap_applied_by: cappedShards,
      cap_applied: designCapApplied,
      cap_value: designCapValue,
      aggregate: design,
    },
    overall,
    rounded: {
      ux: ux === null ? null : round1(ux),
      design: design === null ? null : round1(design),
      parity_score: round1(parityScore),
      overall: overall === null ? null : round1(overall),
    },
    defects,
    shards,
    warnings,
  }
}

function collectFiles(inputs) {
  const files = []
  for (const input of inputs) {
    if (!existsSync(input)) throw new Error(`not found: ${input}`)
    if (statSync(input).isDirectory()) {
      for (const name of readdirSync(input, { recursive: true }))
        if (path.basename(String(name)) === 'review.json')
          files.push(path.join(input, String(name)))
    } else files.push(input)
  }
  return files
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      stories: { type: 'string' },
      'design-cap': { type: 'string' },
    },
  })
  if (!positionals.length) {
    console.error(
      'usage: node review/aggregate.mjs <review.json | dir>... [--out scores.json] [--stories review/stories.yaml] [--design-cap N]',
    )
    process.exit(2)
  }
  const reviews = collectFiles(positionals).map((f) => {
    const r = JSON.parse(readFileSync(f, 'utf8'))
    validateReview(r, f)
    return r
  })
  if (values['design-cap'] !== undefined) {
    const cap = num(Number(values['design-cap']), '--design-cap')
    for (const r of reviews) r.scores.design_cap_value = cap
  }
  const allStoryIds = values.stories ? loadStories(values.stories).map((s) => s.id) : undefined
  const scores = aggregate(reviews, { allStoryIds })
  const json = JSON.stringify(scores, null, 2) + '\n'
  if (values.out) writeFileSync(values.out, json)
  else process.stdout.write(json)
  for (const w of scores.warnings) console.error(`warning: ${w}`)
}
