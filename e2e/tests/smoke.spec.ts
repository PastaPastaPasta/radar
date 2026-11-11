import { expect, test } from '../helpers/test'

test('home page renders', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /^Radar/ })).toBeVisible()
})
