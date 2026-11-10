import type { Page } from '@playwright/test'

export async function freezeClock(page: Page, recordedAt: string | number | Date): Promise<void> {
  await page.clock.setFixedTime(new Date(recordedAt))
}
