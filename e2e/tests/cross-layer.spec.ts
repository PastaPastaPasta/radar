import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { networkQuery, withQuery } from '../routes'
import { netIds } from '../routes/fixtures'

/**
 * Follows each cross-layer link (X-02) from the page that offers it to the page it names, on both networks, with the
 * recorded data: the click lands on the right kind of page, about the record the link named.
 */
for (const net of ['mainnet', 'testnet'] as const) {
  const ids = netIds(net)
  const at = (path: string) => withQuery(path, networkQuery(net))

  test.describe(`links between layers on ${net}`, () => {
    test('an asset-lock transaction that topped an identity up says so and funds no new identity @X-02', async ({
      page,
    }) => {
      test.skip(net !== 'mainnet', 'the testnet transaction has no DAPI recording')
      await page.goto(at(`/tx/${ids.id('tx_assetlock', '')}`))
      await settled(page)
      const row = page
        .locator('dt', { hasText: 'Identity created' })
        .locator('xpath=following-sibling::dd[1]')
      await expect(row).toBeVisible({ timeout: 15_000 })
      await expect(row).toContainText('A top-up credits an identity that already existed')
      await expect(row.locator('a[href^="/identity/"]')).toHaveCount(0)
    })

    test('a masternode opens its Platform validator record and the list chip opens the same tab @X-02', async ({
      page,
    }) => {
      const protx = ids.id('mn_evo', '')
      await page.goto(at(`/mn/${protx}`))
      await settled(page)
      await page.locator('.rx-tabbar').getByRole('link', { name: 'Platform', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/mn/${protx}.*tab=platform`))
      await settled(page)
      await expect(page.locator('#platform-rewards')).toBeVisible()
      await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)

      await page.goto(at('/masternodes?type=evo'))
      await settled(page)
      await expect(page.locator('[data-entity="evonode"] a').first()).toHaveAttribute(
        'href',
        /\/mn\/[0-9a-f]{64}\?(.*&)?tab=platform/,
      )
    })
  })

  // The destinations of these links were not recorded: the click must still land on the page the link names.
  test.describe(`links to unrecorded pages on ${net}`, () => {
    test.use({ allowFixtureMisses: true })

    test('an asset-unlock transaction opens the withdrawals on Platform @X-02', async ({
      page,
    }) => {
      test.skip(net !== 'mainnet', 'the testnet transaction has no DAPI recording')
      await page.goto(at(`/tx/${ids.id('tx_assetunlock', '')}`))
      await settled(page)
      await page.getByRole('link', { name: 'Withdrawals on Platform' }).click()
      await expect(page).toHaveURL(/\/platform\/txs\?.*type=/)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })

    test('a masternode payout address opens the address page @X-02', async ({ page }) => {
      await page.goto(at(`/mn/${ids.id('mn_regular', '')}`))
      await settled(page)
      const chip = page.locator('[data-entity="address"] a').first()
      await expect(chip).toBeVisible({ timeout: 15_000 })
      await chip.click()
      await expect(page).toHaveURL(/\/address\/[1-9A-HJ-NP-Za-km-z]{26,}/)
      await expect(page.getByRole('heading', { level: 1, name: 'Address' })).toBeVisible()
    })

    test('a Platform block opens the Core block that locked it @X-02', async ({ page }) => {
      await page.goto(at(`/platform/block/${ids.id('pblock', '')}`))
      await settled(page)
      const chip = page.locator('[data-entity="block"] a').first()
      await expect(chip).toBeVisible({ timeout: 15_000 })
      await chip.click()
      await expect(page).toHaveURL(/\/block\/(\d+|[0-9a-f]{64})/)
      await expect(
        page.getByRole('heading', { level: 1 }).or(page.getByRole('alert')).first(),
      ).toBeVisible()
    })
  })
}
