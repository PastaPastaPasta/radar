import type { Page, TestInfo } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { netIds } from '../routes/fixtures'
import { CLAIM } from '../routes/claims'

const isPhone = (info: TestInfo) => info.project.name.startsWith('phone')
const MAINNET = netIds('mainnet')
const REGULAR = MAINNET.id('mn_regular', '0'.repeat(64))

const h1 = (page: Page) => page.getByRole('heading', { level: 1 })
const cities = (page: Page) => page.getByRole('list', { name: 'Cities, largest first' })
const bars = (page: Page) => page.locator('[data-map-bars]')

/** Opens the map and waits for its claim, its land and its list of cities. */
async function openMap(page: Page, query = '') {
  await page.goto(`/map${query}`)
  await expect(h1(page)).toHaveText(CLAIM.map, { timeout: 30_000 })
  await expect(page.locator('[data-map-view][data-ready]')).toBeAttached({ timeout: 30_000 })
  await settled(page)
}

test.describe('The map', () => {
  test('answers how concentrated the network is in its claim, its map and its list of cities @RA-50', async ({
    page,
  }, info) => {
    await openMap(page)
    await expect(h1(page)).toHaveText('Half of the 130 masternodes run in 2 cities')
    await expect(page.locator('.rx-page__lede')).toHaveText(
      '60% of them run in one country, Germany. Half run with 3 hosting providers.',
    )
    const rows = cities(page).getByRole('button')
    await expect(rows.nth(0)).toContainText('Falkenstein')
    await expect(rows.nth(0)).toContainText('49')
    await expect(rows.nth(1)).toContainText('Frankfurt am Main')
    await expect(page.locator('[data-half-line]')).toHaveCount(1)
    await expect(page.locator('.rx-pmap__disc[data-place]').first()).toBeVisible()
    await expect(page.locator('.rx-pmap__labels text').first()).toBeVisible()
    await expect(page.locator('[data-left-out]')).toContainText(
      '20 PoSe-banned masternodes are not counted',
    )
    // the map and the start of the list are on the first screen
    const map = (await page.locator('[data-map-view]').boundingBox())!
    expect(map.y, 'the map starts on the first screen').toBeLessThan(page.viewportSize()!.height)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    if (!isPhone(info)) {
      const list = (await cities(page).boundingBox())!
      expect(list.x, 'the list sits beside the map').toBeGreaterThan(map.x + map.width)
      expect(list.y, 'the list starts on the first screen').toBeLessThan(
        page.viewportSize()!.height,
      )
    }
    await expectAccessible(page)
  })

  test('picks a city from the list or the map, and keeps it in the address @RA-50 @RA-52', async ({
    page,
  }) => {
    await openMap(page)
    await cities(page).getByRole('button').nth(0).click()
    await expect(page).toHaveURL(/place=DE%3AFalkenstein|place=DE:Falkenstein/)
    const card = page.locator('[data-place-card]')
    await expect(card).toContainText('49 masternodes')
    await expect(card).toContainText('Hetzner Online GmbH')
    await expect(page.locator('[data-selected]')).toBeAttached()
    await page.reload()
    await expect(page.locator('[data-place-card]')).toContainText('Falkenstein', {
      timeout: 30_000,
    })
    await card.getByRole('button', { name: 'Close' }).click()
    await expect(page).not.toHaveURL(/place=/)
    await page.locator('.rx-pmap__disc[data-place="DE:Falkenstein"]').dispatchEvent('click')
    await expect(card).toContainText('Falkenstein')
    const list = card.getByRole('link', { name: 'Open them in the masternode list' })
    await expect(list).toHaveAttribute('href', /\/masternodes\?.*country=DE/)
    await list.click()
    await expect(page).toHaveURL(/\/masternodes\?.*q=Falkenstein/)
  })

  test('narrows to a country or a provider from the share bars, and filters by text @RA-51', async ({
    page,
  }) => {
    await openMap(page)
    await bars(page)
      .getByRole('button', { name: /Germany/ })
      .click()
    await expect(page).toHaveURL(/country=DE/)
    await expect(h1(page)).toHaveText(/^\d+% of these 78 masternodes run in one city, Falkenstein/)
    await page.getByRole('button', { name: 'Remove the filter Country: Germany' }).click()
    await expect(page).not.toHaveURL(/country=/)
    await bars(page)
      .getByRole('button', { name: /Hetzner Online GmbH/ })
      .click()
    await expect(page).toHaveURL(/host=/)
    await page.getByRole('button', { name: /Remove the filter Hosting/ }).click()
    await page.getByRole('searchbox', { name: 'Filter masternodes' }).fill('zzzz-nothing')
    await expect(page.getByText('No masternode matches these filters.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear the filters' }).click()
    await expect(h1(page)).toHaveText('Half of the 130 masternodes run in 2 cities')
  })

  test('counts evonodes or every reachable node instead @RA-51', async ({ page }) => {
    await openMap(page)
    await page.getByRole('button', { name: 'Evonodes', exact: true }).click()
    await expect(page).toHaveURL(/type=evo/)
    await expect(h1(page)).toHaveText(/of the 12 evonodes run in/)
    await page.getByRole('button', { name: 'All reachable nodes' }).click()
    await expect(page).toHaveURL(/layer=nodes/)
    await expect(h1(page)).toHaveText(/reachable nodes run in/)
    await expect(page.locator('[data-left-out]')).toContainText('on Tor or I2P')
    await expect(page.getByRole('searchbox')).toHaveCount(0)
  })

  test('turns an old map link into the filter it meant @RA-52', async ({ page }) => {
    await page.goto('/map?color=reach&hide=unreachable,unchecked&country=DE')
    await expect(page).toHaveURL(/reach=reachable/)
    await expect(page).not.toHaveURL(/hide=|color=/)
    await expect(
      page.getByRole('button', { name: 'Remove the filter Answered the crawl' }),
    ).toBeVisible()
  })

  test('opens the masternode in the address, rings its city and leaves the map on Back @RA-52', async ({
    page,
  }) => {
    await page.goto('/masternodes')
    await openMap(page, `?protx=${REGULAR}`)
    const card = page.locator(`[data-map-card="${REGULAR}"]`)
    await expect(card).toBeVisible()
    await expect(card).toContainText('146.190.33.135:9999')
    await expect(page.locator('[data-map-node]')).toContainText(/It shares|It is the only/)
    await expect(page.locator('[data-marked]')).toBeAttached()
    await page.getByRole('button', { name: 'Evonodes', exact: true }).click()
    await page.goBack()
    await expect(page).not.toHaveURL(/\/map/)
  })

  test('fits a phone: one column, no sheet and no sideways scroll @RA-52', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'phone only')
    await openMap(page)
    const vw = page.viewportSize()!.width
    const map = (await page.locator('[data-map-view]').boundingBox())!
    const list = (await cities(page).boundingBox())!
    expect(map.width, 'the map takes the column').toBeGreaterThan(vw - 40)
    expect(list.y, 'the list follows the map').toBeGreaterThan(map.y + map.height)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'Europe' }).click()
    await expect(page).toHaveURL(/region=europe/)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('asks nothing hosted in Decentralized only mode: the land is drawn and it says once that the crawl is needed @RA-50', async ({
    page,
  }) => {
    await page.goto('/map?sources=decentralized')
    await expect(h1(page)).toHaveText('Map')
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(page.locator('[data-map-view][data-ready]')).toBeAttached({ timeout: 30_000 })
    await expect(page.locator('.rx-pmap__disc[data-place]')).toHaveCount(0)
    await expect(page.locator('[data-places]')).toHaveCount(0)
  })
})
