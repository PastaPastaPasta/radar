import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect as plainExpect, type Page, test as plain } from '@playwright/test'
import { fixturesRecordedAt, pinClockToFixtures } from '../helpers/clock'
import { expect, test } from '../helpers/test'

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps/web/src/test/fixtures/http',
)

interface Status {
  networks: Record<string, { chain: { updated: number } }>
}

async function fetchInPage(page: Page, url: string) {
  await page.goto('/status')
  await page.getByRole('heading', { level: 1 }).waitFor()
  return page.evaluate(async (u) => {
    try {
      const res = await fetch(u)
      return { status: res.status, body: await res.text(), now: Date.now() }
    } catch (err) {
      return { error: String(err) }
    }
  }, url)
}

test.describe('fixture mode', () => {
  test('answers from the recording, not the network', async ({ page }) => {
    const recorded = JSON.parse(
      readFileSync(path.join(FIXTURES, 'radar/global/status.json'), 'utf8'),
    ) as { status: number; recordedAt: string; body: Status }
    const got = await fetchInPage(page, 'https://radar.dashhq.org/api/v1/status')
    expect(got).toHaveProperty('status', recorded.status)
    const { body, now } = got as { body: string; now: number }
    const served = JSON.parse(body) as Status
    // The fixture server replays only each chain reading's time, at the age it had when recorded (`withChainAge` in
    // apps/web/src/test/msw/handlers/fixtures.ts), so the reference-tip check sees the crawler keeping up. That age
    // must match the recording; every other field must be the recording's, byte for byte.
    const ageAt = (updated: number, at: number) => at / 1000 - updated
    const expected = structuredClone(recorded.body)
    for (const [net, n] of Object.entries(expected.networks)) {
      const replayed = served.networks[net]!.chain.updated
      expect(
        Math.abs(ageAt(replayed, now) - ageAt(n.chain.updated, Date.parse(recorded.recordedAt))),
      ).toBeLessThan(5)
      n.chain.updated = replayed
    }
    expect(served).toEqual(expected)
  })

  test('pins the page clock to the newest recording', async ({ page }) => {
    const pinned = await pinClockToFixtures(page)
    expect(pinned.getTime()).toBe(fixturesRecordedAt().getTime())
    await page.goto('/')
    const now = await page.evaluate(() => Date.now())
    expect(Math.abs(now - pinned.getTime())).toBeLessThan(60_000)
  })
})

plain.describe('fixture mode refusals', () => {
  for (const [name, url] of [
    ['another host', 'https://example.com/anything'],
    ['an unrecorded Hyphen path', '/x/hy/mainnet/api/v1/not-recorded'],
    ['an unrecorded Radar path', 'https://radar.dashhq.org/api/v1/mainnet/not-recorded'],
  ] as const) {
    plain(`${name} fails and is logged as an error`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error' && m.text().startsWith('[radar-fixtures]')) errors.push(m.text())
      })
      plainExpect(await fetchInPage(page, url)).toHaveProperty('error')
      plainExpect(errors).toHaveLength(1)
      plainExpect(errors[0]).toContain(new URL(url, 'http://x').pathname)
    })
  }
})
