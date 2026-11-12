import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { tabBarHeight } from '../helpers/contrast'
import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const EMPTY_ADDRESS = 'XbKzysY6LYGbsGwNG8B7K1BRoA1ffLodAT'
const TESTNET_ADDRESS = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'
const PROPOSAL = '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c'
const TESTNET_PROPOSAL = '01934d6d5c25ade531176a0283148b3d6aeaef2c0b6d599552e43c2199d2f8cd'

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1)
}

const BUSY = 'XtNfacxAyGM1qfmTifGgLL1Q7JxX7pGXck'
const MINED = '078f9796125159f699ccf18a3f2f627fb83ef35be4316030299ca7a93256ab93'

/**
 * Answers the Hyphen reads of an address the fixtures hold no recording for. `recent` rows appear in the newest
 * transactions from the second read of them on, as if they had just been mined.
 */
function stubAddress({
  address,
  utxos,
  recent,
}: {
  address: string
  utxos: object[]
  recent: { txHash: string; netValue: number }[]
}) {
  const real = window.fetch.bind(window)
  const json = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
    )
  const row = (txHash: string, netValue: number) => ({
    txHash,
    blockHeight: 2570086,
    blockTime: '2026-11-11T12:00:00Z',
    txType: 'normal',
    valueOut: netValue,
    netValue,
    direction: 'in',
  })
  const old = row('cd'.repeat(32), 1000)
  let reads = 0
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = new URL(url, location.href).pathname
    const base = `/x/hy/mainnet/address/${address}`
    if (path === base) {
      return json({
        asOfHeight: 2570085,
        address,
        balance: 1000,
        totalReceived: 5000,
        totalSent: 4000,
        txCount: 3,
        firstSeen: '2016-03-16T07:00:03Z',
        lastSeen: '2026-11-11T12:00:00Z',
      })
    }
    if (path === `${base}/utxos`) {
      return json({ asOfHeight: 2570085, totalCount: utxos.length, value: utxos })
    }
    if (path === `${base}/txs`) {
      const fresh = url.includes('limit=10') && reads++ > 0
      const rows = [...(fresh ? recent.map((r) => row(r.txHash, r.netValue)) : []), old]
      return json({ asOfHeight: 2570085, totalCount: rows.length, value: rows })
    }
    return real(input, init)
  }
}

const sourced = (page: Page) =>
  expect(page.locator('main [data-source="hyphen"]').first()).toBeVisible()

