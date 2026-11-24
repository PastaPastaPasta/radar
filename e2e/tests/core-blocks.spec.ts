import { expectAccessible } from '../helpers/a11y'
import type { Page } from '@playwright/test'
import { expect as baseExpect, test } from '../helpers/test'
import { CLAIM } from '../routes/claims'

const expect = baseExpect.configure({ timeout: 15_000 })

const TIP = 2570085
const PREVIOUS_HASH = '0000000000000027cf3cde6fa7d6361587cd5ac4f211ceb6b7bfaf1ba4e01ce4'
const TESTNET_TIP = 1589232

/** Rows below the recorded window (the newest 20 blocks) come from here, so a test can scroll as far as it likes. */
async function synthesizeOlderRows(page: Page, newest = TIP) {
  await page.addInitScript((tip: number) => {
    const w = window as unknown as {
      __radarCore?: Record<string, (...args: unknown[]) => Promise<unknown>>
    }
    let core: typeof w.__radarCore
    Object.defineProperty(w, '__radarCore', {
      configurable: true,
      get: () => core,
      set(value: typeof core) {
        core = value
        const original = value?.blockRows
        if (!value || !original) return
        value.blockRows = (...args) => {
          const q = args[1] as { fromHeight: number; count: number; via?: string }
          const asked = window as unknown as { __rowReads?: number[] }
          ;(asked.__rowReads ??= []).push(q.fromHeight)
          if (q.via || q.fromHeight - q.count + 1 >= tip - 19) return original.apply(value, args)
          const now = Date.now()
          return Promise.resolve({
            source: 'dapi',
            asOf: now,
            fetchedAt: now,
            proved: false,
            data: Array.from({ length: q.count }, (_, i) => ({
              height: q.fromHeight - i,
              hash: (q.fromHeight - i).toString(16).padStart(64, '0'),
              time: now - (tip - q.fromHeight + i) * 150_000,
              txCount: 1,
              size: 300,
              chainLocked: true,
            })),
          })
        }
      },
    })
  }, newest)
}

