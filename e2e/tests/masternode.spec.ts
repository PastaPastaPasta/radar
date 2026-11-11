import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const MAINNET = {
  regular: '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32',
  regularIp: '85.209.241.228',
  evo: 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff',
}
const TESTNET = {
  regular: '51238bb9e2b68fc822e8eb15d415e97ebc86f769a72c15e0a6e25d9ea8d38475',
  regularIp: '62.60.244.174',
}
const MISSING = '0'.repeat(64)

test.describe('masternode page', () => {
  test('shows state at a glance and the registration from Radar’s crawl @RA-30 @RA-31', async ({
    page,
  }) => {
    await page.goto(`/mn/${MAINNET.regular}`)
    const header = page.locator('[data-masternode-header]')
    await expect(header).toBeVisible()
    await settled(page)

    await expect(header).toContainText('Regular masternode')
    await expect(header).toContainText('85.209.241.228')
    await expect(header).toContainText('Enabled, no PoSe penalty')
    await expect(header).toContainText('24.0.0')
    const kpis = page.locator('[data-masternode-kpis]')
    for (const label of [
      'Uptime, 30 days',
      'Last paid',
      'Earned on Core, 90 days',
      'PoSe penalty',
    ]) {
      await expect(kpis).toContainText(label)
    }

    const registration = page.locator('#registration')
    for (const label of ['Payout', 'Owner', 'Voting', 'Operator key', 'Collateral', 'PoSe']) {
      await expect(registration).toContainText(label)
    }
    await expect(
      registration.locator('a[href="/address/Xt77nU5qc5wquYng2om1fRSHsnmUB3WL1Z"]'),
    ).toBeVisible()
    for (const id of ['uptime', 'payments', 'registration', 'location']) {
      await expect(page.locator(`#${id} [data-source="radar"]`).first()).toBeVisible()
    }
    await expect(page.getByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      'https://gov.dashhq.org/masternodes',
    )
  })

  test('lists payments and draws the uptime strip with no error @RA-30', async ({ page }) => {
    await page.goto(`/mn/${MAINNET.regular}`)
    await settled(page)

    await expect(page.locator('[data-uptime-strip] i').first()).toBeVisible()
    const table = page.getByRole('table', { name: 'Recent payments to this masternode' })
    await expect(table).toBeVisible()
    expect(await table.getByRole('row').count()).toBeGreaterThan(5)
    await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
  })

  test('shows an evonode’s Platform endpoint health @RA-40', async ({ page }) => {
    await page.goto(`/mn/${MAINNET.evo}`)
    const card = page.locator('#platform')
    await expect(card).toBeVisible()
    await settled(page)

    for (const text of ['TLS certificate', 'Platform height', 'DAPI 5.0.3', 'Daily health']) {
      await expect(card).toContainText(text)
    }
    await expect(page.locator('[data-masternode-header]')).toContainText('Evonode')
  })

  test('works on testnet, with testnet Governance @HY-19', async ({ page }) => {
    await page.goto(`/mn/${TESTNET.regular}?network=testnet`)
    await expect(page.locator('[data-masternode-header]')).toContainText('Regular masternode')
    await settled(page)

    await expect(page.getByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      'https://gov.dashhq.org/masternodes?network=testnet',
    )
  })

  test('takes a testnet ProTx opened on mainnet to testnet @RA-41', async ({ page }) => {
    await page.goto(`/mn/${TESTNET.regular}`)
    await expect(page.getByText('This masternode is on testnet.')).toBeVisible()

    await page.getByRole('link', { name: 'Open it on testnet' }).click()

    await expect(page).toHaveURL(new RegExp(`/mn/${TESTNET.regular}\\?network=testnet$`))
    await expect(page.locator('[data-masternode-header]')).toContainText('Regular masternode')
  })

  test('offers search for a ProTx nobody lists @RA-41', async ({ page }) => {
    await page.goto(`/mn/${MISSING}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Masternode' })).toBeVisible()
    await expect(page.getByText('No masternode with this ProTx on mainnet.')).toBeVisible()

    await page.locator('[data-search-offer]').click()

    await expect(page).toHaveURL(/\/search/)
  })

  test('fits the width and has no serious accessibility violations @RA-30 @X-08', async ({
    page,
  }) => {
    await page.goto(`/mn/${MAINNET.evo}`)
    await expect(page.locator('#platform')).toBeVisible()
    await settled(page)

    expect(await horizontalOverflow(page), 'sideways overflow in px').toBeLessThanOrEqual(0)
    await expectAccessible(page)
  })
})

test.describe('search leads somewhere real', () => {
  async function openPalette(page: Page, path = '/') {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.keyboard.press('/')
    const dialog = page.getByRole('dialog', { name: 'Search Radar' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('a masternode suggestion opens its page, by keyboard @HY-14', async ({ page }) => {
    const dialog = await openPalette(page)

    await dialog.getByRole('combobox').fill(MAINNET.regularIp)
    await expect(
      dialog.getByRole('option', { name: /Masternode 85\.209\.241\.228:9999/ }),
    ).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/mn/${MAINNET.regular}$`))
    await expect(page.locator('[data-masternode-header]')).toContainText('85.209.241.228')
    await expect(page.getByText('This page is on its way')).toHaveCount(0)
  })

  test('a testnet masternode suggestion opens its page on testnet @HY-14 @HY-19', async ({
    page,
  }) => {
    const dialog = await openPalette(page, '/status?network=testnet')

    await dialog.getByRole('combobox').fill(TESTNET.regularIp)
    await dialog.getByRole('option', { name: /Masternode 62\.60\.244\.174/ }).click()

    await expect(page).toHaveURL(new RegExp(`/mn/[0-9a-f]{64}\\?network=testnet$`))
    await expect(page.locator('[data-masternode-header]')).toBeVisible()
  })

  test('an address no masternode uses suggests nothing rather than a list page @HY-14', async ({
    page,
  }) => {
    const dialog = await openPalette(page)

    await dialog.getByRole('combobox').fill('203.0.113.9')

    await expect(dialog.getByText(/Looks like an IP address/)).toBeVisible()
    await expect(dialog.getByRole('option', { name: /Masternode/ })).toHaveCount(0)
  })

  test('the palette lists only pages that are built @HY-14', async ({ page }) => {
    const dialog = await openPalette(page)

    await expect(dialog.getByRole('option', { name: /Blocks/ })).toBeVisible()
    await expect(dialog.getByRole('option', { name: /Masternodes|Platform$|Nodes/ })).toHaveCount(0)
  })
})
