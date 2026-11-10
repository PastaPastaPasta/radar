import { expectAccessible } from '../helpers/a11y'
import { expect, test } from '../helpers/test'

const SECTION_IDS = [
  'tokens',
  'layout',
  'figures',
  'amount',
  'entities',
  'badges',
  'charts',
  'sources',
  'states',
  'tabs',
  'table',
  'linkouts',
  'palette',
]

test.describe('ui kit', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-10T12:00:00Z') })
    await page.goto('/__kit')
    await expect(page.locator('[data-ready="1"]')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Kit' })).toBeVisible()
  })

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await expectAccessible(page, { include: 'main' })
  })

  test('renders every section without horizontal overflow', async ({ page }) => {
    for (const id of SECTION_IDS) {
      await expect(page.locator(`#${id}`), id).toBeAttached()
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('every section takes up room on the page and the full page is attached', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => document.fonts.ready)
    const viewportWidth = page.viewportSize()?.width ?? 0
    for (const id of SECTION_IDS) {
      const box = await page.locator(`#${id}`).boundingBox()
      expect(box, id).not.toBeNull()
      expect(box?.height, `${id} height`).toBeGreaterThan(40)
      expect(box?.width, `${id} width`).toBeGreaterThan(viewportWidth * 0.5)
    }
    await testInfo.attach('kit', {
      body: await page.screenshot({ fullPage: true, scale: 'css' }),
      contentType: 'image/png',
    })
  })

  test('copy confirms with a check and a polite announcement', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
    const copy = page.locator('#entities').getByRole('button', { name: 'Copy full value' }).first()
    await copy.scrollIntoViewIfNeeded()
    await copy.click()
    await expect(copy).toHaveClass(/is-done/)
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeAttached()
  })

  test('sorting a table header flips aria-sort and keeps keyboard focus', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('phone'), 'header row is hidden in card layout')
    const table = page.locator('#table table').first()
    const header = table.getByRole('button', { name: 'Last paid' })
    await header.focus()
    await page.keyboard.press('Enter')
    await expect(table.getByRole('columnheader', { name: 'Last paid' })).toHaveAttribute(
      'aria-sort',
      /ascending|descending/,
    )
    await expect(header).toBeFocused()
  })

  test('a chip opens its hover card on keyboard focus', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith('phone'),
      'hover cards are pointer and keyboard only',
    )
    const chip = page.locator('#entities [data-entity="block"] a').first()
    await chip.scrollIntoViewIfNeeded()
    await chip.focus()
    await expect(page.locator('.rx-hc')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('.rx-hc')).toBeHidden()
  })

  test('theme control switches the page between light and dark', async ({ page }) => {
    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})
