import { expect, test } from '@playwright/test'

test('home page renders', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Radar' })).toBeVisible()
})
