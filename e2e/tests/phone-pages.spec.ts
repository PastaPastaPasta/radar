import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const TIP = 2570085
const TESTNET_TIP = 1589232
const MAINNET_ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const TESTNET_ADDRESS = 'yjSvwyLB5X4dqQqVMPMu6UdrFpYZ3u9v5U'

const onPhone = (page: { viewportSize(): { width: number } | null }) =>
  (page.viewportSize()?.width ?? 1000) <= 640

test.describe('Core height on the home card', () => {
  for (const [label, path, tip] of [
    ['mainnet', '/', TIP],
    ['testnet', '/?network=testnet', TESTNET_TIP],
  ] as const) {
    test(`says the tip is ChainLocked on the ${label} height card @IN-01`, async ({ page }) => {
      await page.goto(path)
      const card = page.locator('[data-pulse="core"]')
      await expect(card).toContainText(tip.toLocaleString('en-US'))
      await expect(card.locator('.rx-ok')).toContainText('ChainLocked')
    })
  }

  test('shows the newest Core height once on a phone, and as the last chip elsewhere @IN-01 @HY-01', async ({
    page,
  }) => {
    await page.goto('/')
    const lane = page.locator('#lane-core')
    await expect(lane.locator(`a.rx-blk[data-h="${TIP - 1}"]`)).toBeAttached()
    await expect(lane.locator(`a.rx-blk[data-h="${TIP}"]`)).toHaveCount(onPhone(page) ? 0 : 1)
  })
})

test.describe('Address summary on a phone', () => {
  test('keeps the figures in one block, the QR code behind a button, and the history close @IN-06 @HY-08', async ({
    page,
  }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto(`/address/${MAINNET_ADDRESS}`)
    const summary = page.locator('[data-address-summary]')
    await expect(summary).toContainText('Balance')
    await expect(page.getByText('Watching for new transactions on this address.')).toBeVisible()
    await expect(page.locator('#address-qr')).toHaveCount(0)
    const toggle = page.getByRole('button', { name: 'Show QR code' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.locator('#address-qr')).toBeVisible()
    await page.getByRole('button', { name: 'Hide QR code' }).click()
    await expect(page.locator('#address-qr')).toHaveCount(0)
    const first = page.locator('#history tbody tr').first()
    await expect(first).toBeVisible()
    const top = await first.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    expect(top).toBeLessThan(2 * 844)
  })

  test('shows no QR button and keeps the QR card on desktop @IN-06', async ({ page }) => {
    test.skip(onPhone(page), 'desktop layout only')
    await page.goto(`/address/${MAINNET_ADDRESS}`)
    await expect(page.getByRole('heading', { name: 'QR code' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show QR code' })).toHaveCount(0)
  })
})

test.describe('First and last seen from Insight', () => {
  test('shows both dates on a testnet address, labelled as Insight @HY-19 @IN-16 @HY-08', async ({
    page,
  }) => {
    await page.goto(`/address/${TESTNET_ADDRESS}?network=testnet`)
    const seen = page.locator('[data-address-summary] [data-seen]')
    await expect(seen).toContainText('First:')
    await expect(seen).toContainText('Last:')
    await expect(seen).toContainText('9 Feb 2026')
    const stat = page.locator('[data-address-summary] .rx-stat', { hasText: 'First and last seen' })
    await expect(stat.locator('[data-source="insight"]')).toBeVisible()
  })
})

test.describe('Rich list on a phone', () => {
  test('starts the concentration chart in the first screen @HY-09', async ({ page }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto('/rich-list')
    const note = page.locator('[data-share-basis]')
    await expect(note).toBeVisible()
    await expect(note.locator('summary')).toContainText('Shares are of address balances')
    const chart = page.getByRole('img', { name: /Share of the supply held by the top/ })
    await expect(chart).toBeVisible()
    const top = await chart.evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBeLessThan(844)
  })
})

test.describe('Governance filters', () => {
  test('filters by name or hash and by status, with the counts shown @HY-13', async ({ page }) => {
    await page.goto('/governance')
    const box = page.getByRole('searchbox', { name: 'Filter proposals by name or hash' })
    await expect(box).toBeVisible()
    const result = page.locator('[data-filter-result]')
    await box.fill('no-such-proposal-zzz')
    await expect(result).toContainText(/^0 of \d+ proposals match/)
    await expect(page.getByText('No proposals match')).toBeVisible()
    await box.fill('')
    const funded = page
      .getByRole('group', { name: 'Filter proposals by status' })
      .getByRole('button', { name: /^Funded/ })
    await funded.click()
    await expect(funded).toHaveAttribute('aria-pressed', 'true')
    await expect(result).toContainText(/\d+ of \d+ proposals match/)
  })

  test('groups the yes, no, abstain and threshold figures under one header @HY-13', async ({
    page,
  }) => {
    test.skip(onPhone(page), 'the table header is a desktop layout')
    await page.goto('/governance')
    await expect(page.getByRole('columnheader', { name: 'Votes' }).first()).toBeVisible()
  })

  test('lists each proposal’s votes on one line on a phone @HY-13', async ({ page }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto('/governance')
    const line = page.locator('.rx-propline').first()
    await expect(line).toBeVisible()
    await expect(line).toContainText(/yes/)
  })
})

test.describe('Blocks per page', () => {
  test('lists 20, 50 or 100 blocks of a day from the index and keeps the size in the URL @IN-02', async ({
    page,
  }) => {
    await page.goto('/blocks?date=2026-11-03')
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(20)
    const group = page.getByRole('group', { name: 'Blocks per page' })
    await group.getByRole('button', { name: '50' }).click()
    await expect(page).toHaveURL(/size=50/)
    await expect(rows).toHaveCount(50)
    await group.getByRole('button', { name: '100' }).click()
    await expect(page).toHaveURL(/size=100/)
    await expect(rows).toHaveCount(100)
    await expect(page.getByRole('link', { name: 'Older' })).toHaveAttribute('href', /size=100/)
  })

  test('opens straight at a size from the URL on the newest page @IN-02', async ({ page }) => {
    await page.goto('/blocks?size=50')
    await expect(page.locator('tbody tr')).toHaveCount(50)
    await expect(page.locator(`a[href="/block/${TIP}"]`).first()).toBeVisible()
  })
})
