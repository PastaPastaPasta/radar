import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

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
  'radar',
)

const MIN = 60_000

type Net = 'mainnet' | 'testnet'

/** When the recorded activation reading of `net` was taken, in ms. */
function updated(net: Net): number {
  const doc = JSON.parse(readFileSync(path.join(FIXTURES, net, 'activation.json'), 'utf8')) as {
    body: { updated: number }
  }
  return doc.body.updated * 1000
}

async function pinAfterReading(page: Page, after: number, net: Net = 'mainnet') {
  await page.clock.install({ time: new Date(updated(net) + after) })
}

const tracker = (page: Page) => page.locator('[data-page="/v24"]')
const card = (page: Page, id: string) => tracker(page).locator(`section#${id}`)

async function open(page: Page, net: Net = 'mainnet', after = MIN) {
  await pinAfterReading(page, after, net)
  await page.goto(net === 'mainnet' ? '/v24' : '/v24?network=testnet')
  await expect(page.getByRole('heading', { level: 1, name: 'Core 24 activation' })).toBeVisible()
  await expect(card(page, 'status')).toBeVisible()
  await settled(page)
}

/**
 * Rewrites Radar's activation document in the page, because the recordings hold no network that is mid-window.
 * `mutate` receives the parsed body and the v24 deployment.
 */
