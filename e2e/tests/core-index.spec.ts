import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { expect, test } from '../helpers/test'

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const EMPTY_ADDRESS = 'XbKzysY6LYGbsGwNG8B7K1BRoA1ffLodAT'
const TESTNET_ADDRESS = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'
const PROPOSAL = '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c'
const TESTNET_PROPOSAL = '01934d6d5c25ade531176a0283148b3d6aeaef2c0b6d599552e43c2199d2f8cd'

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1)
}

const sourced = (page: Page) =>
  expect(page.locator('main [data-source="hyphen"]').first()).toBeVisible()

test.describe('address page', () => {
  test('summary, history, QR code and the live notice @IN-06 @HY-08', async ({ page }) => {
    await page.goto(`/address/${ADDRESS}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Address' })).toBeVisible()
    await expect(page.getByText(ADDRESS).first()).toBeVisible()

    const summary = page.locator('[data-address-summary]')
    await expect(summary).toContainText('Balance')
    await expect(summary).toContainText('Total received')
    await expect(summary).toContainText('Total sent')
    await expect(summary).toContainText(/DASH/)

    await expect(page.getByRole('table', { name: /Transactions/ })).toBeVisible()
    await expect(page.getByRole('img', { name: /QR code of the address/ })).toBeVisible()
    await expect(page.locator('[data-live]')).toBeVisible()
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('pages the history by cursor and keeps what is already shown @IN-06', async ({ page }) => {
    await page.goto(`/address/${ADDRESS}`)
    const table = page.getByRole('table', { name: /Transactions/ })
    await expect(table).toBeVisible()
    const before = await table.getByRole('row').count()
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect.poll(async () => table.getByRole('row').count()).toBeGreaterThan(before)
  })

  test('an address with no activity is empty, not an error @IN-06', async ({ page }) => {
    await page.goto(`/address/${EMPTY_ADDRESS}`)
    await expect(
      page.getByText('No transactions seen for this address on this network.'),
    ).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('says what is wrong with something that is not an address @IN-06', async ({ page }) => {
    await page.goto('/address/not-an-address')
    await expect(page.getByText('That isn’t a Dash address.')).toBeVisible()
  })

  test('works on testnet and offers testnet for a testnet address on mainnet @IN-16 @HY-19', async ({
    page,
  }) => {
    await page.goto(`/address/${TESTNET_ADDRESS}?network=testnet`)
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
    await expect(page.locator('[data-address-summary]')).toContainText(/tDASH/)
    await sourced(page)

    await page.goto(`/address/${TESTNET_ADDRESS}`)
    await expect(page.getByText('This is a testnet address.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open it on testnet' })).toHaveAttribute(
      'href',
      /network=testnet/,
    )
  })

  test('shows balances in the unit that was chosen @IN-12', async ({ page }) => {
    await page.goto('/settings')
    await page
      .getByRole('group', { name: 'Unit for DASH amounts' })
      .getByRole('button', { name: 'duffs', exact: true })
      .click()
    await page.goto(`/address/${ADDRESS}`)
    await expect(page.locator('[data-address-summary]')).toContainText(/duffs/)
  })

  test('copies the address and says so @IN-14', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/address/${ADDRESS}`)
    await page.getByRole('button', { name: /^Copy/ }).first().click()
    await expect(page.getByText(/Copied/).first()).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ADDRESS)
  })
})

test.describe('mempool', () => {
  test('summary and a pageable list of pending transactions @HY-06', async ({ page }) => {
    await page.goto('/mempool')
    await expect(page.getByRole('heading', { level: 1, name: 'Mempool' })).toBeVisible()
    await expect(page.getByRole('table', { name: /Pending transactions/ })).toBeVisible()
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/mempool?network=testnet')
    await expect(page.getByRole('heading', { level: 1, name: 'Mempool' })).toBeVisible()
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
  })
})

test.describe('rich list', () => {
  test('ranks balances and charts how concentrated they are @HY-09', async ({ page }) => {
    await page.goto('/rich-list')
    await expect(page.getByRole('heading', { level: 1, name: 'Rich list' })).toBeVisible()
    const table = page.getByRole('table', { name: /Addresses ranked by balance/ })
    await expect(table).toBeVisible()
    await expect(page.getByText('Supply concentration')).toBeVisible()
    const before = await table.getByRole('row').count()
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect.poll(async () => table.getByRole('row').count()).toBeGreaterThan(before)
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/rich-list?network=testnet')
    await expect(page.getByRole('table', { name: /Addresses ranked by balance/ })).toBeVisible()
  })
})

