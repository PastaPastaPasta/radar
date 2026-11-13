/**
 * Decentralized only mode, end to end: every route in `e2e/routes` on the networks it names, and the switch itself.
 *
 * What it can and cannot see. A page's requests (including a worker's, which Chromium reports to the page) are
 * recorded from before the page loads. Fixture builds replace the SDK's transport with one on the main thread
 * (`FixtureSdkTransport`), so the real SDK worker never runs here. That path is covered by a unit test instead,
 * `src/test/data/sdk/worker-reach.test.ts`: the worker's import graph holds no hosted client, no hosted host and
 * no mode gate, only the wasm-part loader starts a request itself, and the SDK's requests go through the
 * worker's `fetch`, which can only name DAPI evonodes and the quorum host.
 *
 * Polls and probes run on a clock the test advances past the longest of them (`pastEveryPoll`), so a request that
 * bypassed the gate on a timer is caught as well as one made on load.
 */
import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { answerAsUnmined } from '../helpers/fixtures'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { casesNets, networkQuery, ROUTE_CASES, withQuery, type RouteCase } from '../routes'
import { M1_RECORDS } from '../routes/m1'

/** What the page must show in the mode: its own data, the mode's unavailable state, or both. */
const SHOWS = {
  data: 'its data',
  partial: 'data and the unavailable state',
  unavailable: 'the unavailable state',
} as const satisfies Record<RouteCase['decentralized'], string>

/** Pages with no unavailable state whose new parts are checked for accessibility too. */
const A11Y = new Set(['/status', '/sources', '/settings'])

const HOSTED: [name: string, test: (url: URL) => boolean][] = [
  ['Hyphen', (u) => u.pathname.startsWith('/x/hy/') || /(^|\.)kw\.vg$/.test(u.hostname)],
  ['Insight', (u) => u.hostname.startsWith('insight.')],
  ['Platform Explorer', (u) => u.hostname.endsWith('pe.dashhq.org')],
  ['Radar API', (u) => u.hostname === 'radar.dashhq.org'],
]

/** The one outside host the fixture build still asks in the mode: the DAPI node list and the SDK's quorum keys. */
const DISCOVERY = /^quorums\.[a-z0-9-]+\.networks\.dash\.org$/

interface Watch {
  hosted: string[]
  elsewhere: string[]
}

/** Every request the page makes from now on, sorted into hosted backends and hosts the mode does not account for. */
function watchRequests(page: Page): Watch {
  const origin = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1').origin
  const seen: Watch = { hosted: [], elsewhere: [] }
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    const hosted = HOSTED.find(([, hit]) => hit(url))
    if (hosted) seen.hosted.push(`${hosted[0]}: ${request.method()} ${request.url()}`)
    else if (url.origin !== origin && !DISCOVERY.test(url.hostname)) {
      seen.elsewhere.push(`${request.method()} ${request.url()}`)
    }
  })
  return seen
}

/** The mode's mark that is on screen: the glyph in the bar, or the strip under it on a narrow phone. */
const mark = (page: Page) =>
  page.locator('[data-source-mode="decentralized"]').locator('visible=true')
const unavailable = (page: Page) => page.locator('[data-unavailable="mode"]')
const failures = (page: Page) => page.locator('[role="alert"], .rx-empty--error')
/** Provenance stamps that name a hosted backend. */
const hostedStamps = (page: Page) =>
  page.locator(
    '[data-source="hyphen"], [data-source="insight"], [data-source="pe"], [data-source="radar"], [data-source="rate"]',
  )

/** Long enough for a late prefetch or an effect to have fired after the page settled. */
const QUIET_MS = 1_500
/** Past every poll and probe interval (`POLL_MS`, `HEALTH_PROBE_INTERVAL_MS`: 10 s to 1 min). */
const POLL_WINDOW_MS = 65_000

/** Moves the page's clock past every poll and probe interval, and lets what that starts finish. Needs `clock.install`. */
async function pastEveryPoll(page: Page): Promise<void> {
  await page.clock.fastForward(POLL_WINDOW_MS)
  await settled(page)
  await page.waitForTimeout(QUIET_MS)
}

