import { expectAccessible } from '../helpers/a11y'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

interface RadarFixtureWindow {
  __radarFixtures: { breakLiveConnection(): void; restoreLiveConnection(): void }
}

test.describe('Home', () => {
  test('shows the Core and Platform heights, the census and the node map @IN-01 @HY-01', async ({
    page,
  }) => {
    await page.goto('/')
    const core = page.locator('[data-pulse="core"]')
    await expect(core).toContainText('2,570,085')
    await expect(core.locator('[data-source="dapi"]')).toBeVisible()
    await expect(page.locator('[data-pulse="platform"]')).toContainText(/Epoch \d+/)
    await expect(page.locator('[data-pulse="census"]')).toContainText(/of \d/)
    const map = page.locator('[data-map="nodes"]')
    await expect(map.locator('circle.mn').first()).toBeVisible()
    await expect(map.locator('.rx-callout')).toContainText('masternodes')
    await expect(page.getByText(/not loaded yet|Arrives with the network pages/)).toHaveCount(0)
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

  test('keeps the Core height and ChainLock in the header while scrolling @IN-15', async ({
    page,
  }) => {
    await page.goto('/')
    const tip = page.locator('[data-header-tip]')
    await expect(tip).toContainText('2,570,085')
    await expect(tip.locator('.rx-hdrtip__lock')).toBeVisible()
    await page.getByRole('heading', { name: 'Dash Core' }).scrollIntoViewIfNeeded()
    await expect(tip).toBeInViewport()
    await expect(tip).toContainText('2,570,085')
    await page.goto('/status')
    await expect(page.locator('[data-header-tip]')).toContainText('2,570,085')
  })

  test('qualifies Live as soon as the browser goes offline, and recovers @IN-15', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
    const word = page.locator('[data-live-word]')
    const tip = page.locator('[data-header-tip]')
    await expect(word).toHaveText('Live')
    await expect(tip).toHaveAttribute('data-connection', 'live')

    await context.setOffline(true)
    await expect(word).toHaveText(/^Stopped since \d\d:\d\d$/)
    await expect(tip).toHaveAttribute('data-connection', 'stopped')
    await expect(tip).toContainText('Stopped since')
    await expect(page.locator('.rx-lanes .rx-live')).toContainText('Stopped since')

    await context.setOffline(false)
    await expect(word).toHaveText('Live')
    await expect(tip).toHaveAttribute('data-connection', 'live')
    await expect(page.locator('.rx-lanes .rx-live')).toContainText('Live')
  })

  test('does not say Live while the live connection is cut @IN-15', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
    await expect(page.locator('[data-live-word]')).toHaveText('Live')
    await page.evaluate(() =>
      (window as unknown as RadarFixtureWindow).__radarFixtures.breakLiveConnection(),
    )
    await expect(page.locator('[data-live-word]')).not.toHaveText('Live')
    await expect(page.locator('[data-header-tip]')).toHaveAttribute(
      'data-connection',
      /reconnecting|polling|stopped/,
    )
    await page.evaluate(() =>
      (window as unknown as RadarFixtureWindow).__radarFixtures.restoreLiveConnection(),
    )
    await expect(page.locator('[data-live-word]')).toHaveText('Live')
  })

  test('fits the circulating supply and its USD companion inside the card at every width @HY-01', async ({
    page,
  }) => {
    for (const width of [1440, 1180, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const supply = page
        .locator('[data-headline] .rx-stat')
        .filter({ hasText: 'Circulating supply' })
      await expect(supply.locator('.rx-fiat')).toBeVisible()
      const fits = await supply.evaluate((card) => {
        const box = card.getBoundingClientRect()
        return [...card.querySelectorAll('.rx-stat__value, .rx-amt, .rx-fiat')].every((el) => {
          const r = el.getBoundingClientRect()
          return r.left >= box.left - 0.5 && r.right <= box.right + 0.5
        })
      })
      expect(fits, `supply card at ${width}px`).toBe(true)
    }
  })

  test('shows one source badge per source across the headline figures @IN-09', async ({ page }) => {
    await page.goto('/')
    const headline = page.locator('[data-headline]')
    await expect(headline.locator('[data-source="hyphen"]')).toHaveCount(1)
    await expect(headline.locator('[data-source="dapi"]')).toHaveCount(1)
    await expect(headline.locator('.rx-stat')).toHaveCount(4)
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
