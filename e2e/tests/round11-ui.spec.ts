import type { Page } from '@playwright/test'
import { settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const TRANSFER = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const ASSET_LOCK = '2972859ef7fdc7a52397b7f844d69888414e22dcaa2be2b6e432a81c7b812cf6'
const COINBASE_BLOCK = '2570085'

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) <= 640

const barHeight = (page: Page) =>
  page.evaluate(
    () =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dh-bar-h')) || 0,
  )

async function expectJumpClearsHeader(page: Page, link: string, target: string, atTop = true) {
  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('link', { name: link })
    .click()
  await expect(page).toHaveURL(new RegExp(`#${target}$`))
  await page.waitForTimeout(300)
  const bar = await barHeight(page)
  const title = (await page.locator(`#${target} h2, #${target} summary`).first().boundingBox())!
  expect(title.y, `${link}: the section title sits below the sticky header`).toBeGreaterThanOrEqual(
    bar,
  )
  if (atTop) {
    expect(title.y, `${link}: and near the top of the screen`).toBeLessThan(bar + 80)
  }
}

test.describe('section index on the phone block and transaction pages', () => {
  test('a transaction page lists its sections under the header and jumps to each @IN-05', async ({
    page,
  }) => {
    await page.goto(`/tx/${ASSET_LOCK}`)
    const index = page.getByRole('navigation', { name: 'On this page' })
    if (!onPhone(page)) {
      await expect(page.locator('h1')).toBeVisible()
      await expect(index).toBeHidden()
      return
    }
    await settled(page)
    await expect(index.getByRole('link')).toHaveText([
      'Payload',
      'Value',
      'Settlement',
      'Inputs and outputs',
      'Raw data',
    ])
    const band = (await page.locator('.rx-band').boundingBox())!
    const box = (await index.boundingBox())!
    const firstSection = (await page.locator('.rx-sec').first().boundingBox())!
    expect(box.y, 'directly after the record header').toBeGreaterThanOrEqual(
      band.y + band.height - 1,
    )
    expect(box.y + box.height, 'before the first section').toBeLessThanOrEqual(firstSection.y + 1)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    for (const id of ['payload', 'flow', 'settlement', 'io', 'raw']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1)
    }
    expect(await index.evaluate((el) => getComputedStyle(el).position), 'not sticky').not.toBe(
      'sticky',
    )
    for (const [name, id] of [
      ['Value', 'flow'],
      ['Settlement', 'settlement'],
      ['Inputs and outputs', 'io'],
      ['Raw data', 'raw'],
    ] as const) {
      await expectJumpClearsHeader(page, name, id, id !== 'raw')
    }
  })

  test('a transaction without a payload has no Payload entry @IN-05', async ({ page }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto(`/tx/${TRANSFER}`)
    const index = page.getByRole('navigation', { name: 'On this page' })
    await expect(index.getByRole('link', { name: 'Value' })).toBeVisible()
    await expect(index.getByRole('link', { name: 'Payload' })).toHaveCount(0)
  })

  test('a block page lists its sections under the header and jumps to each @IN-03', async ({
    page,
  }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto(`/block/${COINBASE_BLOCK}`)
    await settled(page)
    const index = page.getByRole('navigation', { name: 'On this page' })
    await expect(index.getByRole('link')).toHaveText(['Header', 'Coinbase', 'Transactions'])
    for (const [name, id] of [
      ['Coinbase', 'coinbase'],
      ['Transactions', 'transactions'],
    ] as const) {
      await expectJumpClearsHeader(page, name, id)
    }
  })

  test('sections sit closer together on a phone and every source line stays visible @IN-03 @IN-05', async ({
    page,
  }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto(`/tx/${ASSET_LOCK}`)
    await settled(page)
    const sections = page.locator('.rx-sec')
    await expect(sections.first()).toBeVisible()
    expect(await sections.count()).toBeGreaterThanOrEqual(4)
    expect(
      await sections.first().evaluate((el) => parseFloat(getComputedStyle(el).marginBottom)),
    ).toBeLessThanOrEqual(28)
    for (let i = 0; i < (await sections.count()); i++) {
      await expect(sections.nth(i).locator('.rx-sources').first()).toBeVisible()
    }
  })
})

test.describe('Network internals has its own place in Core', () => {
  test('is in the Core rail, opens at /internals with its own heading and title @HY-12', async ({
    page,
  }) => {
    await page.goto('/blocks')
    const rail = page.locator('nav[data-section-nav="core"]')
    const link = rail.getByRole('link', { name: 'Network internals' })
    await link.scrollIntoViewIfNeeded()
    await link.click()
    await expect(page).toHaveURL(/\/internals$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Network internals' })).toBeVisible()
    await expect(page).toHaveTitle(/Network internals/)
    await expect(page.locator('[data-internals-chain]')).toContainText('Chain size')
    await expect(rail.getByRole('link', { name: 'Network internals' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('the old charts tab link redirects and keeps the other parameters @HY-12', async ({
    page,
  }) => {
    await page.goto('/charts?tab=internals&range=1w')
    await expect(page).toHaveURL(/\/internals\?range=1w$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Network internals' })).toBeVisible()
    await page.goto('/charts?tab=internals&network=testnet')
    await expect(page).toHaveURL(/\/internals\?network=testnet$/)
    await expect(page.locator('[data-internals-masternodes]')).toBeVisible()
  })

  test('the Status page links to the canonical URL and the palette finds the page @HY-12', async ({
    page,
  }) => {
    await page.goto('/status')
    await expect(page.getByRole('link', { name: /^Network internals: peers/ })).toHaveAttribute(
      'href',
      '/internals',
    )
    await page.keyboard.press('Control+k')
    const dialog = page.getByRole('dialog', { name: 'Search Radar' })
    for (const query of ['network', 'peers', 'utxo', 'versions']) {
      await dialog.getByRole('combobox').fill(query)
      await expect(
        dialog.getByRole('option', { name: /Network internals/ }),
        `typing ${query}`,
      ).toBeVisible()
    }
  })
})
