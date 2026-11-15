import { expect, test } from '../helpers/test'

test.describe('going offline @NX-77', () => {
  test('a tap on a page that cannot load shows an offline notice, not the crash message, and recovers', async ({
    page,
    context,
  }) => {
    await page.goto('/nodes')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('[data-header-tip]')).toHaveAttribute('data-connection', 'live')

    await context.setOffline(true)
    await expect(page.locator('[data-header-tip]')).toHaveAttribute('data-connection', 'stopped')
    await page
      .getByRole('navigation', { name: 'Radar' })
      .getByRole('link', { name: 'Platform' })
      .click()

    const notice = page.locator('[data-offline-notice]')
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('heading', { name: 'You’re offline' })).toBeVisible()
    await expect(page.getByText('This page couldn’t be shown')).toHaveCount(0)

    await context.setOffline(false)
    await expect(
      page.getByRole('heading', { level: 1, name: /Dash Platform|Platform/ }),
    ).toBeVisible({
      timeout: 20_000,
    })
    await expect(notice).toHaveCount(0)
  })

  test('/offline explains instead of going home', async ({ page }) => {
    await page.goto('/offline')
    await expect(page).toHaveURL(/\/offline$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Offline' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Your saved items' })).toBeVisible()
  })
})