test.describe('Blocks list', () => {
  test('lists the newest blocks, then loads older ones as the reader scrolls @HY-04', async ({
    page,
  }) => {
    await synthesizeOlderRows(page)
    await page.goto('/blocks')
    await expect(page.getByRole('heading', { level: 1, name: CLAIM.blocks })).toBeVisible()
    const [headline, kicker] = await Promise.all(
      ['.rx-rec__title', '.rx-rec__kicker'].map((s) => page.locator(s).boundingBox()),
    )
    expect(Math.abs(headline!.x - kicker!.x), 'the headline starts under its kicker').toBeLessThan(
      2,
    )
    await expect(page.locator(`a[href="/block/${TIP}"]`).first()).toBeVisible()
    await expectAccessible(page)
    const rows = page.locator('#blocks tbody tr[data-row-id]')
    await expect(rows).toHaveCount(20)
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0)
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await expect(rows).toHaveCount(40)
    await expect(page.locator('a[href="/block/2570046"]').first()).toBeAttached()
    await expect(page.locator('[data-sentinel="end"] [role="status"]')).toContainText(
      /Older blocks load as you scroll/,
    )
    await expectAccessible(page)
  })

  test('keeps the reader’s place in the URL, so a reload opens at the same block @HY-04', async ({
    page,
  }) => {
    await synthesizeOlderRows(page)
    await page.goto('/blocks')
    const rows = page.locator('#blocks tbody tr[data-row-id]')
    await expect(rows).toHaveCount(20)
    for (const expected of [40, 60]) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })
      await expect(rows).toHaveCount(expected)
    }
    await page.evaluate(() => {
      const row = document.querySelector('[data-row-id="2570040"]')!
      window.scrollBy(0, row.getBoundingClientRect().top - 100)
    })
    await expect(page).toHaveURL(/from=25700[34]\d/)
    const from = Number(new URL(page.url()).searchParams.get('from'))
    await page.reload()
    const row = page.locator(`[data-row-id="${from}"]`)
    await expect(row).toBeVisible()
    const top = await row.evaluate((el) => el.getBoundingClientRect().top)
    expect(top, 'the block the URL names is back near the top of the view').toBeLessThan(200)
    await page.getByRole('button', { name: /newest/ }).click()
    await expect(page.locator(`a[href="/block/${TIP}"]`).first()).toBeVisible()
    await expect(page).not.toHaveURL(/from=/)
  })

  test('clears the place in the URL when the reader follows a link to the blocks list it opened at @HY-04', async ({
    page,
  }) => {
    await synthesizeOlderRows(page)
    await page.goto('/blocks')
    const rows = page.locator('#blocks tbody tr[data-row-id]')
    await expect(rows).toHaveCount(20)
    for (const expected of [40, 60]) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })
      await expect(rows).toHaveCount(expected)
    }
    await expect(page).toHaveURL(/from=/)
    await page.evaluate(() => {
      ;(window as { sameDocument?: boolean }).sameDocument = true
    })
    await page
      .getByRole('navigation', { name: 'Radar' })
      .getByRole('link', { name: 'Core' })
      .click()
    await expect(page.locator(`a[href="/block/${TIP}"]`).first()).toBeVisible()
    await expect(page).not.toHaveURL(/from=/)
    expect(await page.evaluate(() => (window as { sameDocument?: boolean }).sameDocument)).toBe(
      true,
    )
  })

  test('opens a fresh link at the block it names and reads only that page until the reader scrolls @HY-04', async ({
    page,
  }) => {
    await synthesizeOlderRows(page)
    const from = TIP - 100
    await page.goto(`/blocks?from=${from}`)
    const rows = page.locator('#blocks tbody tr[data-row-id]')
    await expect(rows).toHaveCount(20)
    await page.waitForTimeout(1500)
    await expect(rows.first()).toHaveAttribute('data-row-id', String(from))
    const reads = await page.evaluate(
      () => (window as unknown as { __rowReads?: number[] }).__rowReads ?? [],
    )
    expect(reads.every((h) => h <= from && h > from - 20)).toBe(true)
    await expect(page.getByRole('button', { name: /newest/ })).toBeVisible()
  })

  test('keeps the same list while the reader scrolls a page with other parameters, such as testnet @HY-04', async ({
    page,
  }) => {
    await synthesizeOlderRows(page, TESTNET_TIP)
    await page.goto('/blocks?network=testnet')
    const rows = page.locator('#blocks tbody tr[data-row-id]')
    await expect(rows).toHaveCount(20)
    await page.locator('#blocks table').evaluate((el) => {
      el.setAttribute('data-test-mark', 'kept')
    })
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await page.mouse.wheel(0, 120)
    await expect(rows).toHaveCount(40)
    await expect(page.locator('#blocks table[data-test-mark="kept"]')).toHaveCount(1)
    await expect(page).toHaveURL(/network=testnet/)
    await expect(page).toHaveURL(/from=\d+/)
  })

  test('keeps the list when the reader scrolls a little at the top @HY-04', async ({ page }) => {
    await page.goto('/blocks')
    const rows = page.locator('#blocks tbody tr[data-row-id]')
    await expect(rows).toHaveCount(20)
    await page.locator('#blocks table').evaluate((el) => {
      el.setAttribute('data-test-mark', 'kept')
    })
    await page.mouse.wheel(0, 30)
    await page.waitForTimeout(600)
    await page.mouse.wheel(0, -30)
    await page.waitForTimeout(600)
    await expect(page.locator('#blocks table[data-test-mark="kept"]')).toHaveCount(1)
  })

  test('keeps at most eight pages of rows on the page however far the reader scrolls @HY-04', async ({
    page,
  }) => {
    await synthesizeOlderRows(page)
    await page.goto('/blocks')
    const rows = page.locator('#blocks tbody tr[data-row-id]')
    await expect(rows).toHaveCount(20)
    for (let i = 0; i < 10; i++) {
      const before = await rows.last().getAttribute('data-row-id')
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })
      await expect(rows.last()).not.toHaveAttribute('data-row-id', before!)
    }
    expect(await rows.count()).toBeLessThanOrEqual(160)
    const reads = await page.evaluate(
      () => (window as unknown as { __rowReads?: number[] }).__rowReads ?? [],
    )
    expect(reads.length, 'one read per page scrolled to, none ahead').toBeLessThanOrEqual(13)
    await expect(page.locator(`[data-row-id="${TIP}"]`)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /newest/ })).toBeVisible()
  })

  test('never shows a part-filled page as a whole one: it stays busy and says how many rows are still coming @HY-04 @IN-02', async ({
    page,
  }) => {
    // Holds every block-row read after the first until the test releases them, so the page sits part-filled.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __radarCore?: Record<string, (...args: unknown[]) => Promise<unknown>>
        __releaseRows: () => void
      }
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      w.__releaseRows = release
      let core: typeof w.__radarCore
      let reads = 0
      Object.defineProperty(w, '__radarCore', {
        configurable: true,
        get: () => core,
        set(value: typeof core) {
          core = value
          const original = value?.blockRows
          if (!value || !original) return
          value.blockRows = async (...args) => {
            if (reads++ > 0) await gate
            return original.apply(value, args)
          }
        },
      })
    })
    await page.goto('/blocks')
    const table = page.locator('#blocks table')
    const rows = table.locator('tbody tr:not(.rx-skelrow):not(.rx-pad)')
    await expect(rows).toHaveCount(4)
    await expect(table).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('[data-pending-note]')).toHaveText(
      'Showing 4 of 20 rows. The rest are on their way…',
    )
    await expect(page.locator('#blocks .rx-sec__desc')).toHaveCount(0)

    await page.evaluate(() => (window as unknown as { __releaseRows: () => void }).__releaseRows())
    await expect(rows).toHaveCount(20)
    await expect(table).not.toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('[data-pending-note]')).toHaveCount(0)
    await expect(page.locator('#blocks .rx-sec__desc')).toContainText(/^Heights /)
  })

  test('writes the unit after each block’s transaction count on a phone @HY-04', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 1000) > 640, 'phone layout only')
    await page.goto('/blocks')
    const cell = page.locator('td[data-u]').first()
    await expect(cell).toBeVisible()
    await expect(cell).toHaveAttribute('data-u', 'tx')
    const unit = await cell.evaluate((el) => getComputedStyle(el, '::after').content)
    expect(unit).toMatch(/tx/)
  })

  test('shows one UTC day with the days either side @IN-02', async ({ page }) => {
    await page.goto('/blocks?date=2026-11-03')
    await expect(
      page.getByRole('heading', { level: 1, name: /Blocks on 3 Nov 2026/ }),
    ).toBeVisible()
    await expect(page.locator('a[href="/block/2566380"]').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
      'href',
      /date=2026-11-02/,
    )
    await expect(page.getByRole('link', { name: 'Next day' })).toHaveAttribute(
      'href',
      /date=2026-11-04/,
    )
    await expect(page.getByLabel('Jump to a date')).toHaveValue('2026-11-03')
    await expectAccessible(page)
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/blocks?network=testnet')
    await expect(page.locator(`a[href^="/block/${TESTNET_TIP}"]`).first()).toBeVisible()
    await expect(page.locator('dashhq-bar')).toHaveAttribute('network', 'testnet')
  })

  test('shows a page of 50 that crosses UTC midnight whole, with no block missing @IN-02 @IN-16', async ({
    page,
  }) => {
    await page.goto('/blocks?network=testnet&size=50&from=1586890')
    await expect(page.locator('a[href^="/block/1586890"]').first()).toBeVisible()
    await expect(page.locator('a[href^="/block/1586841"]').first()).toBeVisible()
    const heights = await page
      .locator('table tbody a[href^="/block/"]')
      .evaluateAll((links) =>
        links.map((a) => Number(/\/block\/(\d+)/.exec(a.getAttribute('href')!)![1])),
      )
    expect(heights).toEqual(Array.from({ length: 50 }, (_, i) => 1586890 - i))
    await expect(page.getByText('Heights 1,586,841 to 1,586,890')).toBeVisible()
  })
})

