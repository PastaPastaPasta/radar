import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { sourceLineOf } from '../helpers/sources'
import { H1 } from '../routes/claims'

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
  await expect(page.getByRole('heading', { level: 1, name: H1.v24 })).toBeVisible()
  await expect(card(page, 'status')).toBeVisible()
  await settled(page)
}

/**
 * Rewrites Radar's activation document in the page, because the recordings hold no network that is mid-window.
 * `mutate` receives the parsed body and the v24 deployment.
 */
async function reshape(page: Page, patch: 'signalling' | 'on-pace' | 'switched') {
  await page.addInitScript((kind) => {
    const original = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const res = await original(input, init)
      if (!url.endsWith('/mainnet/activation')) return res
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
      const marks = Array.from({ length: mined }, (_, i) =>
        (
          kind === 'on-pace'
            ? i % 10 !== 0
            : kind === 'switched'
              ? i >= 1000 || i % 2 === 1
              : i % 3 === 0
        )
          ? '#'
          : '-',
      ).join('')
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
        pools:
          kind === 'switched'
            ? [
                { pool: 'ViaBTC', blocks: 750, signalling: 250 },
                { pool: 'F2Pool', blocks: 750, signalling: 750 },
              ]
            : kind === 'on-pace'
              ? [
                  { pool: 'F2Pool', blocks: 1250, signalling: 1250 },
                  { pool: 'ViaBTC', blocks: 150, signalling: 0 },
                  { pool: 'AntPool', blocks: 60, signalling: 60 },
                  { pool: null, blocks: 40, signalling: 40 },
                ]
              : [
                  { pool: 'ViaBTC', blocks: 1000, signalling: 0 },
                  { pool: 'F2Pool', blocks: 400, signalling: 400 },
                  { pool: 'AntPool', blocks: 60, signalling: 60 },
                  { pool: null, blocks: 40, signalling: 40 },
                ],
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
    await expect(sourceLineOf(status).locator('[data-source="radar"]')).toBeVisible()
    await expect(tracker(page).locator('[data-stale-notice]')).toHaveCount(0)
    await expectAccessible(page)
  })

  test('refreshes itself about every five minutes and says when the reading is stale @RA-70', async ({
    page,
  }) => {
    let reads = 0
    page.on('request', (r) => {
      if (r.url().endsWith('/api/v1/mainnet/activation')) reads++
    })
    await open(page, 'mainnet', MIN)
    await expect.poll(() => reads).toBeGreaterThanOrEqual(1)
    const first = reads
    await page.clock.fastForward(5 * MIN + 1_000)
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

  test("answers at a glance whether this window can lock in, which window does at today's pace, and which pools hold it back @RA-70 @RA-72", async ({
    page,
  }) => {
    await reshape(page, 'signalling')
    await open(page)
    const lockIn = card(page, 'lock-in')
    await expect(lockIn.locator('[data-v24-lock-in]')).toHaveAttribute('data-verdict', 'impossible')
    await expect(lockIn.locator('.rx-v24-verdict')).toHaveText('Out of reach')
    await expect(lockIn).toContainText('Needs 2,726 more signalling blocks; only 2,532 are left.')
    await expect(
      lockIn.getByRole('img', {
        name: "This window's 4,032 blocks: 500 signalled, 1,000 did not and 2,532 are left. 3,226 must signal; at today's pace about 1,344 do.",
      }),
    ).toBeVisible()
    await expect(lockIn).toContainText('500 of 1,500')
    await expect(lockIn).toContainText('2,532')
    await expect(lockIn).toContainText('3,226')
    await expect(lockIn).toContainText('out of reach')
    const projection = lockIn.locator('[data-v24-projection]')
    await expect(projection).toHaveAttribute('data-lock-in', 'floor')
    await expect(projection).toContainText(
      "At today's pace no window locks in: even the lowest threshold is 60.0%.",
    )
    await projection.getByRole('button', { name: 'How the outlook is worked out' }).click()
    const tip = page.locator('.rx-v24-tip')
    await expect(tip).toContainText(
      "Today's pace is this window's so far: 500 of 1,500 blocks signalled (33.3%).",
    )
    await expect(tip).toContainText(
      'At that pace no window locks in: even the lowest threshold, 2,420 of 4,032 blocks (60.0%), is above it.',
    )
    await page.keyboard.press('Escape')
    await expect(tip).toHaveCount(0)

    const pools = card(page, 'pools')
    const bar = pools.getByRole('img', { name: /^Share of this window's blocks by pool: / })
    await expect(bar).toHaveAttribute('aria-label', /ViaBTC: 66\.7%, not signalling/)
    await expect(pools.locator('[data-blocker]')).toHaveAttribute('data-pool', 'ViaBTC')
    await expect(pools.locator('[data-v24-pool-bar]')).toContainText('80% needed')
    await expect(pools.locator('tbody tr')).toHaveCount(4)
    await expect(pools.locator('tbody tr').first()).toContainText('ViaBTC')
    await expect(pools.locator('tbody tr').first()).toContainText('no')
    await expect(pools.locator('tbody tr').last()).toContainText('Untagged')
    await pools.getByRole('button', { name: 'About the pool tags' }).click()
    await expect(page.locator('.rx-v24-tip')).toContainText('Best effort')
    await page.keyboard.press('Escape')
    await expect(
      card(page, 'thresholds').locator('tbody tr', { hasText: "locks in at today's pace" }),
    ).toHaveCount(0)
    await expectAccessible(page)
  })

  test("calls a window on pace when today's share reaches its threshold @RA-70", async ({
    page,
  }) => {
    await reshape(page, 'on-pace')
    await open(page)
    const lockIn = card(page, 'lock-in')
    await expect(lockIn.locator('[data-v24-lock-in]')).toHaveAttribute('data-verdict', 'on-track')
    await expect(lockIn.locator('.rx-v24-verdict')).toHaveText('On pace')
    await expect(lockIn).toContainText('Needs 74.1% of the blocks left; signalling runs at 90.0%.')
    await expect(lockIn.locator('[data-v24-projection]')).toHaveAttribute('data-lock-in', '0')
    await expect(lockIn.locator('[data-v24-projection]')).toContainText(
      "At today's pace window #1 locks in",
    )
    await expect(card(page, 'pools').locator('[data-blocker]')).toHaveAttribute(
      'data-pool',
      'ViaBTC',
    )
    // Segments and the "needed" tick share one scale: green ends at the signalling share of the bar (1,350 of 1,500).
    const poolBar = card(page, 'pools').locator('.rx-v24-pools')
    const [bar, lastGreen, blocker] = await Promise.all([
      poolBar.boundingBox(),
      poolBar.locator('.rx-v24-yes').last().boundingBox(),
      poolBar.locator('[data-blocker]').boundingBox(),
    ])
    const share = bar!.x + 0.9 * bar!.width
    expect(Math.abs(lastGreen!.x + lastGreen!.width - share)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(blocker!.x - share)).toBeLessThanOrEqual(0.5)
  })

  test('shows a pool that switched mid-window as now signalling, its share whole @RA-72', async ({
    page,
  }) => {
    await reshape(page, 'switched')
    await open(page)
    const pools = card(page, 'pools')
    await expect(pools.locator('[data-blocker]')).toHaveCount(0)
    await expect(pools.locator('[data-switched]')).toHaveAttribute('data-pool', 'ViaBTC')
    await expect(pools.locator('[data-pool-span="ViaBTC"]')).toContainText('ViaBTC 50.0% in all')
    const bar = pools.getByRole('img', { name: /^Share of this window's blocks by pool: / })
    await expect(bar).toHaveAttribute(
      'aria-label',
      /ViaBTC: 33\.3%, not signalling before block 2,577,447/,
    )
    const via = pools.locator('tbody tr', { hasText: 'ViaBTC' })
    await expect(via.locator('[data-trend="on"]')).toContainText('now signalling')
    await expect(via).toContainText('every block since 2,577,447 (about')
    await expect(via).toContainText('250 of 750 this window')
    const now = pools.locator('[data-v24-pools-now]')
    await expect(now).toContainText('Every block since 2,577,447 has signalled: the last 501')
    await expect(now).toContainText(
      'If every pool keeps signalling as it does now (100.0% of blocks)',
    )
    await expectAccessible(page)
  })

  test('has no lock-in card or pools before miners can signal @RA-70', async ({ page }) => {
    await open(page)
    await expect(card(page, 'lock-in')).toHaveCount(0)
    await expect(card(page, 'pools')).toHaveCount(0)
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
    await expect(
      page.getByRole('heading', { level: 1, name: 'Core 24 activation', exact: true }),
    ).toBeVisible()
    await settled(page)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(tracker(page).locator('#tip')).toContainText('2,570,085')
    await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
  })
})
