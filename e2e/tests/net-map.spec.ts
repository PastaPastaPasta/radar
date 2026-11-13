import type { Page, TestInfo } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { netIds } from '../routes/fixtures'

const isPhone = (info: TestInfo) => info.project.name.startsWith('phone')
const MAINNET = netIds('mainnet')
const REGULAR = MAINNET.id('mn_regular', '0'.repeat(64))

const headline = (page: Page) => page.locator('[data-map-headline]')
const chips = (page: Page) => page.getByRole('group', { name: 'Show or hide categories' })
const panel = (page: Page) => page.locator('[data-map-panel]')

/** Opens the map and waits for the masternode list to have drawn the headline. On a phone the controls sit in the sheet. */
async function openMap(page: Page, query = '') {
  await page.goto(`/map${query}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Map' })).toBeVisible()
  await expect(page.locator('[data-map-view][data-ready]')).toBeAttached({ timeout: 30_000 })
  await expect(headline(page)).toContainText(/answered the latest crawl|reachable nodes in/, {
    timeout: 30_000,
  })
  await settled(page)
}

/** On a phone the chips and selects are in the sheet's body, out of sight until it opens. */
async function openControls(page: Page, info: TestInfo) {
  if (isPhone(info)) {
    await page.getByRole('button', { name: 'Filters' }).click()
    await expect(panel(page)).toHaveAttribute('data-mode', 'open')
  }
}

test.describe('The map', () => {
  test('draws the masternodes as clusters coloured by reachability and counts them in the headline @RA-50', async ({
    page,
  }, info) => {
    await openMap(page)
    await expect(headline(page)).toContainText('134 of 150 masternodes answered the latest crawl')
    await expect(headline(page)).toContainText('130 enabled')
    await expect(page.locator('.rx-map-canvas canvas')).toHaveAttribute('aria-label', /Map of/)
    await expect(page.locator('.rx-map-donut').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-map-clusters] li').first()).toContainText(/masternodes?:/)
    await openControls(page, info)
    await expect(panel(page)).toContainText('6 masternodes are not on the map')
    await expect(chips(page).getByRole('button', { name: /Reachable/ })).toContainText('134')
    await expect(chips(page).getByRole('button', { name: /Unreachable/ })).toContainText('10')
    await expectAccessible(page)
  })

  test('colours by PoSe, version or type and the chips follow @RA-50', async ({ page }, info) => {
    await openMap(page)
    await openControls(page, info)
    await page.getByRole('button', { name: 'PoSe', exact: true }).click()
    await expect(chips(page).getByRole('button', { name: /PoSe-banned/ })).toContainText('20')
    await page.getByRole('button', { name: 'Version', exact: true }).click()
    await expect(page).toHaveURL(/color=version/)
    await expect(chips(page).getByRole('button', { name: /24\.0\.0/ })).toContainText('121')
    await expect(chips(page).getByRole('button', { name: /Unknown version/ })).toContainText('16')
    await page.getByRole('button', { name: 'Type', exact: true }).click()
    await expect(chips(page).getByRole('button', { name: /Evonodes/ })).toBeVisible()
  })

  test('zooms into a cluster when it is clicked @RA-50', async ({ page }) => {
    await openMap(page)
    const map = page.locator('[data-map-view]')
    const donut = page.locator('.rx-map-donut').first()
    await expect(donut).toBeVisible({ timeout: 30_000 })
    const before = Number(await map.getAttribute('data-zoom'))
    await donut.dispatchEvent('click')
    await expect
      .poll(async () => Number(await map.getAttribute('data-zoom')), { timeout: 15_000 })
      .toBeGreaterThan(before)
  })

  test('opens a masternode popup that links to its page @RA-50', async ({ page }, info) => {
    await openMap(page, `?protx=${REGULAR}`)
    const card = page.locator(`[data-map-card="${REGULAR}"]`)
    await expect(card).toBeVisible({ timeout: 30_000 })
    if (!isPhone(info)) await expect(page.locator('.rx-map-popup')).toContainText('Uptime, 7 days')
    else await expect(page.locator('[data-map-node]')).toContainText('Close')
    await expect(card).toContainText('146.190.33.135:9999')
    await card.getByRole('link', { name: 'Open masternode' }).click()
    await expect(page).toHaveURL(new RegExp(`/mn/${REGULAR}`))
  })

  test('shows every city of the all-nodes layer as masternodes against full nodes, with no addresses @RA-50', async ({
    page,
  }, info) => {
    await openMap(page, '?layer=nodes&color=version')
    await expect(headline(page)).toContainText(/reachable nodes in 198 places/)
    await expect(panel(page)).toContainText(/no location, so they are not drawn/)
    await openControls(page, info)
    await expect(page.locator('[data-static-chips]')).toContainText('Other full nodes')
    await expect(page.getByLabel('Country')).toHaveCount(0)
    await expect(page.locator('[data-map-view]')).toBeAttached()
    await expect(page.locator('.rx-map-donut').first()).toContainText(/\d/, { timeout: 30_000 })
  })

  test('filters by search, type, country and hosting, hides categories and opens the result as a list @RA-51', async ({
    page,
  }, info) => {
    await openMap(page)
    await openControls(page, info)
    await chips(page)
      .getByRole('button', { name: /Unreachable/ })
      .click()
    await chips(page)
      .getByRole('button', { name: /Not checked/ })
      .click()
    await expect(page).toHaveURL(/hide=/)
    await expect(chips(page).getByRole('button', { name: /Unreachable/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(
      page.getByLabel('Country').locator('option', { hasText: 'Germany (DE) · 78' }),
    ).toHaveCount(1)
    await page.getByLabel('Country').selectOption('DE')
    await expect(page).toHaveURL(/country=DE/)
    await expect(headline(page)).toContainText(/of 78 masternodes answered/)
    const hosting = page.getByLabel('Hosting')
    await expect(hosting.locator('option', { hasText: 'Hetzner' }).first()).toBeAttached()
    await page.getByLabel('Version').selectOption({ index: 1 })
    await page.getByLabel('Version').selectOption('')
    await page.getByRole('searchbox', { name: 'Search masternodes' }).fill('zzzz-nothing')
    await expect(headline(page)).toContainText('0 of 0 masternodes')
    await page.getByRole('searchbox', { name: 'Search masternodes' }).fill('')
    await expect(headline(page)).toContainText(/of \d+ masternodes answered/)
    const list = page.getByRole('link', { name: 'Open these as a list' })
    await expect(list).toHaveAttribute('href', /\/masternodes\?.*country=DE/)
    await expect(list).toHaveAttribute('href', /reach=reachable/)
    await list.click()
    await expect(page).toHaveURL(/\/masternodes\?.*country=DE/)
    await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()
  })

  test('keeps the layer, colour, filters, hidden categories and focused masternode in the address through a reload @RA-52', async ({
    page,
  }, info) => {
    await openMap(page, `?color=version&country=US&hide=other&protx=${REGULAR}`)
    await expect(page.locator(`[data-map-card="${REGULAR}"]`)).toBeVisible({ timeout: 30_000 })
    await page.reload()
    await expect(page.locator(`[data-map-card="${REGULAR}"]`)).toBeVisible({ timeout: 30_000 })
    await expect(page).toHaveURL(/color=version/)
    await expect(page).toHaveURL(/country=US/)
    await expect(page).toHaveURL(/hide=other/)
    await expect(page).toHaveURL(new RegExp(`protx=${REGULAR}`))
    if (!isPhone(info)) {
      await expect(page.getByLabel('Country')).toHaveValue('US')
      await expect(page.getByRole('button', { name: 'Version', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
    await page.goBack()
    await expect(page).not.toHaveURL(/\/map/)
  })

  test('moves the controls into a bottom sheet on a phone that drags and closes with Esc, clear of the tab bar @RA-52', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'phone only')
    await openMap(page)
    const sheet = panel(page)
    await expect(sheet).toHaveAttribute('data-snap', 'collapsed')
    const box = async () => (await sheet.boundingBox())!
    const tabs = await page.evaluate(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--dh-tabs-h')
      return parseFloat(v) || 57
    })
    const clear = async () => {
      const room = (await page.locator('[data-map-root]').boundingBox())!
      expect(room.y + room.height, 'the map ends above the tab bar').toBeLessThanOrEqual(
        page.viewportSize()!.height - tabs + 1,
      )
      const b = await box()
      expect(b.y, 'the sheet starts inside the map').toBeGreaterThanOrEqual(room.y - 1)
      expect(b.y, 'the sheet starts above the map bottom').toBeLessThan(room.y + room.height)
    }
    await clear()
    const handle = page.locator('.rx-map-handle')
    await handle.click()
    await expect(sheet).toHaveAttribute('data-mode', 'open')
    await expect(sheet).not.toHaveAttribute('data-snap', 'collapsed')
    await clear()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveAttribute('data-mode', 'peek')
    await expect(sheet).toHaveAttribute('data-snap', 'collapsed')

    const h = (await handle.boundingBox())!
    const x = h.x + h.width / 2
    const y = h.y + h.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y - i * 30)
    await page.mouse.up()
    await expect(sheet).not.toHaveAttribute('data-snap', 'collapsed')
    await expect(sheet).toHaveAttribute('data-mode', 'open')
    await clear()
    expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)
  })

  test('stops the selection pings and the sheet and map transitions under reduced motion @RA-52 @RA-92', async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openMap(page, `?protx=${REGULAR}`)
    const mark = page.locator('[data-selected]')
    await expect(mark).toBeAttached({ timeout: 30_000 })
    await expect(mark.locator('i').first()).toHaveCSS('display', 'none')
    await expect(mark.locator('b')).toBeVisible()
    if (isPhone(info)) await expect(panel(page)).toHaveCSS('transition-duration', '0s')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(mark.locator('i').first()).toHaveCSS('animation-name', 'rx-map-ping')
  })

  test('asks nothing hosted in Decentralized only mode: the land is drawn and it says once that the crawl is needed @RA-50', async ({
    page,
  }) => {
    await page.goto('/map?sources=decentralized')
    await expect(page.getByRole('heading', { level: 1, name: 'Map' })).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(page.locator('[data-map-view][data-ready]')).toBeAttached({ timeout: 30_000 })
    await expect(panel(page)).toHaveCount(0)
    await expect(page.locator('.rx-map-donut')).toHaveCount(0)
  })
})
