import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Waits until nothing on the page is still loading: no skeleton and no `aria-busy` region. Layout checks and error
 * checks run after this, so they look at the page's data and not at its placeholders.
 */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('[data-skeleton], [aria-busy="true"]')).toHaveCount(0, {
    timeout: 15_000,
  })
}

/** Page-level sideways overflow in CSS pixels: positive when the page would scroll horizontally. */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}
