import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps',
  'web',
  'src',
  'test',
  'fixtures',
  'http',
)

let newest: Date | undefined

/** When the newest recorded HTTP fixture was captured: the moment fixture data is "now". */
export function fixturesRecordedAt(): Date {
  if (newest) return newest
  let latest = 0
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.json')) {
        const at = Date.parse(
          (JSON.parse(readFileSync(full, 'utf8')) as { recordedAt?: string }).recordedAt ?? '',
        )
        if (at > latest) latest = at
      }
    }
  }
  walk(FIXTURES)
  if (latest === 0) throw new Error(`no recordedAt found under ${FIXTURES}`)
  newest = new Date(latest)
  return newest
}

export async function freezeClock(page: Page, recordedAt: string | number | Date): Promise<void> {
  await page.clock.setFixedTime(new Date(recordedAt))
}

/** Starts the page's clock at the fixtures' `recordedAt`, so relative times and stale marks are stable. */
export async function pinClockToFixtures(page: Page): Promise<Date> {
  const time = fixturesRecordedAt()
  await page.clock.install({ time })
  return time
}

/** Starts the page's clock `afterMs` past Radar's last recorded mainnet crawl, the oldest reading the home page shows. */
export async function pinClockAfterCrawl(page: Page, afterMs: number): Promise<void> {
  const summary = JSON.parse(
    readFileSync(path.join(FIXTURES, 'radar', 'mainnet', 'summary.json'), 'utf8'),
  ) as { body: { crawl: { finished: number } } }
  await page.clock.install({ time: new Date(summary.body.crawl.finished * 1000 + afterMs) })
}
