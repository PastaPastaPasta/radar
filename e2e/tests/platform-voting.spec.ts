import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { pinClockToFixtures } from '../helpers/clock'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const MODE = '[data-unavailable="mode"]'
const REZA_WINNER = 'CUaJuBYgwXBCLarN2Gfnnve7SvaM8zvqiQ5PEUztHh4H'
const VOTER = '2NFNNTUFvJVQimFbiRjJ67bXKZhiGBgxxwHKz5KFM9B5'
const ONLY = 'sources=decentralized'

const NAMES = {
  registered: 'pshenmic',
  contested: 'reza',
  available: 'radarfx44661899',
  testnetContest: 'bdfh',
} as const

async function open(page: Page, url: string, h1: string): Promise<void> {
  await pinClockToFixtures(page)
  await page.goto(url)
  await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible()
  await settled(page)
}

const onlyUrl = (path: string) => `${path}${path.includes('?') ? '&' : '?'}${ONLY}`
const rows = (page: Page, card: string) => page.locator(`#${card} tbody tr`)

test.describe('Names', () => {
  test('lists registered names alphabetically and pages forward and back @NX-41', async ({
    page,
  }) => {
    await open(page, '/names', 'Names')
    const list = page.locator('#names-list')
    await expect(list.locator('a[href^="/name/"]').first()).toBeVisible()
    const first = await list.locator('a[href^="/name/"]').first().textContent()
    await page.getByRole('link', { name: 'Older' }).click()
    await expect(page).toHaveURL(/after=/)
    await settled(page)
    await expect(list.locator('a[href^="/name/"]').first()).not.toHaveText(first ?? '')
    await page.getByRole('link', { name: 'Newer' }).click()
    await expect(page).not.toHaveURL(/after=/)
    await settled(page)
    await expect(list.locator('a[href^="/name/"]').first()).toHaveText(first ?? '')
    await expectAccessible(page)
  })

  test('searches by the homograph-safe form and shows it @NX-41', async ({ page }) => {
    await open(page, '/names?q=ali', 'Names')
    await expect(page.locator('[data-searched]')).toContainText('a11')
    await expect(page.locator('#names-list')).toContainText('Alice.dash')
    await open(page, '/names?q=bob', 'Names')
    await expect(page.locator('[data-searched]')).toContainText('b0b')
    await expect(page.locator('#names-list a[href^="/name/"]').first()).toHaveText(/^b[o0]b/i)
  })

  test('searches from the form and keeps the query in the URL @NX-41', async ({ page }) => {
    await open(page, '/names', 'Names')
    await page.getByRole('searchbox').fill('ali')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/q=ali/)
  })

  test('has no side scroll @NX-41', async ({ page }) => {
    await open(page, '/names', 'Names')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('Name', () => {
  test('rejects a label DPNS cannot hold and says why @NX-40', async ({ page }) => {
    await open(page, '/name/ab', 'Name')
    await expect(page.locator('[data-status="invalid"]')).toBeVisible()
    await expect(page.locator('#name-status')).toContainText('at least 3 characters')
  })

  test('reports a free name as available @NX-40', async ({ page }) => {
    await open(page, `/name/${NAMES.available}`, 'Name')
    await expect(page.locator('[data-status="available"]')).toBeVisible()
  })

  test('shows a registered name with its owner, document and a Bridge link out @NX-40', async ({
    page,
  }) => {
    await open(page, `/name/${NAMES.registered}`, 'Name')
    await expect(page.locator('[data-status="registered"]')).toBeVisible()
    await expect(page.locator('main a[href^="/identity/"]').first()).toBeVisible()
    const bridge = page.getByRole('link', { name: /Bridge/ }).first()
    await expect(bridge).toHaveAttribute('target', '_blank')
    await expectAccessible(page)
  })

  test('sends a contested name to its contest and to Governance @NX-40', async ({ page }) => {
    await open(page, `/name/${NAMES.contested}`, 'Name')
    await expect(page.locator('[data-status="contested"]')).toBeVisible()
    await expect(page.locator(`main a[href="/contest/${NAMES.contested}"]`).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Governance/ }).first()).toHaveAttribute(
      'target',
      '_blank',
    )
  })

  test('shows a name whose contest is over as registered on testnet @NX-40', async ({ page }) => {
    await open(page, `/name/${NAMES.testnetContest}?network=testnet`, 'Name')
    await expect(page.locator('[data-status="registered"]')).toBeVisible()
  })
})

test.describe('Contests', () => {
  test('lists contests with their status, filters and stats @NX-42 @PE-19', async ({ page }) => {
    await open(page, '/contests', 'Name contests')
    await expect(page.locator('main a[href^="/contest/"]').first()).toBeVisible()
    await expect(page.locator('main')).toContainText('Status')
    await expectAccessible(page)
  })

  test('filters to active contests and keeps the filter in the URL @NX-42 @PE-19', async ({
    page,
  }) => {
    await open(page, '/contests', 'Name contests')
    await page
      .getByRole('group', { name: 'Status' })
      .getByRole('button', { name: 'Active' })
      .click()
    await expect(page).toHaveURL(/status=active/)
    await settled(page)
    await expect(page.locator('main a[href^="/contest/"]').first()).toBeVisible()
  })

  test('filters by the date a contest started @PE-19', async ({ page }) => {
    await open(page, '/contests?from=2026-11-01', 'Name contests')
    await expect(page.locator('main a[href^="/contest/"]').first()).toBeVisible()
  })

  test('filters by contract and document type @PE-19', async ({ page }) => {
    await open(
      page,
      '/contests?contract=GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec&type=domain',
      'Name contests',
    )
    await expect(page.locator('main a[href^="/contest/"]').first()).toBeVisible()
  })

  test('pages the list @PE-19', async ({ page }) => {
    await open(page, '/contests?page=2', 'Name contests')
    await expect(page.locator('main a[href^="/contest/"]').first()).toBeVisible()
  })

  test('links the voting group tabs @NX-42', async ({ page }) => {
    await open(page, '/contests', 'Name contests')
    const tabs = page.getByRole('navigation', { name: /Voting|Sections/ }).first()
    await expect(tabs).toBeVisible()
  })

  test('has no side scroll @NX-42', async ({ page }) => {
    await open(page, '/contests', 'Name contests')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('Contest', () => {
  test('draws the tally as a bar with a table that holds the same figures @NX-43', async ({
    page,
  }) => {
    await open(page, `/contest/${NAMES.contested}`, 'Name contest')
    const table = page.locator('[data-tally-table]')
    await expect(table.locator(`[data-choice="${REZA_WINNER}"]`)).toContainText('100.0%')
    await expect(table.locator('[data-choice="abstain"]')).toContainText('0')
    await expect(table.locator('[data-choice="lock"]')).toContainText('0')
    await expect(page.locator('#contest-tally [role="img"]')).toBeVisible()
    await expectAccessible(page)
  })

  test('lists the contenders with their votes and prefunded balance @NX-43 @PE-20', async ({
    page,
  }) => {
    await open(page, `/contest/${NAMES.contested}`, 'Name contest')
    const contender = page.locator('[data-contender]').first()
    await expect(contender).toContainText('vampyren.dash')
    await expect(contender).toContainText('Prefunded')
  })

  test('lists the masternode voters of one contender @NX-43', async ({ page }) => {
    await open(page, `/contest/${NAMES.contested}`, 'Name contest')
    await expect(page.getByRole('heading', { name: 'Voters' })).toBeVisible()
    await expect(page.locator('main tbody tr').first()).toBeVisible()
  })

  test('shows every vote with a choice filter and paging @PE-20', async ({ page }) => {
    await open(page, `/contest/${NAMES.contested}?tab=votes`, 'Name contest')
    await expect(page.locator('main tbody tr').first()).toBeVisible()
    const choice = page.getByRole('group', { name: 'Choice' })
    for (const name of ['Abstain', 'Lock']) {
      await choice.getByRole('button', { name }).click()
      await settled(page)
    }
    await choice.getByRole('button', { name: 'All' }).click()
    await open(page, `/contest/${NAMES.contested}?tab=votes&page=2`, 'Name contest')
    await expect(page.locator('main tbody tr').first()).toBeVisible()
  })

  test('shows the raw contest data @NX-43', async ({ page }) => {
    await open(page, `/contest/${NAMES.contested}?tab=raw`, 'Name contest')
    await expect(page.locator('#contest-raw')).toBeVisible()
  })

  test('names the winner of a finished contest @NX-43', async ({ page }) => {
    await open(page, '/contest/quantum', 'Name contest')
    await expect(page.locator('main')).toContainText('Winner')
  })

  test('says there is no contest for a name that was never contested @NX-43', async ({ page }) => {
    await pinClockToFixtures(page)
    await page.goto(`/contest/${NAMES.available}`)
    await expect(page.getByText(/No contest for/)).toBeVisible()
  })

  test('shows a testnet contest @NX-43', async ({ page }) => {
    await open(page, `/contest/${NAMES.testnetContest}?network=testnet`, 'Name contest')
    await expect(page.locator('[data-contender]').first()).toBeVisible()
  })

  test('has no side scroll @NX-43', async ({ page }) => {
    for (const tab of ['tally', 'votes', 'raw']) {
      await open(page, `/contest/${NAMES.contested}?tab=${tab}`, 'Name contest')
      expect(await horizontalOverflow(page), tab).toBeLessThanOrEqual(0)
    }
  })
})

test.describe('Votes', () => {
  test('lists masternode votes with voter, choice and the contest voted on @PE-21', async ({
    page,
  }) => {
    await open(page, '/votes', 'Masternode votes')
    await expect(rows(page, 'votes-list').first()).toBeVisible()
    await expect(page.locator('#votes-list a[href^="/contest/"]').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('filters by choice, voter, target identity and date @PE-21', async ({ page }) => {
    await open(page, '/votes?choice=lock', 'Masternode votes')
    await expect(rows(page, 'votes-list').first()).toBeVisible()
    await open(page, `/votes?voter=${VOTER}`, 'Masternode votes')
    await expect(rows(page, 'votes-list').first()).toBeVisible()
    await open(page, `/votes?towards=${REZA_WINNER}`, 'Masternode votes')
    await expect(rows(page, 'votes-list').first()).toBeVisible()
    await open(page, '/votes?from=2026-11-01', 'Masternode votes')
    await expect(rows(page, 'votes-list').first()).toBeVisible()
  })

  test('pages the list @PE-21', async ({ page }) => {
    await open(page, '/votes?page=2', 'Masternode votes')
    await expect(rows(page, 'votes-list').first()).toBeVisible()
  })

  test('has no side scroll @PE-21', async ({ page }) => {
    await open(page, '/votes', 'Masternode votes')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('Polls', () => {
  test('lists the polls ending in the window, soonest first @NX-44', async ({ page }) => {
    await open(page, '/polls?range=upcoming', 'Vote polls')
    await expect(page.locator('#polls-list')).toBeVisible()
    await expectAccessible(page)
  })

  test('switches the window and the direction @NX-44', async ({ page }) => {
    await open(page, '/polls', 'Vote polls')
    const range = page.getByRole('group', { name: 'Ends within' })
    await range.getByRole('button', { name: '7 days' }).click()
    await expect(page).toHaveURL(/range=7d/)
    await settled(page)
    await page
      .getByRole('group', { name: 'Order' })
      .getByRole('button', { name: 'Latest first' })
      .click()
    await expect(page).toHaveURL(/dir=desc/)
  })

  test('lists the polls of a custom range @NX-44', async ({ page }) => {
    await open(page, '/polls?range=custom&from=2026-11-01&to=2027-01-31', 'Vote polls')
    await expect(page.locator('#polls-list a[href^="/contest/"]').first()).toBeVisible()
  })

  test('has no side scroll @NX-44', async ({ page }) => {
    await open(page, '/polls', 'Vote polls')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('Decentralized only mode', () => {
  test('keeps the names list and search @NX-41', async ({ page }) => {
    await open(page, onlyUrl('/names?q=ali'), 'Names')
    await expect(page.locator('#names-list')).toContainText('Alice.dash')
    await expect(page.locator(MODE)).toHaveCount(0)
  })

  test('keeps the name states from the SDK @NX-40', async ({ page }) => {
    await open(page, onlyUrl(`/name/${NAMES.registered}`), 'Name')
    await expect(page.locator('[data-status="registered"]')).toBeVisible()
    await open(page, onlyUrl(`/name/${NAMES.contested}`), 'Name')
    await expect(page.locator('[data-status="contested"]')).toBeVisible()
  })

  test('lists contests from Platform and says the indexed list needs an indexer @NX-42 @PE-19', async ({
    page,
  }) => {
    await open(page, onlyUrl('/contests'), 'Name contests')
    await expect(page.locator('main a[href^="/contest/"]').first()).toBeVisible()
    await expect(page.locator(MODE)).toHaveCount(1)
  })

  test('keeps the tally and contenders, and says votes need an indexer @NX-43 @PE-20', async ({
    page,
  }) => {
    await open(page, onlyUrl(`/contest/${NAMES.contested}`), 'Name contest')
    await expect(page.locator('[data-tally-table]')).toBeVisible()
    await expect(page.locator('[data-contender]').first()).toBeVisible()
    await expect(page.locator(MODE).first()).toBeVisible()
  })

  test('covers the votes list with one notice instead of a table @PE-21', async ({ page }) => {
    await open(page, onlyUrl('/votes'), 'Masternode votes')
    await expect(page.locator(MODE)).toHaveCount(1)
    await expect(page.locator('tbody tr')).toHaveCount(0)
  })

  test('keeps the polls @NX-44', async ({ page }) => {
    await open(page, onlyUrl('/polls?range=custom&from=2026-11-01&to=2027-01-31'), 'Vote polls')
    await expect(page.locator('#polls-list a[href^="/contest/"]').first()).toBeVisible()
    await expect(page.locator(MODE)).toHaveCount(0)
  })
})