test.describe('address page', () => {
  test('summary, history, QR code and the live notice @IN-06 @HY-08', async ({ page }) => {
    await page.goto(`/address/${ADDRESS}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Address' })).toBeVisible()
    await expect(page.getByText(ADDRESS).first()).toBeVisible()

    const summary = page.locator('[data-address-summary]')
    await expect(summary).toContainText('Balance')
    await expect(summary).toContainText('Total received')
    await expect(summary).toContainText('Total sent')
    await expect(summary).toContainText(/DASH/)

    await expect(page.getByRole('table', { name: /Transactions/ })).toBeVisible()
    const showQr = page.getByRole('button', { name: 'Show QR code' })
    if ((page.viewportSize()?.width ?? 1000) <= 640) await showQr.click()
    else await expect(showQr).toHaveCount(0)
    await expect(page.getByRole('img', { name: /QR code of the address/ })).toBeVisible()
    await expect(page.locator('[data-live]')).toBeVisible()
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('tells the viewer when a new transaction arrives for the address, from DAPI @IN-06', async ({
    page,
  }) => {
    // The recorded transaction stream replays the tip block, where BUSY receives 078f9796…, then the mempool, where
    // f96fddff… pays BUSY 631,511 duffs and spends that output.
    await page.addInitScript(stubAddress, {
      address: BUSY,
      utxos: [{ txHash: MINED, vout: 0, value: 1000, height: 2570085, scriptPubKey: '76' }],
      recent: [],
    })
    await page.goto(`/address/${BUSY}`)
    const notice = page.locator('[data-new-transaction]')
    await expect(notice).toBeVisible({ timeout: 20_000 })
    await expect(notice).toContainText('Unconfirmed transaction')
    await expect(notice.locator('a[href*="f96fddff"]')).toBeVisible()
    await expect(page.locator('[data-arrived]')).toContainText(
      '1 transaction seen since you opened',
    )
    await expect(page.locator('[data-pending]')).toContainText('Unconfirmed')
    await expect(page.locator('[data-pending] a[href*="078f9796"]')).toHaveCount(0)
    await expectAccessible(page)
  })

  test('falls back to the address history when the DAPI feed is down @IN-06', async ({ page }) => {
    test.slow()
    const id = 'ab'.repeat(32)
    await page.addInitScript(stubAddress, {
      address: BUSY,
      utxos: [],
      recent: [{ txHash: id, netValue: 250000000 }],
    })
    await page.goto(`/address/${BUSY}`)
    const notice = page.locator('[data-new-transaction]')
    await expect(notice.locator('a[href*="f96fddff"]')).toBeVisible({ timeout: 20_000 })
    await page.evaluate(() =>
      (
        window as unknown as { __radarFixtures: { breakLiveConnection(): void } }
      ).__radarFixtures.breakLiveConnection(),
    )
    await expect(notice.locator(`a[href*="${id}"]`)).toBeVisible({ timeout: 60_000 })
    await expect(notice).toContainText('New transaction')
    await expect(page.locator('[data-arrived]')).toContainText(
      '2 transactions seen since you opened',
    )
    await expect(page.locator('[data-pending] a[href*="f96fddff"]')).toHaveCount(1)
    await expect(page.locator('[data-pending] a[href*="ababab"]')).toHaveCount(0)
  })

  test('pages the history by cursor and keeps what is already shown @IN-06', async ({ page }) => {
    await page.goto(`/address/${ADDRESS}`)
    const table = page.getByRole('table', { name: /Transactions/ })
    await expect(table).toBeVisible()
    const before = await table.getByRole('row').count()
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect.poll(async () => table.getByRole('row').count()).toBeGreaterThan(before)
  })

  test('an address with no activity is empty, not an error @IN-06', async ({ page }) => {
    await page.goto(`/address/${EMPTY_ADDRESS}`)
    await expect(
      page.getByText('No transactions seen for this address on this network.'),
    ).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('says what is wrong with something that is not an address @IN-06', async ({ page }) => {
    await page.goto('/address/not-an-address')
    await expect(page.getByText('That isn’t a Dash address.')).toBeVisible()
  })

  test('works on testnet and offers testnet for a testnet address on mainnet @IN-16 @HY-19', async ({
    page,
  }) => {
    await page.goto(`/address/${TESTNET_ADDRESS}?network=testnet`)
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
    await expect(page.locator('[data-address-summary]')).toContainText(/tDASH/)
    await expect(page.locator('main [data-source="insight"]').first()).toBeVisible()

    await page.goto(`/address/${TESTNET_ADDRESS}`)
    await expect(page.getByText('This is a testnet address.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open it on testnet' })).toHaveAttribute(
      'href',
      /network=testnet/,
    )
  })

  test('reads a testnet address from Insight while Hyphen trails, with the Insight label @IN-16 @HY-19 @IN-06', async ({
    page,
  }) => {
    await page.goto(`/address/${TESTNET_ADDRESS}?network=testnet`)
    const summary = page.locator('[data-address-summary]')
    await expect(summary).toContainText(/tDASH/)
    await expect(summary).toContainText('Balance')
    await expect(page.locator('main [data-source="insight"]').first()).toBeVisible()
    await expect(page.locator('main [data-source="hyphen"]')).toHaveCount(0)
    await expect(page.getByText('Indexed by Insight').first()).toBeVisible()
    await expectNoSideScroll(page)
  })

  test('shows the Hyphen label for a mainnet address, whose index is current @IN-06', async ({
    page,
  }) => {
    await page.goto(`/address/${ADDRESS}`)
    await expect(page.locator('[data-address-summary]')).toContainText('Balance')
    await expect(page.locator('main [data-source="hyphen"]').first()).toBeVisible()
    await expect(page.locator('main [data-source="insight"]')).toHaveCount(0)
  })

  test('shows one notice on a stale analytics page and no per-section warning @IN-03 @HY-19', async ({
    page,
  }) => {
    for (const path of ['/rich-list', '/charts', '/mempool']) {
      await page.goto(`${path}?network=testnet`)
      await expect(page.locator('[data-stale-index]')).toHaveCount(1, { timeout: 15_000 })
      await expect(page.locator('[data-stale-index]')).toContainText(
        'Blocks, transactions and addresses elsewhere in Radar are current.',
      )
      await expect(
        page.locator('[data-stale-index]').getByRole('link', { name: 'See the sources' }),
      ).toHaveAttribute('href', /\/status/)
      await expect(page.locator('.rx-card__lag')).toHaveCount(0)
    }
  })

  test('shows balances in the unit that was chosen @IN-12', async ({ page }) => {
    await page.goto('/settings')
    await page
      .getByRole('group', { name: 'Unit for amounts' })
      .getByRole('button', { name: 'duffs', exact: true })
      .click()
    await page.goto(`/address/${ADDRESS}`)
    await expect(page.locator('[data-address-summary]')).toContainText(/duffs/)
  })

  test('copies the address and says so @IN-14', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/address/${ADDRESS}`)
    await page.getByRole('button', { name: /^Copy/ }).first().click()
    await expect(page.getByText(/Copied/).first()).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ADDRESS)
  })
})

