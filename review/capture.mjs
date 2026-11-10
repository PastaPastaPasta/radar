#!/usr/bin/env node
/* global document */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from './lib/playwright.mjs'
import { sleep } from './lib/http.mjs'
import { productionUrl, radarUrl, siteOf } from './lib/sites.mjs'
import { loadFixtures, loadStories, resolveTemplate, storyNetwork } from './lib/stories.mjs'
import { shardOf } from './lib/shards.mjs'
import { installQaGuard } from './qa-guard.mjs'

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
}
const PER_HOST_GAP_MS = 400
const PER_HOST_CONCURRENCY = 2
const NAV_TIMEOUT_MS = 30_000
const IDLE_TIMEOUT_MS = 12_000
const SETTLE_MS = 1_200

const { values: opts } = parseArgs({
  options: {
    tag: { type: 'string' },
    sites: { type: 'string', default: 'both' },
    'radar-url': { type: 'string', default: 'http://radar.localhost:8890' },
    stories: { type: 'string' },
    shard: { type: 'string' },
    viewports: { type: 'string', default: 'desktop,phone' },
    themes: { type: 'string', default: 'light,dark' },
    concurrency: { type: 'string', default: '2' },
    out: { type: 'string' },
    'full-page': { type: 'boolean', default: false },
    resume: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
})

if (!opts.tag) {
  console.error(
    'usage: node review/capture.mjs --tag <tag> [--sites prod|radar|both] [--radar-url URL] [--stories ID,ID | --shard S1] [--viewports desktop,phone] [--themes light,dark] [--concurrency N] [--full-page] [--resume] [--dry-run]',
  )
  process.exit(2)
}

const slug = (s) =>
  s
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
const hash8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)

export function planJobs({ stories, fixturesByNet, sites, radarBase, viewports, themes, outDir }) {
  const jobs = new Map()
  const perStory = {}
  const skipped = []
  for (const story of stories) {
    const net = storyNetwork(story)
    const entities = fixturesByNet[net]?.entities
    const targets = []
    if (sites.includes('radar')) targets.push({ kind: 'radar', template: story.radar_start })
    if (sites.includes('prod'))
      story.prod.forEach((p, i) => targets.push({ kind: 'prod', template: p, index: i }))
    perStory[story.id] = []
    for (const t of targets) {
      const { url: resolved, missing } = resolveTemplate(t.template, entities)
      if (missing.length) {
        skipped.push({ story: story.id, kind: t.kind, template: t.template, missing })
        continue
      }
      const url =
        t.kind === 'radar' ? radarUrl(radarBase, resolved, net) : productionUrl(resolved, net)
      const site = t.kind === 'radar' ? 'radar' : siteOf(url)
      const entry = { site, kind: t.kind, url, files: {} }
      for (const vp of viewports)
        for (const theme of themes) {
          const key = `${site}|${url}|${vp}|${theme}`
          const rel = path.join(
            site,
            `${slug(new URL(url).pathname) || 'home'}-${hash8(url)}`,
            `${vp}-${theme}.png`,
          )
          if (!jobs.has(key))
            jobs.set(key, {
              key,
              site,
              kind: t.kind,
              url,
              vp,
              theme,
              rel,
              file: path.join(outDir, rel),
              network: net,
            })
          entry.files[`${vp}-${theme}`] = rel
        }
      perStory[story.id].push(entry)
    }
  }
  return { jobs: [...jobs.values()], perStory, skipped }
}

class HostLimiter {
  constructor() {
    this.state = new Map()
  }
  async run(host, fn) {
    const s = this.state.get(host) ?? { active: 0, last: 0, queue: [] }
    this.state.set(host, s)
    while (s.active >= PER_HOST_CONCURRENCY) await new Promise((r) => s.queue.push(r))
    s.active++
    const wait = Math.max(0, s.last + PER_HOST_GAP_MS - Date.now())
    s.last = Date.now() + wait
    if (wait) await sleep(wait)
    try {
      return await fn()
    } finally {
      s.active--
      s.queue.shift()?.()
    }
  }
}

async function themedContext(browser, job) {
  const profile = VIEWPORTS[job.vp]
  const context = await browser.newContext({
    ...profile,
    deviceScaleFactor: 2,
    colorScheme: job.theme,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  })
  const guard = await installQaGuard(context)
  const u = new URL(job.url)
  await context.addCookies([{ name: 'dh_theme', value: job.theme, url: job.url, sameSite: 'Lax' }])
  if (u.hostname.endsWith('.dashhq.org')) {
    await context.addCookies([
      {
        name: 'dh_theme',
        value: job.theme,
        domain: '.dashhq.org',
        path: '/',
        secure: true,
        sameSite: 'Lax',
      },
    ])
  }
  return { context, guard }
}

