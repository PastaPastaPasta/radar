import type { Locator } from '@playwright/test'

/**
 * The one source line that speaks for a card, table or figure: its section's, or the page's when it sits outside a
 * section. A part inside a section or a page frame draws no mark of its own.
 */
export const sourceLineOf = (part: Locator): Locator =>
  part
    .locator('xpath=ancestor-or-self::*[.//*[@data-section-sources]][1]//*[@data-section-sources]')
    .first()