test.describe('Decentralized only mode: every route', () => {
  for (const route of ROUTE_CASES) {
    for (const net of casesNets(route)) {
      const title = route.built
        ? `asks no hosted backend and shows ${SHOWS[route.decentralized]}`
        : 'asks no hosted backend and says what will be here'
      test(`${net} ${route.path} ${title} @X-05 @X-09 @PE-28 @HY-19`, async ({ page }) => {
        await page.clock.install()
        const requests = watchRequests(page)
        await page.goto(withQuery(route.path, networkQuery(net), 'sources=decentralized'))

        await expect(page.getByRole('heading', { level: 1, name: route.h1 })).toBeVisible()
        await expect(mark(page)).toBeVisible()
        await settled(page)
        await page.waitForTimeout(QUIET_MS)
        await settled(page)

        await expect(failures(page)).toHaveCount(0)
        await expect(hostedStamps(page)).toHaveCount(0)
        expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)

        if (route.built) {
          await expect(page.getByText('This page is on its way')).toHaveCount(0)
          if (route.data)
            await expect(page.locator(route.data).locator('visible=true').first()).toBeVisible()
          if (route.decentralized === 'data') await expect(unavailable(page)).toHaveCount(0)
          else await expect(unavailable(page).first()).toBeVisible()
          if (route.decentralized === 'unavailable') await expect(unavailable(page)).toHaveCount(1)
          if (route.decentralized !== 'data' || A11Y.has(route.path)) await expectAccessible(page)
          await pastEveryPoll(page)
        } else {
          await expect(page.getByText('This page is on its way')).toBeVisible()
        }
        expect(requests.hosted, 'requests to a hosted backend').toEqual([])
        expect(requests.elsewhere, 'requests to a host the mode does not list').toEqual([])
      })
    }
  }

  for (const net of ['mainnet', 'testnet'] as const) {
    test(`${net} a transaction still in the mempool asks no hosted backend and shows its data @X-05 @X-09 @PE-28 @HY-19`, async ({
      page,
    }) => {
      const { tx } = M1_RECORDS[net]
      await answerAsUnmined(page, tx, { instantLocked: false })
      await page.clock.install()
      const requests = watchRequests(page)
      await page.goto(withQuery(`/tx/${tx}`, networkQuery(net), 'sources=decentralized'))

      await expect(page.getByRole('heading', { level: 1, name: 'Transaction' })).toBeVisible()
      await expect(mark(page)).toBeVisible()
      await settled(page)
      await page.waitForTimeout(QUIET_MS)
      await settled(page)

      await expect(failures(page)).toHaveCount(0)
      await expect(hostedStamps(page)).toHaveCount(0)
      await expect(page.locator('#io').locator('visible=true').first()).toBeVisible()
      await expect(unavailable(page)).toHaveCount(0)
      expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)
      await pastEveryPoll(page)
      expect(requests.hosted, 'requests to a hosted backend').toEqual([])
      expect(requests.elsewhere, 'requests to a host the mode does not list').toEqual([])
    })
  }
})

