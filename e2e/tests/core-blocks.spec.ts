import { expectAccessible } from '../helpers/a11y'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const TIP = 2570085
const PREVIOUS_HASH = '0000000000000027cf3cde6fa7d6361587cd5ac4f211ceb6b7bfaf1ba4e01ce4'
const TESTNET_TIP = 1589232

test.describe('Blocks list', () => {
  test('lists the newest blocks and pages back by cursor @HY-04', async ({ page }) => {
    await page.goto('/blocks')
    await expect(page.getByRole('heading', { level: 1, name: 'Blocks' })).toBeVisible()
    await expect(page.locator(`a[href="/block/${TIP}"]`).first()).toBeVisible()
    await expectAccessible(page)
    await page.getByRole('link', { name: 'Older' }).click()
    await expect(page).toHaveURL(/from=2570065/)
    await expect(page.locator('a[href="/block/2570065"]').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Newer' })).toBeVisible()
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