test.describe('charts', () => {
  test('hash rate and transactions with a range, each with a table beside it @HY-02', async ({
    page,
  }) => {
    await page.goto('/charts')
    await expect(page.getByRole('heading', { level: 1, name: 'Charts' })).toBeVisible()
    await expect(page.getByRole('table', { name: /Hash rate by block height/ })).toBeAttached()
    await expect(
      page.getByRole('table', { name: /Transactions processed by block height/ }),
    ).toBeAttached()

    const range = page.getByRole('group', { name: 'Range' })
    await range.getByRole('button', { name: '1 w' }).click()
    await expect(range.getByRole('button', { name: '1 w' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/range=1w/)
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/charts?network=testnet')
    await expect(page.getByRole('table', { name: /Hash rate by block height/ })).toBeAttached()
  })

  test('network internals: chain state, mempool pressure, versions and peers @HY-12', async ({
    page,
  }) => {
    await page.goto('/charts')
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Network internals' })
      .click()
    await expect(page).toHaveURL(/tab=internals/)
    await expect(page.locator('[data-internals-chain]')).toContainText('Chain size')
    await expect(page.getByText('Mempool pressure')).toBeVisible()
    await expect(page.getByText('Transaction velocity')).toBeVisible()
    await expect(page.locator('[data-internals-versions]')).toBeVisible()
    await expect(
      page.getByRole('table', { name: /Peers of the node Hyphen indexes from/ }),
    ).toBeVisible()
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })
})

test.describe('governance', () => {
  test('lists proposals, expands one, and links out to vote @HY-13', async ({ page }) => {
    await page.goto('/governance')
    await expect(page.getByRole('heading', { level: 1, name: 'Governance' })).toBeVisible()
    const row = page.getByRole('button', { name: 'DashDaoGrowthEngine' })
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    const vote = page
      .locator('[data-proposal-details]')
      .getByRole('link', { name: /Vote in Governance/ })
    await expect(vote).toHaveAttribute('href', `https://gov.dashhq.org/p/h/${PROPOSAL}`)
    await expect(vote).toHaveAttribute('rel', 'noopener noreferrer')
    await sourced(page)
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('the proposal page has the votes and the vote history @HY-13', async ({ page }) => {
    await page.goto(`/governance/${PROPOSAL}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Proposal' })).toBeVisible()
    await expect(page.locator('[data-votes]')).toBeVisible()
    await expect(
      page.getByRole('table', { name: /Masternode votes on this proposal/ }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      `https://gov.dashhq.org/p/h/${PROPOSAL}`,
    )
    await expectAccessible(page)
    await expectNoSideScroll(page)
  })

  test('testnet proposals link to the testnet Governance @IN-16 @HY-19', async ({ page }) => {
    await page.goto(`/governance/${TESTNET_PROPOSAL}?network=testnet`)
    await expect(page.getByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      /network=testnet/,
    )
  })

  test('says when no proposal has the hash @HY-13', async ({ page }) => {
    await page.goto(`/governance/${'0'.repeat(64)}`)
    await expect(page.getByText('No proposal with this hash on this network.')).toBeVisible()
  })
})

test.describe('phone layout', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 600, 'phone layout only')

  for (const path of [
    `/address/${ADDRESS}`,
    '/mempool',
    '/rich-list',
    '/charts',
    '/charts?tab=internals',
    '/governance',
    `/governance/${PROPOSAL}`,
  ]) {
    test(`${path} fits the screen and its tables scroll inside themselves @HY-18`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await expectNoSideScroll(page)
    })
  }
})

test.describe('search suggestions from Hyphen', () => {
  test('an address in the search box gets a hit that says its balance and transactions @HY-14', async ({
    page,
  }) => {
    await page.goto(`/search?q=${ADDRESS}`)
    const hit = page.getByRole('link', { name: new RegExp(`${ADDRESS}.*189 transactions`) })
    await expect(hit).toBeVisible()
  })

  test('a name is looked up in Hyphen too @HY-14', async ({ page }) => {
    await page.goto('/search?q=DashDaoGrowthEngine')
    await expect(page.getByRole('link', { name: /DashDaoGrowthEngine/ }).first()).toBeVisible()
  })
})