test.describe('Decentralized only mode: the switch', () => {
  test('the same watch sees hosted backends while the mode is off @X-05', async ({ page }) => {
    const requests = watchRequests(page)
    const asked = (name: string) => () => requests.hosted.some((r) => r.startsWith(name))
    await page.goto('/mempool')
    await expect(page.getByRole('heading', { level: 1, name: 'Mempool' })).toBeVisible()
    await expect.poll(asked('Hyphen')).toBe(true)
    await expect(mark(page)).toHaveCount(0)
    await page.goto('/')
    await expect.poll(asked('Radar API')).toBe(true)
    await page.goto('/status')
    await expect.poll(asked('Insight')).toBe(true)
    await expect.poll(asked('Platform Explorer')).toBe(true)
    expect(requests.elsewhere).toEqual([])
  })

  test('the mark leaves the desktop bar its section links and a phone header its product name @X-05 @X-08', async ({
    page,
  }, testInfo) => {
    const desktop = testInfo.project.name.startsWith('desktop')
    for (const width of desktop ? [1100, 1280, 1440] : [320, 360, 390, 411, 412, 430]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/blocks?sources=decentralized')
      await expect(mark(page)).toHaveCount(1)
      await expect(mark(page)).toHaveAccessibleName('Decentralized only')
      await expect(mark(page)).toHaveAttribute('title', /DAPI nodes and the Platform SDK/)
      await expect(mark(page)).toHaveAttribute('data-place', width < 412 ? 'strip' : 'bar')
      await settled(page)
      const box = (await mark(page).boundingBox())!
      expect(box.width, `tap target at ${width} px`).toBeGreaterThanOrEqual(24)
      expect(box.height, `tap target at ${width} px`).toBeGreaterThanOrEqual(24)
      expect(box.x + box.width, `inside the screen at ${width} px`).toBeLessThanOrEqual(width)
      expect(
        await horizontalOverflow(page),
        `sideways overflow at ${width} px`,
      ).toBeLessThanOrEqual(0)
      const bar = await page.evaluate(() => {
        const root = document.querySelector('dashhq-bar')!.shadowRoot!
        const name = [...root.querySelectorAll<HTMLElement>('*')].find(
          (el) => el.children.length === 0 && el.textContent.trim() === 'Radar',
        )!
        return {
          collapsed: root.querySelector('.bar')!.classList.contains('compact'),
          nameCut: name.scrollWidth - name.clientWidth,
        }
      })
      expect(bar.nameCut, `the product name is whole at ${width} px`).toBeLessThanOrEqual(0)
      if (desktop) {
        expect(bar.collapsed, `the bar keeps its wide layout at ${width} px`).toBe(false)
        await expect(
          page.getByRole('navigation', { name: 'Radar' }).getByRole('link', { name: 'Tools' }),
        ).toBeVisible()
      } else if (width < 412) {
        await expect(mark(page)).toContainText('Decentralized only')
      }
    }
  })

  test('turns on in Settings without a reload, stops every hosted request and is remembered @X-05 @X-09', async ({
    page,
  }) => {
    await page.clock.install()
    await page.goto('/settings')
    await settled(page)
    const loads: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) loads.push(frame.url())
    })
    page.on('load', () => loads.push('load'))

    const group = page.getByRole('group', { name: 'Sources' })
    await group.getByRole('button', { name: 'Decentralized only' }).click()
    await expect(mark(page)).toBeVisible()
    const requests = watchRequests(page)

    await page
      .getByRole('navigation', { name: 'Radar' })
      .getByRole('link', { name: 'Core', exact: true })
      .first()
      .click()
    await expect(page).toHaveURL(/\/blocks/)
    await page.goto('/rich-list')
    await expect(unavailable(page)).toHaveCount(1)
    await expect(mark(page)).toBeVisible()
    await pastEveryPoll(page)
    expect(requests.hosted).toEqual([])
    expect(loads.filter((l) => l === 'load')).toHaveLength(1)
    expect(await page.evaluate(() => localStorage.getItem('radar.sources'))).toBe('decentralized')
  })

  test('turned on mid-session, in-app navigation back to hosted pages shows no hosted data and asks no hosted backend @X-05 @X-09 @HY-19', async ({
    page,
  }) => {
    await page.clock.install()
    const loads: string[] = []
    page.on('load', () => loads.push(page.url()))
    const core = (name: string) => page.getByRole('link', { name, exact: true }).first()
    const addresses = page.locator('main a[href^="/address/"]')

    // Visit hosted pages with the mode off, all in the app's own history.
    await page.goto('/blocks')
    await settled(page)
    await core('Rich list').click()
    await expect(addresses.first()).toBeVisible()
    await core('Mempool').click()
    await expect(page.locator('[data-mempool-view="index"]')).toBeVisible()
    await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

    const requests = watchRequests(page)
    await page
      .getByRole('group', { name: 'Sources' })
      .getByRole('button', { name: 'Decentralized only' })
      .click()
    await expect(mark(page)).toBeVisible()
    await settled(page)

    // Back to the pages whose hosted answers were in memory: none of it may show.
    await page.goBack()
    await expect(page.locator('[data-mempool-view="seen"]')).toBeVisible()
    await expect(page.locator('[data-mempool-view="index"]')).toHaveCount(0)
    await expect(hostedStamps(page)).toHaveCount(0)
    await page.goBack()
    await expect(unavailable(page)).toHaveCount(1)
    await expect(addresses).toHaveCount(0)
    await expect(hostedStamps(page)).toHaveCount(0)
    await core('Charts').click()
    await expect(unavailable(page)).toHaveCount(1)
    await expect(hostedStamps(page)).toHaveCount(0)
    await expect(failures(page)).toHaveCount(0)

    await pastEveryPoll(page)
    expect(requests.hosted, 'requests to a hosted backend after the switch').toEqual([])
    expect(requests.elsewhere).toEqual([])
    expect(loads, 'the page was never reloaded').toHaveLength(1)
  })

  test('a link turns it on for the visit, in-app navigation keeps it, and nothing is remembered @X-05 @X-09', async ({
    page,
  }) => {
    const requests = watchRequests(page)
    await page.goto('/rich-list?sources=decentralized')
    await expect(unavailable(page)).toHaveCount(1)
    await page.goto('/blocks?sources=decentralized')
    const chip = page.locator('main a.rx-chip[href^="/block/"]').first()
    await expect(chip).toHaveAttribute('href', /[?&]sources=decentralized$/)
    await mark(page).click()
    await expect(page).toHaveURL(/\/sources\?sources=decentralized$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Data sources' })).toBeVisible()
    await settled(page)
    for (const backend of ['hyphen', 'insight', 'pe', 'rate', 'radar']) {
      await expect(page.locator(`[data-backend="${backend}"]`)).toHaveAttribute('data-state', 'off')
    }
    for (const backend of ['dapi', 'sdk', 'quorums', 'site']) {
      await expect(page.locator(`[data-backend="${backend}"]`)).toHaveAttribute(
        'data-state',
        'in-use',
      )
    }
    expect(requests.hosted).toEqual([])
    expect(await page.evaluate(() => localStorage.getItem('radar.sources'))).toBeNull()
  })

  test('Tools → Sources breaks a long host anywhere but keeps the words of a sentence whole @X-05', async ({
    page,
  }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/sources')
      const host = page.locator('[data-backend="dapi"] [data-backend-host]')
      await expect(host).toBeVisible()
      await settled(page)
      const lines = await host.evaluate((el) => {
        const text = el.firstChild as Text
        const word = 'https://address:port'
        const at = text.data.indexOf(word)
        const range = document.createRange()
        range.setStart(text, at)
        range.setEnd(text, at + word.length)
        return at < 0 ? -1 : range.getClientRects().length
      })
      expect(lines, `the address pattern at ${width} px`).toBe(1)
      expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)
    }
  })

  test('“Use all sources” on an unavailable state switches it off and the page reads its index again @X-05 @HY-19', async ({
    page,
  }) => {
    const requests = watchRequests(page)
    await page.goto('/rich-list?sources=decentralized')
    await expect(unavailable(page)).toHaveCount(1)
    expect(requests.hosted).toEqual([])
    await unavailable(page).getByRole('button', { name: 'Use all sources' }).click()
    await expect(page).toHaveURL(/\/rich-list$/)
    await expect(mark(page)).toHaveCount(0)
    await expect(unavailable(page)).toHaveCount(0)
    await settled(page)
    await expect(page.locator('a[href^="/address/"]').first()).toBeVisible()
    await expect(page.locator('main a[href*="sources=decentralized"]')).toHaveCount(0)
    // The header's network menu builds its links when it opens: they must not bring the mode back.
    await page.getByRole('button', { name: /Network: Mainnet/ }).click()
    await page
      .getByRole('navigation', { name: 'Network' })
      .getByRole('link', { name: 'Testnet' })
      .click()
    await expect(page).toHaveURL(/\/rich-list\?network=testnet$/)
    await expect(mark(page)).toHaveCount(0)
    expect(requests.hosted.some((r) => r.startsWith('Hyphen'))).toBe(true)
  })

  test('turning it on drops what a hosted backend answered before @X-05 @X-09', async ({
    page,
  }) => {
    await page.goto('/rich-list')
    await settled(page)
    await expect(page.locator('a[href^="/address/"]').first()).toBeVisible()
    await page.evaluate(() => localStorage.setItem('radar.sources', 'decentralized'))
    await page.goto('/settings')
    const group = page.getByRole('group', { name: 'Sources' })
    await expect(group.getByRole('button', { name: 'Decentralized only' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const requests = watchRequests(page)
    await page.goBack()
    await expect(unavailable(page)).toHaveCount(1)
    await expect(page.locator('main a[href^="/address/"]')).toHaveCount(0)
    await pastEveryPoll(page)
    expect(requests.hosted).toEqual([])
  })
})