test.describe('mempool', () => {
  test('summary and a pageable list of pending transactions @HY-06', async ({ page }) => {
    await page.goto('/mempool')
    await expect(page.getByRole('heading', { level: 1, name: 'Mempool' })).toBeVisible()
    await expect(page.getByRole('table', { name: /Pending transactions/ })).toBeVisible()
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('does not look live while the testnet index trails the chain @HY-19', async ({ page }) => {
    await page.goto('/mempool?network=testnet')
    const line = page.getByText(/not a live view/)
    await expect(line).toBeVisible({ timeout: 15_000 })
    await expect(line).toContainText('Checked every 15 seconds')
    await expect(page.locator('[data-stale-index]')).toContainText('not live')
    await expect(page.getByText('Refreshes every 15 seconds.')).toHaveCount(0)
    await expect(page.locator('main [data-live-dot="live"]')).toHaveCount(0)
  })

  test('says it refreshes when the mainnet index is current @HY-19', async ({ page }) => {
    await page.goto('/mempool')
    await expect(page.getByText('Refreshes every 15 seconds.')).toBeVisible()
    await expect(page.locator('[data-stale-index]')).toHaveCount(0)
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/mempool?network=testnet')
    await expect(page.getByRole('heading', { level: 1, name: 'Mempool' })).toBeVisible()
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
  })
})

/** The ranked addresses: a table on wider screens, a compact list on a phone. */
const rankedList = (page: Page) =>
  page
    .getByRole('table', { name: /Addresses ranked by balance/ })
    .or(page.getByRole('list', { name: 'Addresses ranked by balance' }))

test.describe('rich list', () => {
  test('ranks balances and charts how concentrated they are @HY-09', async ({ page }) => {
    await page.goto('/rich-list')
    await expect(page.getByRole('heading', { level: 1, name: 'Rich list' })).toBeVisible()
    const ranked = rankedList(page)
    await expect(ranked).toBeVisible()
    await expect(page.getByText('Supply concentration')).toBeVisible()
    const items = ranked.getByRole('row').or(ranked.getByRole('listitem'))
    const before = await items.count()
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect.poll(async () => items.count()).toBeGreaterThan(before)
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('says which total the shares are of, next to the shares and the chart @HY-09', async ({
    page,
  }) => {
    await page.goto('/rich-list')
    await expect(rankedList(page)).toBeVisible()
    const notes = page.locator('[data-share-basis]')
    const phone = (page.viewportSize()?.width ?? 1000) <= 640
    await expect(notes).toHaveCount(phone ? 1 : 2)
    if (phone) await notes.first().locator('summary').click()
    for (const note of await notes.all()) {
      await expect(note).toBeVisible()
      await expect(note).toContainText('Shares are of the 12.89 M DASH held in positive address')
      await expect(note).toContainText('not of the circulating supply')
    }
  })

  test('lists compact rows on a phone, with the rest on tap and the summary in reach @HY-09', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 1000) > 640, 'phone layout only')
    await page.goto('/rich-list')
    const list = page.getByRole('list', { name: 'Addresses ranked by balance' })
    await expect(list.getByRole('listitem')).toHaveCount(25)
    await expect(page.getByRole('table', { name: /Addresses ranked by balance/ })).toHaveCount(0)
    const first = list.getByRole('listitem').first()
    const row = await first.boundingBox()
    expect(row!.height, 'a collapsed row stays one compact line or two').toBeLessThan(72)
    await expect(page.getByText('Tap a row for received, sent and transactions')).toBeVisible()
    const toggle = first.getByRole('button', { expanded: false })
    await expect(toggle.locator('.rx-rich-chevron')).toBeVisible()
    await expect(first.getByText('Received')).toBeHidden()
    await toggle.click()
    await expect(first.getByRole('button', { expanded: true })).toBeVisible()
    for (const label of ['Received', 'Sent', 'Transactions']) {
      await expect(first.getByText(label, { exact: true })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect(list.getByRole('listitem')).toHaveCount(50)
    const before = await page.evaluate(() => window.scrollY)
    await page.getByRole('link', { name: 'Back to summary' }).click()
    await expect(page.getByText('Supply concentration')).toBeInViewport()
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before)
    await expectNoSideScroll(page)
  })

  test('keeps an opened row inside the screen at 320 px @HY-09', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/rich-list')
    const first = page
      .getByRole('list', { name: 'Addresses ranked by balance' })
      .getByRole('listitem')
      .first()
    await first.getByRole('button', { expanded: false }).click()
    for (const label of ['Received', 'Sent', 'Transactions']) {
      const box = await first.getByText(label, { exact: true }).boundingBox()
      expect(box, label).not.toBeNull()
      expect(box!.x + box!.width, `${label} stays inside the screen`).toBeLessThanOrEqual(320)
    }
    await expectNoSideScroll(page)
  })

  test('keeps received, sent and transactions on every row, desktop @HY-09', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= 640, 'tables are for wider screens')
    await page.goto('/rich-list')
    const first = page
      .getByRole('table', { name: /Addresses ranked by balance/ })
      .locator('tbody tr')
      .first()
    for (const label of ['Received', 'Sent', 'Transactions']) {
      await expect(first.locator(`td[data-l="${label}"]`)).toBeVisible()
    }
    await page.getByRole('button', { name: 'Show more' }).click()
    const rows = page
      .getByRole('table', { name: /Addresses ranked by balance/ })
      .locator('tbody tr')
    await expect(rows).toHaveCount(50)
    await expect(rows.nth(40).locator('td[data-l="Sent"]')).toBeVisible()
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/rich-list?network=testnet')
    await expect(rankedList(page)).toBeVisible()
  })
})