test.describe('Block page', () => {
  test('shows the header, coinbase payload and transactions @IN-03 @HY-05', async ({ page }) => {
    await page.goto(`/block/${TIP}`)
    await expect(page.getByRole('heading', { level: 1, name: /2,570,085/ })).toBeVisible()
    await expect(page.locator('[data-payload="cbTx"]')).toContainText('Masternode list root')
    const phone = (page.viewportSize()?.width ?? 1000) <= 640
    await expect(
      page.getByRole(phone ? 'list' : 'table', { name: /Transactions in block 2,570,085/ }),
    ).toBeVisible()
    await expect(page.getByText('Chainwork')).toBeVisible()
    await expect(page.locator('[data-source="dapi"]').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('states the page’s DAPI source on the header only and keeps copy controls quiet until hovered @IN-03', async ({
    page,
  }) => {
    const touch = (page.viewportSize()?.width ?? 1000) <= 640
    await page.goto(`/block/${TIP}`)
    await expect(page.getByRole('heading', { level: 1, name: /Block 2,570,085/ })).toBeVisible()
    await expect(
      page.locator('article [data-source="dapi"]'),
      'one DAPI line in the band and one on the header section',
    ).toHaveCount(2)
    await expect(page.locator('#header .rx-sec__actions [data-source="dapi"]')).toHaveCount(1)
    await expect(
      page.locator('#coinbase [data-source="dapi"], #transactions [data-source="dapi"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('#header [data-source="insight"], #header [data-source="hyphen"]').first(),
      'a different source keeps its own line',
    ).toBeVisible()
    const opacity = (loc: ReturnType<typeof page.locator>) =>
      loc.evaluate((el) => getComputedStyle(el).opacity)
    const own = page.locator('.rx-rec__meta .rx-copy').first()
    expect(await opacity(own), 'the block’s own hash keeps its control').toBe('1')
    const row = page.locator('#header .rx-kv', { hasText: 'Merkle root' })
    const copy = row.locator('.rx-copy').first()
    if (touch) {
      expect(await opacity(copy), 'touch screens always show it').toBe('1')
      return
    }
    expect(await opacity(copy)).toBe('0')
    await row.hover()
    await expect.poll(() => opacity(copy)).toBe('1')
    await page.mouse.move(0, 0)
    await copy.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    expect(await opacity(copy), 'keyboard focus shows it').toBe('1')
  })

  test('cuts the header hashes in the middle on a phone and keeps the block’s own hash whole @IN-03', async ({
    page,
  }) => {
    const phone = (page.viewportSize()?.width ?? 1000) <= 640
    await page.goto(`/block/${TIP}`)
    await expect(page.getByRole('heading', { level: 1, name: /Block 2,570,085/ })).toBeVisible()
    const own = page.locator('.rx-rec__meta .rx-hash[data-display="full"] code')
    await expect(own).toHaveText(/^[0-9a-f]{64}$/)
    const header = page.locator('#header')
    const cuts = header.locator('.rx-hash-toggle')
    if (!phone) {
      await expect(cuts).toHaveCount(0)
      return
    }
    await expect(cuts).toHaveCount(2)
    for (const cut of await cuts.all()) {
      await expect(cut).toHaveText(/^[0-9a-f]{8}…[0-9a-f]{6}$/)
      await expect(cut.locator('xpath=ancestor::code')).toHaveAttribute('title', /^[0-9a-f]{64}$/)
    }
    const first = cuts.first()
    await first.click()
    await expect(first).toHaveAttribute('aria-expanded', 'true')
    await expect(first).toHaveText(/^[0-9a-f]{64}$/)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('opens by hash and walks to the previous block @IN-03', async ({ page }) => {
    await page.goto(`/block/${PREVIOUS_HASH}`)
    await expect(page.getByRole('heading', { level: 1, name: /2,570,084/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Next block' })).toHaveAttribute(
      'href',
      `/block/${TIP}`,
    )
    await page.goto(`/block/${TIP}`)
    await page.getByRole('link', { name: 'Previous block' }).click()
    await expect(page).toHaveURL(new RegExp(`/block/${PREVIOUS_HASH}`))
    await expect(page.getByRole('heading', { level: 1, name: /2,570,084/ })).toBeVisible()
  })

  test('old Insight links open the block @IN-04', async ({ page }) => {
    await page.goto(`/block-index/${TIP}`)
    await expect(page).toHaveURL(new RegExp(`/block/${TIP}$`))
    await expect(page.getByRole('heading', { level: 1, name: /2,570,085/ })).toBeVisible()
    await page.goto(`/insight/block/${PREVIOUS_HASH}`)
    await expect(page).toHaveURL(new RegExp(`/block/${PREVIOUS_HASH}$`))
    await expect(page.getByRole('heading', { level: 1, name: /2,570,084/ })).toBeVisible()
  })

  test('copies the block hash with feedback @IN-14', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
    await page.goto(`/block/${TIP}`)
    const copy = page.locator('.rx-rec__meta').getByRole('button', { name: /Copy/ }).first()
    await copy.click()
    await expect(copy).toHaveClass(/is-done/)
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeAttached()
  })

  test('says a block past the tip is not there, and offers the other network @IN-03', async ({
    page,
  }) => {
    await page.goto('/block/2670085')
    await expect(page.getByText('Not found on Mainnet')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Search Testnet' })).toBeVisible()
  })

  test('shows a quorum commitment block on testnet @IN-16 @HY-05 @HY-19', async ({ page }) => {
    await page.goto(`/block/${TESTNET_TIP}?network=testnet`)
    await expect(page.getByRole('heading', { level: 1, name: /1,589,232/ })).toBeVisible()
    await expect(page.getByText(/quorum commitment/i).first()).toBeVisible()
    await expect(page.locator('[data-payload="cbTx"]')).toBeVisible()
  })

  test('shows a testnet block’s chainwork from Insight, labelled as Insight @IN-16 @HY-19 @IN-03', async ({
    page,
  }) => {
    await page.goto(`/block/${TESTNET_TIP}?network=testnet`)
    const row = page.locator('div').filter({ has: page.getByText('Chainwork', { exact: true }) })
    await expect(row.last()).toContainText(/[0-9a-f]{8}/)
    await expect(page.getByText('Not in DAPI')).toHaveCount(0)
    await expect(page.locator('main [data-source="insight"]').first()).toBeVisible()
    await expect(page.locator('[data-stale-index]')).toHaveCount(0)
  })

  test('keeps an unknown pool’s text inside its card @IN-16', async ({ page }) => {
    await page.goto(`/block/${TESTNET_TIP}?network=testnet`)
    const card = page.locator('.rx-stat').filter({ hasText: 'Coinbase tag says' })
    await expect(card.getByText('No known pool')).toBeVisible()
    const box = await card.boundingBox()
    for (const part of [card.locator('.rx-stat__value'), card.locator('.rx-stat__note')]) {
      const inner = await part.boundingBox()
      expect(inner!.x).toBeGreaterThanOrEqual(box!.x - 1)
      expect(inner!.x + inner!.width).toBeLessThanOrEqual(box!.x + box!.width + 1)
    }
    const text = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
    expect(text).toBe(true)
  })

  test('keeps two decimals on a large difficulty and the full value in its title @IN-03 @HY-05', async ({
    page,
  }) => {
    await page.goto(`/block/${TIP}`)
    const difficulty = page.locator('#header [title]').filter({ hasText: /^[\d,]{9,}\.\d{2}$/ })
    await expect(difficulty).toBeVisible()
    const title = await difficulty.getAttribute('title')
    expect(title).toMatch(/^[\d,]+\.\d{2,}$/)
    expect(title!.startsWith((await difficulty.textContent())!.slice(0, -1))).toBe(true)
  })

  test('joins the block size to its unit with a no-break space @IN-05', async ({ page }) => {
    await page.goto(`/block/${TIP}`)
    await expect(page.locator('#header')).toContainText(/Size\s*[\d,]+\u00a0bytes/)
  })

  test('shows a small testnet difficulty with its digits @IN-16 @HY-19', async ({ page }) => {
    await page.goto(`/block/${TESTNET_TIP}?network=testnet`)
    const header = page.locator('#header')
    await expect(header).toContainText(/Difficulty\s*0\.\d*[1-9]/)
  })
})
