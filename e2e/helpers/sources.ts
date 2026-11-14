import { expect, type Locator } from '@playwright/test'

const SCOPE = 'xpath=ancestor-or-self::*[@data-source-scope or @data-page][1]'

/**
 * The one source line that speaks for a card, table or figure: that of the nearest section around it, or the page's
 * when it sits outside a section. The section or page is found first, then its own line, so a part that wraps a
 * nested section never borrows that section's line.
 */
export const sourceLineOf = (part: Locator): Locator =>
  part
    .locator(SCOPE)
    .locator('[data-section-sources]:not(:scope [data-source-scope] [data-section-sources])')

/** A part (card, table, key-value row or figure) says in `data-reports` what it handed to its line: `sdk:proved`, `dapi`. */
export const expectReports = (part: Locator, word: string): Promise<void> =>
  expect(part).toHaveAttribute('data-reports', new RegExp(`(^| )${word}( |$)`))

/**
 * The part's own read was proof-checked: it reported a proved SDK read, its line shows the Proof-checked mark, and no
 * unproved SDK read sits on that line beside it.
 */
export async function expectProved(part: Locator): Promise<void> {
  await expectReports(part, 'sdk:proved')
  const line = sourceLineOf(part)
  await expect(line.locator('[data-source="sdk"][data-proved="true"]')).toBeVisible()
  await expect(line.locator('[data-source="sdk"][data-proved="false"]')).toHaveCount(0)
}

/** A figure's own mark, which sits in its popover: clipped to a point at rest, drawn on hover, focus and tap. */
export const ownMarkOf = (figure: Locator): Locator => figure.locator('.rx-fig__src')
export const expectTucked = (popover: Locator): Promise<void> =>
  expect(popover).toHaveCSS('clip-path', 'inset(50%)')
export const expectShown = (popover: Locator): Promise<void> =>
  expect(popover).toHaveCSS('clip-path', 'none')

/** The source marks a reader sees at rest: every mark outside a figure's popover. */
export const RESTING_MARKS = '[data-source]:visible:not(.rx-fig__src *)'
