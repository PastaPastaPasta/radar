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
    await expect(box).toHaveValue(PHRASE)
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
      ['abandon ability able about above', PARTIAL_NOTICE],
      ['"abandon", "ability", "able" about above', PARTIAL_NOTICE],
    ] as const) {
      await box.fill(input)
      await box.press('Enter')
      await expect(page.getByText(notice)).toBeVisible()
      await expect(box).toHaveValue(input)
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

  test('names made of recovery-phrase words are ordinary searches @X-01', async ({ page }) => {
    await page.goto('/search')
    const box = page.getByRole('searchbox', { name: 'Search Radar' })

    for (const text of ['Gold Coin Token', 'world cup ticket', 'abandon ability able about']) {
      await box.fill(text)
      await box.press('Enter')
      await expect(page).toHaveURL((url) => url.searchParams.get('q') === text)
      await expect(box).toHaveValue(text)
      await expect(page.getByText(PARTIAL_NOTICE)).toBeHidden()
    }
  })

  test('a hyphenated name is searched as a name, not held back as a phrase @X-01', async ({
    page,
  }) => {
    await page.goto('/search')
    const box = page.getByRole('searchbox', { name: 'Search Radar' })

    await box.fill('game-zone-arena.dash')
    await box.press('Enter')

    await expect(page).toHaveURL(/q=game-zone-arena\.dash$/)
    await expect(page.locator('[data-classified]')).toContainText(/a contract or token name/)
    await expect(page.getByText(PARTIAL_NOTICE)).toBeHidden()
  })

  test('the palette keeps a partial phrase in the box and out of the URL @X-01', async ({
    page,
  }) => {
    await page.goto('/status')
    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()
    await page.keyboard.press('/')
    const input = page.getByRole('dialog', { name: 'Search Radar' }).getByRole('combobox')

    await input.fill('abandon ability able about above')
    await input.press('Enter')

    await expect(page.getByText(/could be part of a recovery phrase/)).toBeVisible()
    await expect(input).toHaveValue('abandon ability able about above')
    expect(page.url()).not.toContain('abandon')
  })
})
