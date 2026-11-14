import type { Page } from '@playwright/test'
import { expect, test } from '../helpers/test'

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 700

async function openTools(page: Page): Promise<void> {
  if (onPhone(page)) {
    await page.getByRole('contentinfo').getByRole('link', { name: 'Tools', exact: true }).click()
  } else {
    await page
      .getByRole('navigation', { name: 'Radar' })
      .getByRole('link', { name: 'Tools' })
      .click()
  }
  await expect(page).toHaveURL(/\/query/)
}

test.describe('decoders @NX-72 @NX-71', () => {
  const DECODERS = [
    { id: 'contract', title: 'Contract decoder' },
    { id: 'identity', title: 'Identity decoder' },
    { id: 'document', title: 'Document decoder' },
    { id: 'proof', title: 'Proof decoder' },
    { id: 'path', title: 'Path decoder' },
  ]

  test('every decoder is reached by clicking from the header', async ({ page }) => {
    for (const { id, title } of DECODERS) {
      await page.goto('/')
      await openTools(page)
      await page
        .getByRole('navigation', { name: /Tools pages/ })
        .getByRole('link', { name: 'Decoders' })
        .click()
      await expect(page).toHaveURL(/\/tools\/decoders$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Decoders' })).toBeVisible()
      await page.locator(`[data-decoder-link="${id}"]`).click()
      await expect(page).toHaveURL(new RegExp(`/tools/${id}$`))
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    }
  })

  test('the chooser lists all the decoders and State transition', async ({ page }) => {
    await page.goto('/tools/decoders')
    for (const id of [...DECODERS.map((d) => d.id), 'transition']) {
      await expect(page.locator(`[data-decoder-link="${id}"]`)).toBeVisible()
    }
  })

  test('one decoder leads to the next', async ({ page }) => {
    await page.goto('/tools/contract')
    const switcher = page.locator('[data-decoder-switch]')
    await switcher.getByRole('link', { name: 'Proof decoder' }).click()
    await expect(page).toHaveURL(/\/tools\/proof$/)
    await expect(switcher.getByRole('link', { name: 'Proof decoder' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
