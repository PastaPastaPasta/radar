import type { Page } from '@playwright/test'
import { expect, test } from '../helpers/test'

const PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident'
const NOTICE = 'That looks like a private key or recovery phrase'
const PARTIAL_NOTICE = 'That could be part of a recovery phrase'

function watchRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))
  return urls
}

const historyLength = (page: Page) => page.evaluate(() => window.history.length)

test.describe('secrets in the search page', () => {
  test('a recovery phrase typed into the form stays out of the URL and history @X-01', async ({
    page,
  }) => {
    const requests = watchRequests(page)
    await page.goto('/search')
    const box = page.getByRole('searchbox', { name: 'Search Radar' })
    await expect(box).toBeVisible()
    const before = await historyLength(page)

    await box.fill(PHRASE)
    await page.getByRole('button', { name: 'Search' }).click()

    await expect(page.getByText(NOTICE)).toBeVisible()
    await expect(box).toHaveValue('')
    expect(new URL(page.url()).search).toBe('')
    expect(await historyLength(page)).toBe(before)
    await expect(page).toHaveTitle(/^Search/)
    expect(await page.title()).not.toContain('abandon')
    expect(requests.filter((url) => url.includes('abandon'))).toEqual([])
  })

  test('a quoted, prefixed or partial phrase is withheld too @X-01', async ({ page }) => {
    const requests = watchRequests(page)
    await page.goto('/search')
    const box = page.getByRole('searchbox', { name: 'Search Radar' })
    const before = await historyLength(page)

    for (const [input, notice] of [
      [`"${PHRASE}"`, NOTICE],
      [`my seed: ${PHRASE}`, NOTICE],
      ['abandon ability able about', PARTIAL_NOTICE],
    ] as const) {
      await box.fill(input)
      await box.press('Enter')
      await expect(page.getByText(notice)).toBeVisible()
      await expect(box).toHaveValue('')
      expect(new URL(page.url()).search).toBe('')
    }

    expect(await historyLength(page)).toBe(before)
    expect(requests.filter((url) => url.includes('abandon'))).toEqual([])
  })

  test('a link carrying a phrase loads with q stripped @X-01', async ({ page }) => {
    const requests = watchRequests(page)
    await page.goto(`/search?q=${encodeURIComponent(PHRASE)}`)

    await expect(page.getByText(NOTICE)).toBeVisible()
    await expect(page).toHaveURL((url) => url.pathname === '/search' && url.search === '')
    await expect(page.getByRole('searchbox', { name: 'Search Radar' })).toHaveValue('')
    expect(await page.title()).not.toContain('abandon')
    expect(
      requests.filter((url) => url.includes('abandon') && new URL(url).pathname !== '/search'),
    ).toEqual([])
  })

  test('ordinary text still goes to the URL @X-01', async ({ page }) => {
    await page.goto('/search')
    const box = page.getByRole('searchbox', { name: 'Search Radar' })

    await box.fill('pshenmic.dash')
    await box.press('Enter')

    await expect(page).toHaveURL(/q=pshenmic\.dash$/)
  })
})
