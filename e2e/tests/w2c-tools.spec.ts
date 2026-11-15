import type { Page } from '@playwright/test'
import { expect, test } from '../helpers/test'

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 700

/** The decoder chooser, reached by clicking from the header: the rail's Tools on a wide screen, search's pages on a phone. */
async function openDecoders(page: Page): Promise<void> {
  if (onPhone(page)) {
    await page
      .getByRole('navigation', { name: 'Radar' })
      .getByRole('link', { name: 'Search' })
      .click()
    await page.getByRole('searchbox').fill('decoders')
    await page
      .locator('[data-kind="page"]')
      .getByRole('link', { name: 'Decoders', exact: true })
      .click()
  } else {
    await page
      .getByRole('navigation', { name: 'Radar' })
      .getByRole('link', { name: 'Tools' })
      .click()
    await expect(page).toHaveURL(/\/query/)
    await page
      .getByRole('navigation', { name: /Tools pages/ })
      .getByRole('link', { name: 'Decoders' })
      .click()
  }
}

test.describe('decoders @NX-72 @NX-71', () => {
  const DECODERS = [
    { id: 'contract', title: 'Contract decoder' },
    { id: 'identity', title: 'Identity decoder' },
    { id: 'document', title: 'Document decoder' },
    { id: 'proof', title: 'Proof decoder' },
    { id: 'path', title: 'Path decoder' },
  ]

  test.describe('from the header', () => {
    // On a phone the way there is search, which also asks its lookups for the typed word; none of those is recorded.
    test.use({ allowFixtureMisses: true })

    test('every decoder is reached by clicking from the header', async ({ page }) => {
      for (const { id, title } of DECODERS) {
        await page.goto('/')
        await openDecoders(page)
        await expect(page).toHaveURL(/\/tools\/decoders$/)
        await expect(page.getByRole('heading', { level: 1, name: 'Decoders' })).toBeVisible()
        await page.locator(`[data-decoder-link="${id}"]`).click()
        await expect(page).toHaveURL(new RegExp(`/tools/${id}$`))
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      }
    })
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

test('the "/" shortcut chip shows only where a pointer can hover @W2-63', async ({ page }) => {
  // Not the home page: its hero has a search box of its own.
  await page.goto('/blocks')
  const chips = page.locator('[data-palette-trigger] kbd')
  await expect(chips.first()).toBeAttached()
  const touch = await page.evaluate(() => matchMedia('(hover: none)').matches)
  for (const chip of await chips.all()) {
    if (touch) await expect(chip).toBeHidden()
    else if (await chip.locator('..').isVisible()) await expect(chip).toBeVisible()
  }
})
