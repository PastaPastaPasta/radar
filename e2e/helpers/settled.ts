import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Waits until nothing on the page is still loading: no skeleton and no `aria-busy` region, and the web fonts have
 * loaded, so a line does not wrap differently a moment after it was measured. Layout checks and error checks run
 * after this, so they look at the page's data and not at its placeholders.
 */
export async function settled(page: Page): Promise<void> {
  const nothingLoading = () =>
    expect(page.locator('[data-skeleton], [aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
  await nothingLoading()
  // `fonts.ready` resolves to a FontFaceSet, which cannot cross back from the page, so the promise is emptied.
  await expect(async () => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
  }).toPass({ timeout: 5_000 })
  // A navigation during the font wait (a redirect, a retry) brings its own placeholders.
  await nothingLoading()
}

/** Page-level sideways overflow in CSS pixels: positive when the page would scroll horizontally. */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}
