import { expectAccessible } from '../helpers/a11y'
import { expect, test } from '../helpers/test'

test.describe('status', () => {
  test('shows the Core tip, the best ChainLock and every source @IN-09', async ({ page }) => {
    await page.goto('/status')
    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()

    await expect(page.getByText('Core tip', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Best ChainLock', { exact: true }).first()).toBeVisible()

    const sources = page.getByRole('heading', { name: 'Sources' })
    await expect(sources).toBeVisible()
    for (const name of ['DAPI', 'Hyphen', 'Platform Explorer', 'Radar']) {
      await expect(page.locator('main').getByText(name, { exact: false }).first()).toBeVisible()
    }
    await expect(page.getByText('DAPI request budget')).toBeVisible()
    await expectAccessible(page)
  })

  test("names the Core summary's source once, beside its heading @IN-09", async ({ page }) => {
    await page.goto('/status')
    const card = page.locator('#core')
    await expect(card.locator('[data-status="tip"]')).toContainText('2,570,')
    await expect(card.locator('[data-status="sync"]')).toBeVisible()
    await expect(card.locator('[data-source="dapi"]')).toHaveCount(1)
    await expect(card.locator('[data-source]').first()).toBeVisible()
  })

  test('works on testnet and says which network it is reading @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/status?network=testnet')
    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()
    await expect(page.getByText('Core tip', { exact: true }).first()).toBeVisible()
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
    await expectAccessible(page)
  })
})

test.describe('units and fiat', () => {
  test('offers DASH, mDASH, µDASH and duffs and remembers the choice @IN-12 @HY-16', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    const group = page.getByRole('group', { name: 'Unit for DASH amounts' })
    const example = page.locator('#units').getByText(/Example/)

    for (const [unit, shown] of [
      ['mDASH', /1,234\.56\d*\s*mDASH/],
      ['µDASH', /1,234,567(\.\d+)?\s*µDASH/],
      ['duffs', /123,456,789\s*duffs/],
      ['DASH', /1\.2346\s*DASH/],
    ] as const) {
      await group.getByRole('button', { name: unit, exact: true }).click()
      await expect(group.getByRole('button', { name: unit, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(example).toHaveText(shown)
    }

    await group.getByRole('button', { name: 'duffs', exact: true }).click()
    await page.reload()
    await expect(page.locator('#units').getByText(/Example/)).toHaveText(/123,456,789\s*duffs/)
    await expectAccessible(page)
  })

  test('fiat is a choice on mainnet and absent on testnet @IN-12 @HY-17', async ({ page }) => {
    await page.goto('/settings')
    const toggle = page.getByRole('checkbox', { name: /USD value/ })
    await expect(toggle).toBeVisible()
    await toggle.check()
    await page.reload()
    await expect(page.getByRole('checkbox', { name: /USD value/ })).toBeChecked()

    await page.goto('/settings?network=testnet')
    await expect(page.getByText(/never show USD/)).toBeVisible()
    await expect(page.locator('#units').getByText(/Example/)).not.toContainText('$')
    await expect(page.locator('#units').getByText(/Example/)).toContainText('tDASH')
  })
})

test.describe('testnet is unmistakable', () => {
  test('a coloured 4 px frame and a Testnet label frame every page @HY-17', async ({ page }) => {
    await page.goto('/status')
    await expect(page.locator('[data-testnet-keyline]')).toHaveCount(0)

    await page.goto('/status?network=testnet')
    const frame = page.locator('[data-testnet-keyline]')
    await expect(frame).toBeAttached()
    await expect(page.locator('[data-testnet-label]')).toHaveText('Testnet')
    const frameStyle = await frame.evaluate((el) => {
      const s = getComputedStyle(el)
      return { width: s.borderTopWidth, color: s.borderTopColor }
    })
    expect(frameStyle.width).toBe('4px')
    expect(frameStyle.color).not.toBe('rgba(0, 0, 0, 0)')

    await page.goto('/blocks?network=testnet')
    await expect(page.locator('[data-testnet-label]')).toHaveText('Testnet')
  })

  test('a devnet gets a dashed frame with its own name @HY-17', async ({ page }) => {
    await page.goto('/status?network=devnet-qa')
    await expect(page.locator('[data-testnet-keyline="dev"]')).toBeAttached()
    await expect(page.locator('[data-testnet-label]')).toHaveText('Devnet qa')
  })
})

test.describe('phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 600, 'phone layout only')

  test('status and settings need no sideways scroll and keep the tabs reachable @HY-18', async ({
    page,
  }) => {
    for (const path of ['/status', '/settings', '/status?network=testnet']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
      const nav = page.getByRole('navigation', { name: 'Radar' })
      await expect(nav.getByRole('link', { name: 'Core' })).toBeVisible()
    }
  })
})
