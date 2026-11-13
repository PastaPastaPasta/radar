import type { Page, TestInfo } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const isPhone = (info: TestInfo) => info.project.name.startsWith('phone')
const rows = (page: Page) => page.locator('[data-page="/changes"] tbody tr')

test.describe('Masternode list changes', () => {
  test('lists the latest changes with their time, block, masternode and a coloured badge @RA-80', async ({
    page,
  }, info) => {
    await page.goto('/changes')
    await expect(page.getByRole('heading', { level: 1, name: 'Changes' })).toBeVisible()
    await expect(rows(page).first()).toBeVisible()
    await settled(page)
    expect(await rows(page).count()).toBeGreaterThan(100)
    const first = rows(page).first()
    await expect(first.locator('time')).toBeVisible()
    await expect(first.locator('a[href^="/block/"]')).toBeVisible()
    await expect(first.locator('a[href^="/mn/"]')).toBeVisible()
    await expect(first.locator('[data-change-field] .dh-badge')).toBeVisible()
    await expect(page.locator('[data-page="/changes"] [data-source="radar"]').first()).toBeVisible()
    expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)
    if (!isPhone(info)) {
      await expect(page.getByRole('columnheader', { name: 'Masternode' })).toBeVisible()
    }
    await expectAccessible(page)
  })

  test('filters by kind and keeps the kind in the address @RA-80', async ({ page }) => {
    await page.goto('/changes?kind=pose')
    await expect(rows(page).first()).toBeVisible()
    await settled(page)
    await expect(page.getByRole('button', { name: 'PoSe bans and revivals' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const total = await rows(page).count()
    for (const field of await rows(page)
      .locator('[data-change-field]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-change-field'))))
      expect(field).toBe('pose')
    await page.getByRole('button', { name: 'Registrations and removals' }).click()
    await expect(page).toHaveURL(/kind=joins/)
    await expect.poll(() => rows(page).count()).not.toBe(total)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Registrations and removals' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: 'Everything' }).click()
    await expect(page).not.toHaveURL(/kind=/)
  })

  test('says once that the crawl is needed in Decentralized only mode @RA-80', async ({ page }) => {
    await page.goto('/changes?sources=decentralized')
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(rows(page)).toHaveCount(0)
  })
})

test.describe('The Radar API page', () => {
  const ENDPOINTS = [
    'status',
    'releases',
    'health',
    'summary',
    'history',
    'geo',
    'masternodes',
    'masternode',
    'payments',
    'masternode-bench',
    'bench',
    'check',
    'platform',
    'activation',
    'changes',
    'reference',
  ]

  test('lists every endpoint with an anchor and copy controls, two curl examples and how the data is collected @RA-90', async ({
    page,
  }) => {
    await page.goto('/api')
    await expect(page.getByRole('heading', { level: 1, name: 'Radar API' })).toBeVisible()
    for (const id of ENDPOINTS) await expect(page.locator(`article#${id}`)).toBeAttached()
    await expect(page.locator('[data-endpoint]')).toHaveCount(ENDPOINTS.length)
    await expect(page.locator('article#check')).toContainText(
      'POST /api/v1/{net}/masternodes/{protx}/check',
    )
    await expect(page.locator('[data-curl]')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'How the data is collected' })).toBeVisible()
    await expect(page.locator('[data-api-unchanged]')).toContainText(
      'https://radar.dashhq.org/api/v1/*',
    )
    expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)
    await expectAccessible(page)
  })

  test('copies the link to an endpoint and opens it by its anchor @RA-90', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/api')
    const card = page.locator('article#masternodes')
    await card.getByRole('button', { name: /Copy link to GET/ }).click()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(/\/api#masternodes$/)
    await page.goto('/api#platform')
    await expect(page.locator('article#platform')).toBeInViewport()
  })

  test('is static and says the API is a hosted service in Decentralized only mode @RA-90', async ({
    page,
  }) => {
    await page.goto('/api?sources=decentralized')
    await expect(page.locator('[data-api-hosted]')).toBeVisible()
    await expect(page.locator('[data-endpoint]')).toHaveCount(ENDPOINTS.length)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(0)
  })
})