test.describe('charts', () => {
  test('hash rate and transactions with a range, each with a table beside it @HY-02', async ({
    page,
  }) => {
    await page.goto('/charts')
    await expect(page.getByRole('heading', { level: 1, name: 'Charts' })).toBeVisible()
    await expect(page.getByRole('table', { name: /Hash rate by block height/ })).toBeAttached()
    await expect(
      page.getByRole('table', { name: /Transactions processed by block height/ }),
    ).toBeAttached()

    const range = page.getByRole('group', { name: 'Range' })
    await range.getByRole('button', { name: '1 w' }).click()
    await expect(range.getByRole('button', { name: '1 w' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/range=1w/)
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('starts the first chart in the first phone screen, with the figures in two columns @HY-02', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/charts')
    await expect(page.getByRole('heading', { level: 1, name: 'Charts' })).toBeVisible()
    await settled(page)
    const stats = page.locator('[data-charts-now] .rx-stat')
    await expect(stats).toHaveCount(6)
    const first = await stats.nth(0).boundingBox()
    const second = await stats.nth(1).boundingBox()
    expect(second!.y, 'the first two figures share a row').toBeCloseTo(first!.y, 0)
    expect(second!.x).toBeGreaterThan(first!.x + first!.width / 2)
    const barTop = 844 - (await tabBarHeight(page))
    const chart = await page.locator('[data-chart-hue]').first().boundingBox()
    expect(chart!.y, 'the first chart starts above the tab bar').toBeLessThanOrEqual(barTop - 24)
    await expectNoSideScroll(page)
  })

  test('draws each metric in its own colour, legible on the card @HY-02', async ({ page }) => {
    await page.goto('/charts')
    const hues = page.locator('[data-chart-hue]')
    await expect(hues).toHaveCount(6)
    const colours = await hues.evaluateAll((els) => {
      const parse = (c: string): [number, number, number] => {
        const m = c.match(/[\d.]+/g)!.map(Number)
        return [m[0]!, m[1]!, m[2]!]
      }
      const lum = ([r, g, b]: [number, number, number]) => {
        const f = (v: number) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      return els.map((el) => {
        const probe = document.createElement('i')
        probe.style.color = getComputedStyle(el).getPropertyValue('--rx-l')
        el.appendChild(probe)
        const line = parse(getComputedStyle(probe).color)
        probe.remove()
        const card = el.closest('.rx-card') ?? el
        const ground = parse(getComputedStyle(card).backgroundColor)
        const [hi, lo] = [lum(line), lum(ground)].sort((a, b) => b - a) as [number, number]
        return { line: line.join(','), rgb: line, contrast: (hi + 0.05) / (lo + 0.05) }
      })
    })
    expect(new Set(colours.map((c) => c.line)).size).toBe(6)
    for (const c of colours) expect(c.contrast, c.line).toBeGreaterThanOrEqual(3)
    const lab = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }) as [number, number, number]
      const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
      const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047)
      const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722)
      const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883)
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)] as const
    }
    for (const [i, a] of colours.entries()) {
      for (const b of colours.slice(i + 1)) {
        const [p, q] = [lab(a.rgb), lab(b.rgb)]
        const apart = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
        expect(apart, `${a.line} and ${b.line} look alike`).toBeGreaterThanOrEqual(18)
      }
    }
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/charts?network=testnet')
    await expect(page.getByRole('table', { name: /Hash rate by block height/ })).toBeAttached()
  })

  test('network internals: chain state, mempool pressure, versions and peers @HY-12', async ({
    page,
  }) => {
    await page.goto('/charts')
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Network internals' })
      .click()
    await expect(page).toHaveURL(/tab=internals/)
    await expect(page.locator('[data-internals-chain]')).toContainText('Chain size')
    if ((page.viewportSize()?.width ?? 1000) <= 640) {
      await settled(page)
      const height = page.viewportSize()!.height
      const barTop = height - (await tabBarHeight(page))
      const chain = await page.locator('[data-internals-chain]').boundingBox()
      expect(chain!.height, 'the chain figures stay compact on a phone').toBeLessThan(260)
      const mempool = await page.locator('#mempool-pressure').boundingBox()
      expect(mempool!.y, 'the next card starts in the first screen').toBeLessThan(barTop - 60)
    }
    await expect(page.getByText('Mempool pressure')).toBeVisible()
    await expect(page.getByText('Transaction velocity')).toBeVisible()
    await expect(page.locator('[data-internals-versions]')).toBeVisible()
    await expect(
      page.getByRole('table', { name: /Peers of the node Hyphen indexes from/ }),
    ).toBeVisible()
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })
})