async function capture(browser, limiter, job, fullPage) {
  const result = {
    key: job.key,
    site: job.site,
    url: job.url,
    vp: job.vp,
    theme: job.theme,
    file: job.rel,
    status: 'ok',
  }
  if (existsSync(job.file) && opts.resume) return { ...result, status: 'cached' }
  const started = Date.now()
  const { context, guard } = await themedContext(browser, job)
  const consoleErrors = []
  try {
    const page = await context.newPage()
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 300)))
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`))
    let response = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await limiter.run(new URL(job.url).host, () =>
          page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }),
        )
        break
      } catch (e) {
        if (attempt === 1) throw e
        await sleep(1500)
      }
    }
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS }).catch(() => {
      result.idleTimeout = true
    })
    await sleep(SETTLE_MS)
    result.httpStatus = response?.status() ?? null
    const textLength = await page
      .evaluate(() => document.body?.innerText?.trim().length ?? 0)
      .catch(() => 0)
    result.textLength = textLength
    if (result.httpStatus >= 400) result.status = 'http-error'
    else if (textLength < 20) result.status = 'blank'
    mkdirSync(path.dirname(job.file), { recursive: true })
    await page.screenshot({ path: job.file, fullPage, animations: 'disabled', caret: 'hide' })
  } catch (e) {
    result.status = 'error'
    result.error = String(e.message).split('\n')[0]
  } finally {
    result.ms = Date.now() - started
    result.consoleErrors = consoleErrors.slice(0, 5)
    result.consoleErrorCount = consoleErrors.length
    result.blocked = guard.blocked
    await context.close().catch(() => {})
  }
  return result
}

async function main() {
  const sites = opts.sites === 'both' ? ['radar', 'prod'] : [opts.sites]
  if (!sites.every((s) => s === 'radar' || s === 'prod'))
    throw new Error('--sites must be prod, radar or both')
  const viewports = opts.viewports.split(',').filter(Boolean)
  const themes = opts.themes.split(',').filter(Boolean)
  let stories = loadStories()
  if (opts.stories) {
    const wanted = new Set(opts.stories.split(','))
    stories = stories.filter((s) => wanted.has(s.id))
  }
  if (opts.shard) stories = stories.filter((s) => shardOf(s.id) === opts.shard)

  const fixturesByNet = { mainnet: loadFixtures('mainnet'), testnet: loadFixtures('testnet') }
  if (!fixturesByNet.mainnet)
    throw new Error('review/fixtures/mainnet.json is missing; run node review/fixtures.mjs')
  const outDir = path.resolve(opts.out ?? path.join('shots', opts.tag))
  const plan = planJobs({
    stories,
    fixturesByNet,
    sites,
    radarBase: opts['radar-url'],
    viewports,
    themes,
    outDir,
  })
  console.log(
    `${stories.length} stories → ${plan.jobs.length} screenshots (${plan.skipped.length} story URLs skipped for missing fixtures)`,
  )
  if (opts['dry-run']) {
    for (const j of plan.jobs) console.log(`${j.site}\t${j.vp}-${j.theme}\t${j.url}`)
    return
  }

  mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch()
  const limiter = new HostLimiter()
  const results = []
  const queue = [...plan.jobs]
  const startedAt = new Date().toISOString()
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const r = await capture(browser, limiter, job, opts['full-page'])
      results.push(r)
      const mark = r.status === 'ok' || r.status === 'cached' ? '.' : 'x'
      process.stdout.write(mark)
      if (results.length % 50 === 0)
        process.stdout.write(` ${results.length}/${plan.jobs.length}\n`)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Number(opts.concurrency)) }, worker))
  await browser.close()
  process.stdout.write('\n')

  const manifest = {
    tag: opts.tag,
    startedAt,
    finishedAt: new Date().toISOString(),
    sites,
    viewports,
    themes,
    deviceScaleFactor: 2,
    stories: plan.perStory,
    skipped: plan.skipped,
    shots: results,
  }
  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  const by = (k) => results.reduce((a, r) => ((a[r[k]] = (a[r[k]] ?? 0) + 1), a), {})
  const failures = results.filter((r) => !['ok', 'cached'].includes(r.status))
  console.log(`done: ${results.length} screenshots, ${failures.length} failed or flagged`)
  console.log('by site:', by('site'), 'by status:', by('status'))
  for (const f of failures)
    console.log(`  ${f.status}\t${f.vp}-${f.theme}\t${f.url}\t${f.error ?? f.httpStatus ?? ''}`)
  const blocked = results.flatMap((r) => r.blocked ?? [])
  if (blocked.length)
    console.log(`QA guard blocked ${blocked.length} request(s); see manifest.json`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
