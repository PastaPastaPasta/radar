import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 20_000 })

const SUMMARY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/web/src/test/fixtures/http/radar/mainnet/summary.json',
)
const crawlFinishedMs = () =>
  (JSON.parse(readFileSync(SUMMARY, 'utf8')) as { body: { crawl: { finished: number } } }).body
    .crawl.finished * 1000

const crawled = (page: Page) =>
  page.locator('[data-source="radar"]', { hasText: 'Crawled by Radar' }).first()

test.describe('one crawl age', () => {
  test('pages opened at one moment show the same crawl age, and Radar’s own checks say they are not the crawl @RA-12', async ({
    page,
  }) => {
    test.slow()
    await page.clock.setFixedTime(new Date(crawlFinishedMs() + 3.5 * 60_000))
    for (const path of ['/', '/nodes', '/map', '/masternodes', '/changes']) {
      await page.goto(path)
      await expect(crawled(page), path).toBeVisible()
      await expect(crawled(page), path).toContainText(/Radar\s*3 min(utes)? ago/)
      await expect(crawled(page), path).not.toContainText('earlier crawl')
    }

    await page.goto('/masternodes?type=evo&view=platform')
    const checked = page.locator('[data-source="radar"]', { hasText: 'Checked by Radar' }).first()
    await expect(checked).toBeVisible()
    await expect(checked, 'the Platform check keeps its own, older time').toContainText(
      /1\d min(utes)? ago/,
    )
  })
})