test.describe('governance', () => {
  test('lists proposals, expands one, and links out to vote @HY-13', async ({ page }) => {
    await page.goto('/governance')
    await expect(page.getByRole('heading', { level: 1, name: 'Governance' })).toBeVisible()
    const row = page.getByRole('button', { name: 'DashDaoGrowthEngine' })
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    const vote = page
      .locator('[data-proposal-details]')
      .getByRole('link', { name: /Vote in Governance/ })
    await expect(vote).toHaveAttribute('href', `https://gov.dashhq.org/p/h/${PROPOSAL}`)
    await expect(vote).toHaveAttribute('rel', 'noopener noreferrer')
    await sourced(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('the proposal page has the votes and the vote history @HY-13', async ({ page }) => {
    await page.goto(`/governance/${PROPOSAL}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Proposal' })).toBeVisible()
    await expect(page.locator('[data-votes]')).toBeVisible()
    await expect(
      page.getByRole('table', { name: /Masternode votes on this proposal/ }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      `https://gov.dashhq.org/p/h/${PROPOSAL}`,
    )
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('reads testnet proposals from Insight while Hyphen trails @IN-16 @HY-19 @IN-03', async ({
    page,
  }) => {
    await page.goto('/governance?network=testnet')
    await expect(page.getByRole('button', { name: 'test', exact: true })).toBeVisible()
    await expect(page.locator('main [data-source="insight"]').first()).toBeVisible()
    await expect(page.locator('[data-stale-index]')).toHaveCount(0)
  })

  test('testnet proposals link to the testnet Governance @IN-16 @HY-19', async ({ page }) => {
    await page.goto(`/governance/${TESTNET_PROPOSAL}?network=testnet`)
    await expect(page.getByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      /network=testnet/,
    )
  })

  test('says when no proposal has the hash @HY-13', async ({ page }) => {
    await page.goto(`/governance/${'0'.repeat(64)}`)
    await expect(page.getByText('No proposal with this hash on this network.')).toBeVisible()
  })
})

test.describe('phone layout', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 600, 'phone layout only')

  for (const path of [
    `/address/${ADDRESS}`,
    '/mempool',
    '/rich-list',
    '/charts',
    '/charts?tab=internals',
    '/governance',
    `/governance/${PROPOSAL}`,
  ]) {
    test(`${path} fits the screen and its tables scroll inside themselves @HY-18`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await expectNoSideScroll(page)
    })
  }
})

test.describe('search suggestions from Hyphen', () => {
  test('an address in the search box gets a hit that says its balance and transactions @HY-14', async ({
    page,
  }) => {
    await page.goto(`/search?q=${ADDRESS}`)
    const hit = page.getByRole('link', { name: new RegExp(`${ADDRESS}.*189 transactions`) })
    await expect(hit).toBeVisible()
  })

  test('a name is looked up in Hyphen too @HY-14', async ({ page }) => {
    await page.goto('/search?q=DashDaoGrowthEngine')
    await expect(page.getByRole('link', { name: /DashDaoGrowthEngine/ }).first()).toBeVisible()
  })
})
