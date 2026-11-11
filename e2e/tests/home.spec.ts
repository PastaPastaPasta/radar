import { expectAccessible } from '../helpers/a11y'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

interface RadarFixtureWindow {
  __radarFixtures: { breakLiveConnection(): void; restoreLiveConnection(): void }
}

test.describe('Home', () => {
  test('shows the Core and Platform heights, the census and the node map state @IN-01 @HY-01', async ({
    page,
  }) => {
    await page.goto('/')
    const core = page.locator('[data-pulse="core"]')
    await expect(core).toContainText('2,570,085')
    await expect(core.locator('[data-source="dapi"]')).toBeVisible()
    await expect(page.locator('[data-pulse="platform"]')).toContainText(/Epoch \d+/)
    await expect(page.locator('[data-pulse="census"]')).toContainText(/of \d/)
    await expect(page.getByLabel('The node map is not loaded yet')).toBeVisible()
    await expectAccessible(page)
  })

  test('lists the latest Core blocks and pending transactions, each opening its page @HY-03 @IN-01', async ({
    page,
  }) => {
    await page.goto('/')
    const blocks = page.getByRole('table', { name: 'Latest Core blocks' })
    await expect(blocks.locator('a[href="/block/2570085"]').first()).toBeVisible()
    await expect(page.getByRole('table', { name: 'Pending transactions' })).toBeVisible()
    const link = blocks.locator('a[href="/block/2570085"]').first()
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/block\/2570085/)
  })

  test('shows height, difficulty, supply and size @HY-01', async ({ page }) => {
    await page.goto('/')
    const headline = page.locator('[data-headline]')
    await expect(headline).toContainText('Height')
    await expect(headline).toContainText('Difficulty')
    await expect(headline).toContainText('Circulating supply')
    await expect(headline).toContainText('Blockchain size')
  })

  test('opens a block from search by height @IN-10', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-palette-trigger]').first().click()
    await page.getByRole('combobox').fill('2570085')
    await page
      .getByRole('option', { name: /Core block 2,570,085/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/block\/2570085/)
  })

  test('says there is no match for nonsense @IN-10', async ({ page }) => {
    await page.goto('/search?q=hello+nobody')
    await expect(page.getByText(/No match|no results|Nothing found/i).first()).toBeVisible()
  })

  test('shows the current height and no stopped-updates notice while the connection is up @IN-15', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
    await expect(page.locator('[data-live-notice]')).toHaveCount(0)
    await expect(page.locator('[data-pulse="core"] [data-source="dapi"]')).toBeVisible()
  })

  test('says live updates stopped when the connection is cut, and clears once it is back @IN-15', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
    await expect(page.locator('[data-live-notice]')).toHaveCount(0)

    await page.evaluate(() =>
      (window as unknown as RadarFixtureWindow).__radarFixtures.breakLiveConnection(),
    )
    const notice = page.locator('[data-live-notice]')
    await expect(notice).toContainText('Live updates have stopped.')

    await notice.getByRole('button', { name: 'Try again' }).click()
    await expect(notice).toContainText('Live updates have stopped.')

    await page.evaluate(() =>
      (window as unknown as RadarFixtureWindow).__radarFixtures.restoreLiveConnection(),
    )
    await expect(notice).toHaveCount(0)
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/?network=testnet')
    await expect(page.locator('[data-pulse="core"]')).toContainText('1,589,232')
    await expect(page.locator('dashhq-bar')).toHaveAttribute('network', 'testnet')
  })

  test('keeps the tab bar below the content on a phone @HY-18', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.goto('/')
    const bar = page.locator('dashhq-bar')
    await expect(bar).toBeVisible()
    await page.getByRole('heading', { name: /Latest blocks/ }).scrollIntoViewIfNeeded()
    await expect(page.locator('[data-pulse="core"]')).toBeVisible()
  })
})
