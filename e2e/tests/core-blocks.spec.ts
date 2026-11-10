import { expectAccessible } from '../helpers/a11y'
import { expect, test } from '../helpers/test'

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
    await expect(page.getByRole('table', { name: /Transactions in block 2,570,085/ })).toBeVisible()
    await expect(page.getByText('Chainwork')).toBeVisible()
    await expect(page.locator('[data-source="dapi"]').first()).toBeVisible()
    await expectAccessible(page)
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
})
