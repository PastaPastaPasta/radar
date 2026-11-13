import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { answerAsUnmined } from '../helpers/fixtures'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const MAINNET = {
  query: '',
  blockHash: '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6',
  height: '2569992',
  date: '2026-11-03',
  tx: '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90',
  address: 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14',
  proposal: '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c',
  protx: '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32',
}
const TESTNET = {
  query: 'network=testnet',
  blockHash: '00000bafbc94add76cb75e2ec92894837288a481e5c005f6563d91623bf8bc2c',
  height: '1589232',
  date: '2026-11-03',
  tx: '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6',
  address: 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa',
  proposal: '01934d6d5c25ade531176a0283148b3d6aeaef2c0b6d599552e43c2199d2f8cd',
  protx: '51238bb9e2b68fc822e8eb15d415e97ebc86f769a72c15e0a6e25d9ea8d38475',
}

/** A block's transactions: a table of links on desktop, a list of rows that open on a phone. */
const BLOCK_TXS = 'a[href^="/tx/"], [aria-label^="Transactions in block"] button'

/** What the page must show in the mode: its own data, the mode's unavailable state, or both. */
type Shows = 'data' | 'unavailable' | 'both'

interface Walk {
  path: string
  heading: string
  shows: Shows
  /** Something the page reads over DAPI or the SDK and must still show. */
  data?: string
  pending?: boolean
}

const pages = (n: typeof MAINNET): Walk[] => [
  { path: '/', heading: 'Radar', shows: 'both', data: '[data-headline]' },
  { path: '/search', heading: 'Search', shows: 'data' },
  { path: `/search?q=${n.height}`, heading: 'Search', shows: 'both', data: `a[href^="/block/"]` },
  {
    path: `/search?q=${n.address}`,
    heading: 'Search',
    shows: 'both',
    data: `a[href^="/address/"]`,
  },
  { path: '/blocks', heading: 'Blocks', shows: 'data', data: 'a[href^="/block/"]' },
  {
    path: `/blocks?date=${n.date}`,
    heading: 'Blocks',
    shows: 'data',
    data: 'a[href^="/block/"]',
  },
  { path: `/block/${n.blockHash}`, heading: 'Block', shows: 'data', data: BLOCK_TXS },
  { path: `/block/${n.height}`, heading: 'Block', shows: 'data', data: BLOCK_TXS },
  { path: `/tx/${n.tx}`, heading: 'Transaction', shows: 'both', data: '#io' },
  { path: `/tx/${n.tx}`, heading: 'Transaction', shows: 'data', data: '#io', pending: true },
  { path: `/address/${n.address}`, heading: 'Address', shows: 'both', data: '[data-live]' },
  { path: '/mempool', heading: 'Mempool', shows: 'both', data: '[data-mempool-view="seen"]' },
  { path: '/rich-list', heading: 'Rich list', shows: 'unavailable' },
  { path: '/charts', heading: 'Charts', shows: 'unavailable' },
  { path: '/internals', heading: 'Network internals', shows: 'unavailable' },
  { path: '/governance', heading: 'Governance', shows: 'unavailable' },
  { path: `/governance/${n.proposal}`, heading: 'Proposal', shows: 'unavailable' },
  { path: `/mn/${n.protx}`, heading: 'Masternode', shows: 'unavailable' },
  { path: '/status', heading: 'Status', shows: 'data', data: '[data-state="off"]' },
  // The price feed is offered on mainnet only, so only there does the unit card have something to say.
  {
    path: '/settings',
    heading: 'Settings',
    shows: n === MAINNET ? 'both' : 'data',
    data: '#sources',
  },
  { path: '/sources', heading: 'Data sources', shows: 'data', data: '[data-backend="dapi"]' },
  { path: '/tools/verify-message', heading: 'Verify message', shows: 'data' },
  { path: '/tools/qr', heading: 'QR reader', shows: 'data' },
]

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

const withQuery = (path: string, ...params: string[]) => {
  const extra = params.filter(Boolean).join('&')
  return extra ? `${path}${path.includes('?') ? '&' : '?'}${extra}` : path
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

/** Long enough for a poll, a probe or a late prefetch to have fired after the page settled. */
const QUIET_MS = 1_500

test.describe('Decentralized only mode: every built page', () => {
  for (const [network, ids] of [
    ['mainnet', MAINNET],
    ['testnet', TESTNET],
  ] as const) {
    for (const walk of pages(ids)) {
      const name = `${walk.path}${walk.pending ? ' (pending)' : ''}`
      test(`${network} ${name} asks no hosted backend and shows ${walk.shows === 'both' ? 'data and the unavailable state' : walk.shows === 'data' ? 'its data' : 'the unavailable state'} @X-05 @X-09 @PE-28 @HY-19`, async ({
        page,
      }) => {
        if (walk.pending) await answerAsUnmined(page, ids.tx, { instantLocked: false })
        const requests = watchRequests(page)
        await page.goto(withQuery(walk.path, ids.query, 'sources=decentralized'))

        await expect(page.getByRole('heading', { level: 1, name: walk.heading })).toBeVisible()
        await expect(mark(page)).toBeVisible()
        await settled(page)
        await page.waitForTimeout(QUIET_MS)
        await settled(page)

        await expect(failures(page)).toHaveCount(0)
        await expect(page.getByText('This page is on its way')).toHaveCount(0)
        await expect(hostedStamps(page)).toHaveCount(0)
        if (walk.data)
          await expect(page.locator(walk.data).locator('visible=true').first()).toBeVisible()
        if (walk.shows === 'data') await expect(unavailable(page)).toHaveCount(0)
        else await expect(unavailable(page).first()).toBeVisible()
        if (walk.shows === 'unavailable') await expect(unavailable(page)).toHaveCount(1)

        expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)
        if (walk.shows !== 'data' || A11Y.has(walk.path)) await expectAccessible(page)
        expect(requests.hosted, 'requests to a hosted backend').toEqual([])
        expect(requests.elsewhere, 'requests to a host the mode does not list').toEqual([])
      })
    }
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
    await settled(page)
    await page.waitForTimeout(QUIET_MS)
    expect(requests.hosted).toEqual([])
    expect(loads.filter((l) => l === 'load')).toHaveLength(1)
    expect(await page.evaluate(() => localStorage.getItem('radar.sources'))).toBe('decentralized')
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
    await page.waitForTimeout(QUIET_MS)
    expect(requests.hosted).toEqual([])
  })
})