async function reshape(page: Page, patch: 'signalling') {
  await page.addInitScript((kind) => {
    const original = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const res = await original(input, init)
      if (!url.endsWith('/mainnet/activation') || kind !== 'signalling') return res
      const body = (await res.json()) as {
        deployments: {
          name: string
          state: string
          since: number
          ehf: { height: number | null; block: unknown }
          outlook: Record<string, unknown>
          window: Record<string, unknown>
          windows: Record<string, unknown>[]
          schedule: { attempt: number; threshold: number }[]
          params: { window: number }
        }[]
      }
      const d = body.deployments.find((x) => x.name === 'v24')!
      const size = d.params.window
      const mined = 1500
      const marks = Array.from({ length: mined }, (_, i) => (i % 3 === 0 ? '#' : '-')).join('')
      const count = marks.split('#').length - 1
      const start = { height: 2_576_448, time: 1_795_300_000, estimated: false }
      const end = { height: 2_576_448 + size - 1, time: 1_795_700_000, estimated: true }
      const threshold = d.schedule[0]!.threshold
      d.state = 'started'
      d.since = 2_576_448
      d.ehf.height = 2_575_000
      d.ehf.block = { height: 2_575_000, time: 1_795_000_000, estimated: false }
      const window = {
        attempt: 0,
        state: 'started',
        count,
        mined,
        threshold,
        since: 2_576_448,
        start,
        end,
        signalling: marks,
        needed: threshold - count,
        possible: false,
        remaining: size - mined,
      }
      d.window = window
      d.windows = [window]
      d.outlook = {
        phase: 'signalling',
        needed: threshold - count,
        possible: false,
        remaining: size - mined,
        window_end: end,
        next_window: { height: 2_576_448 + size, time: 1_795_800_000, estimated: true },
        next_threshold: d.schedule[1]!.threshold,
        lock_in_if_reached: { height: 2_576_448 + size, time: 1_795_800_000, estimated: true },
        activation_if_reached: {
          height: 2_576_448 + 2 * size,
          time: 1_796_900_000,
          estimated: true,
        },
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
  }, patch)
}

test.describe('Core 24 activation tracker', () => {
  test('shows the status, threshold, current window, earliest activation, masternode signal and milestones @RA-70', async ({
    page,
  }) => {
    await open(page)
    const status = card(page, 'status')
    await expect(status).toContainText('Not started')
    await expect(status.locator('[data-v24-status]')).toContainText('Lock-in threshold')
    await expect(status.locator('[data-v24-status]')).toContainText('80%')
    await expect(status.locator('[data-v24-status]')).toContainText('3,226 of 4,032 blocks')
    await expect(status.locator('[data-v24-status]')).toContainText('Next window that counts')
    await expect(status.locator('[data-v24-status]')).toContainText('block 2,572,416')
    await expect(status.locator('[data-v24-status]')).toContainText('Earliest activation')
    await expect(status.locator('[data-v24-status]')).toContainText('block 2,580,480')
    await expect(status.locator('[data-v24-status]')).toContainText('Masternode signal')
    await expect(status.locator('[data-v24-status]')).toContainText('not mined yet')
    const road = status.locator('[data-milestones] li')
    await expect(road).toHaveCount(5)
    await expect(road.first()).toHaveAttribute('data-done', 'true')
    await expect(status.locator('[data-source="radar"]')).toBeVisible()
    await expect(tracker(page).locator('[data-stale-notice]')).toHaveCount(0)
    await expectAccessible(page)
  })

  test('refreshes itself about every minute and says when the reading is stale @RA-70', async ({
    page,
  }) => {
    let reads = 0
    page.on('request', (r) => {
      if (r.url().endsWith('/api/v1/mainnet/activation')) reads++
    })
    await open(page, 'mainnet', MIN)
    await expect.poll(() => reads).toBeGreaterThanOrEqual(1)
    const first = reads
    await page.clock.fastForward(61_000)
    await expect.poll(() => reads).toBeGreaterThan(first)
    await expect(tracker(page).locator('[data-stale-notice]')).toHaveCount(0)
    await page.clock.fastForward(11 * MIN)
    await expect(tracker(page).locator('[data-stale-notice]')).toBeVisible()
    await expect(tracker(page).locator('[data-stale-notice]')).toContainText(
      'This reading is stale',
    )
  })

  test('on testnet, where it is active, shows the activation and no signal to wait for @RA-70', async ({
    page,
  }) => {
    await open(page, 'testnet')
    await expect(card(page, 'status')).toContainText('Active')
    await expect(card(page, 'status')).toContainText('since block 1,578,000')
    await expect(card(page, 'status').locator('[data-milestone="active"]')).toHaveAttribute(
      'data-done',
      'true',
    )
    await expect(card(page, 'signal')).toContainText('in block 1,565,132')
    await expect(card(page, 'thresholds')).toBeVisible()
  })

  test('draws the quorum meter with its threshold marker and the quorums that would sign now @RA-71', async ({
    page,
  }) => {
    await open(page)
    const signal = card(page, 'signal')
    const meter = signal.getByRole('meter')
    await expect(meter).toHaveAttribute('aria-valuemax', '400')
    await expect(meter).toHaveAttribute('aria-valuenow', '327')
    await expect(signal).toContainText('340 must sign')
    const rows = signal.getByRole('row')
    await expect(rows.filter({ hasText: 'would sign now' })).toHaveCount(1)
    await expect(signal.locator('tbody tr')).toHaveCount(4)
    await expect(signal.locator('th', { hasText: 'Announce 24' }).first()).toBeAttached()
    await expect(signal).toContainText('327')
  })

  test('hides the masternode signal section content once the signal is mined @RA-71', async ({
    page,
  }) => {
    await open(page, 'testnet')
    await expect(card(page, 'signal').getByRole('meter')).toHaveCount(0)
    await expect(card(page, 'signal').locator('table')).toHaveCount(0)
    await expect(card(page, 'signal').locator('[data-signal-mined]')).toBeVisible()
  })

  test("shows miners' signalling window by window, the thresholds and how activation works @RA-72", async ({
    page,
  }) => {
    await open(page)
    const miners = card(page, 'miners')
    await expect(miners.locator('[data-v24-windows]')).toContainText(
      'Signalling and threshold, window by window',
    )
    await expect(
      miners.getByRole('img', { name: /Signalling share and threshold for/ }),
    ).toBeVisible()
    await miners.getByRole('button', { name: 'Show as a table' }).click()
    await expect(miners.locator('.rx-chart__table table')).toContainText('#1')

    const thresholds = card(page, 'thresholds')
    await expect(thresholds.locator('th', { hasText: 'Threshold' }).first()).toBeAttached()
    await expect(thresholds.locator('tbody tr')).toHaveCount(11)
    await expect(thresholds).toContainText('3,226 of 4,032')
    await expect(thresholds).toContainText('2,420 of 4,032')

    const how = card(page, 'how')
    await expect(how).toContainText('hard fork')
    await expect(how).toContainText('4,032-block windows')
    await expect(how.getByRole('link', { name: 'chainparams.cpp' })).toHaveAttribute(
      'href',
      /github\.com\/dashpay\/dash\/blob\/v24\.0\.0/,
    )
  })

  test('draws the current window block by block with its cumulative line and projection @RA-72', async ({
    page,
  }) => {
    await reshape(page, 'signalling')
    await open(page)
    const status = card(page, 'status')
    await expect(status).toContainText('Signalling')
    await expect(status.locator('[data-v24-status]')).toContainText('This window')
    const window = card(page, 'miners').locator('[data-v24-window]')
    await expect(window).toContainText('This window (attempt 1), block by block')
    await expect(window).toContainText('blocks 2,576,448–2,580,479')
    await expect(window.getByRole('img', { name: /blocks so far signalled/ })).toBeVisible()
    await expect(window).toContainText('at this pace the window ends with')
    await window.getByRole('button', { name: 'Show as a table' }).click()
    await expect(window.locator('.rx-chart__table table')).toContainText('1,500')
    await expect(card(page, 'thresholds').locator('tbody tr', { hasText: 'now' })).toHaveCount(1)
    await expect(card(page, 'signal')).toContainText('in block 2,575,000')
  })

  test('fits a phone with its charts and tables reachable @RA-70 @RA-72', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await open(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    const miners = card(page, 'miners')
    await miners.scrollIntoViewIfNeeded()
    const chart = miners.locator('.rx-chart__canvas').first()
    expect((await chart.boundingBox())!.width).toBeLessThanOrEqual(390)
    await miners.getByRole('button', { name: 'Show as a table' }).click()
    await expect(miners.locator('.rx-chart__table table')).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await expectAccessible(page)
  })

  test('says once that it needs Radar and shows the Core tip in Decentralized only mode @RA-70', async ({
    page,
  }) => {
    await page.goto('/v24?sources=decentralized')
    await expect(page.getByRole('heading', { level: 1, name: 'Core 24 activation' })).toBeVisible()
    await settled(page)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(tracker(page).locator('#tip')).toContainText('2,570,085')
    await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
  })
})
