import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { pinClockToFixtures } from '../helpers/clock'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const card = (page: Page, id: string) => page.locator(`#${id}`)

const heading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Platform' })

async function open(page: Page, url = '/platform'): Promise<void> {
  await pinClockToFixtures(page)
  await page.goto(url)
  await expect(heading(page)).toBeVisible()
  await settled(page)
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 700

test.describe('Platform overview', () => {
  test('shows the proof-checked vital signs and says what is not proved @NX-01', async ({
    page,
  }) => {
    await open(page)
    const vitals = card(page, 'vitals')
    await expect(vitals).toContainText('Platform height')
    await expect(vitals).toContainText('Total credits')
    await expect(vitals).toContainText('Protocol version')
    await expect(vitals).toContainText(/Epoch\s*\d+/)
    await expect(vitals).toContainText('Not proof-checked')
    await expect(vitals.locator('[data-source="sdk"][data-proved="true"]').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('ranks the ten evonodes with the most blocks and opens each one @NX-02', async ({
    page,
  }) => {
    await open(page)
    const proposers = card(page, 'proposers')
    await proposers.scrollIntoViewIfNeeded()
    await expect(proposers.getByRole('row')).toHaveCount(isPhone(page) ? 10 : 11)
    await expect(proposers).toContainText(/Combined from \d+ proof-checked answers/)
    const first = proposers.locator('a[href^="/mn/"]').first()
    const href = await first.getAttribute('href')
    await first.click()
    await expect(page).toHaveURL(new RegExp(`${href}`))
  })

  test('goes straight to an epoch from the quick entry @NX-03', async ({ page }) => {
    await open(page)
    await page
      .getByRole('textbox', { name: /Identity ID, name.dash, token ID or epoch number/ })
      .fill('88')
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await expect(page).toHaveURL(/\/epoch\/88/)
  })

  test('sends text it cannot place to the search page and withholds a recovery phrase @NX-03', async ({
    page,
  }) => {
    await open(page)
    const input = page.getByRole('textbox', {
      name: /Identity ID, name.dash, token ID or epoch number/,
    })
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await input.fill(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    )
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await expect(card(page, 'quick-entry')).toContainText('It was not sent anywhere')
    await expect(page).toHaveURL(/\/platform/)
    expect(requests.filter((u) => u.includes('abandon'))).toEqual([])

    await input.fill('zzzz-not-a-real-core-thing-12345')
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await expect(page).toHaveURL(/\/search\?q=zzzz-not-a-real-core-thing-12345/)
  })

  test('groups quorums by size, counts the polls and names the contracts @NX-04', async ({
    page,
  }) => {
    await open(page)
    await card(page, 'quorums').scrollIntoViewIfNeeded()
    await expect(card(page, 'quorums').locator('[data-quorum-sizes]')).toBeVisible()
    await expect(card(page, 'polls').locator('[data-poll-count]')).toBeVisible()
    await expect(card(page, 'contracts')).toContainText('DPNS')
    await expect(card(page, 'contracts')).toContainText(/version \d/)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expectAccessible(page)
  })

  test('shows the indexer pulse and five of the newest blocks and transitions @PE-01 @PE-02', async ({
    page,
  }) => {
    await open(page)
    const pulse = card(page, 'pulse')
    await expect(pulse.locator('[data-pulse="indexer"]')).toContainText('In sync')
    await expect(pulse.locator('[data-pulse="height"]')).toBeVisible()
    await expect(card(page, 'newest-blocks').getByRole('row')).toHaveCount(isPhone(page) ? 5 : 6)
    await expect(
      card(page, 'newest-transitions').locator('[data-list="transitions"]'),
    ).toBeVisible()
  })

  test('holds a list still while the pointer is over it and while focus is in it @PE-02', async ({
    page,
  }) => {
    await open(page)
    const blocks = card(page, 'newest-blocks')
    const list = blocks.locator('[data-list="blocks"]')
    await expect(list).toHaveAttribute('data-held', 'false')
    if (!isPhone(page)) {
      await list.hover()
      await expect(list).toHaveAttribute('data-held', 'true')
      await expect(blocks.getByRole('status')).toContainText('Held still while you look')
      await page.mouse.move(0, 0)
      await expect(list).toHaveAttribute('data-held', 'false')
    }
    await blocks.getByRole('link', { name: 'All blocks' }).focus()
    await expect(list).toHaveAttribute('data-held', 'false')
    await page.keyboard.press('Tab')
    await expect(list).toHaveAttribute('data-held', 'true')
    await expect(blocks.getByRole('status')).toContainText('Held still while you look')
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await expect(list).toHaveAttribute('data-held', 'false')
  })

  test('lists the current epoch and the three before it @PE-03', async ({ page }) => {
    await open(page)
    const epochs = card(page, 'recent-epochs')
    await epochs.scrollIntoViewIfNeeded()
    await expect(epochs.locator('a[href^="/epoch/"]')).toHaveCount(4)
  })

  test('draws the four charts with a table equivalent and keeps the range in the address @PE-04', async ({
    page,
  }) => {
    await open(page)
    const charts = page.locator('[data-charts]')
    await charts.scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '24 h' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '1 w' }).click()
    await expect(page).toHaveURL(/range=1w/)
    await expect(page.getByRole('button', { name: '1 w' })).toHaveAttribute('aria-pressed', 'true')
    await settled(page)
    for (const id of ['chart-transitions', 'chart-identities', 'chart-types', 'chart-shielded']) {
      await expect(card(page, id)).toBeVisible()
    }
    await expect(charts.getByRole('button', { name: 'Show as a table' }).first()).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: '1 w' })).toHaveAttribute('aria-pressed', 'true')
    await page.goBack()
    await expect(page).not.toHaveURL(/range=1w/)
  })

  test('ranks identities by balance or by transitions @PE-05', async ({ page }) => {
    await open(page)
    const boards = page.locator('[data-leaderboards]')
    await boards.scrollIntoViewIfNeeded()
    await expect(card(page, 'board-richest')).toBeVisible()
    await boards.getByRole('button', { name: 'Transitions' }).click()
    await expect(page).toHaveURL(/rich=txs/)
    await expect(boards.getByRole('button', { name: 'Transitions' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await settled(page)
    await expect(card(page, 'board-richest').locator('[data-board]')).toBeVisible()
    await expectAccessible(page)
  })

  test('counts validators and lists quorums, linking to the platform masternode view @PE-06', async ({
    page,
  }) => {
    await open(page)
    const validators = card(page, 'validators')
    await validators.scrollIntoViewIfNeeded()
    await expect(validators).toContainText('681')
    await expect(validators.locator('[data-last-proposer]')).toBeVisible()
    await validators.getByRole('link', { name: 'All evonodes' }).click()
    await expect(page).toHaveURL(/\/masternodes\?.*view=platform/)
  })

  test('switching network keeps /platform with its range and rich, and shows no stale data @PE-36', async ({
    page,
  }) => {
    await open(page, '/platform?range=1w&rich=txs')
    const proposersBefore = await card(page, 'vitals').innerText()
    await page.getByRole('button', { name: /Network: Mainnet/ }).click()
    await page
      .getByRole('navigation', { name: 'Network' })
      .getByRole('link', { name: 'Testnet' })
      .click()
    await expect(page).toHaveURL(/\/platform\?/)
    await expect(page).toHaveURL(/network=testnet/)
    await expect(page).toHaveURL(/range=1w/)
    await expect(page).toHaveURL(/rich=txs/)
    await expect(heading(page)).toBeVisible()
    await settled(page)
    await expect(page.getByRole('button', { name: '1 w' })).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page, 'vitals')).not.toHaveText(proposersBefore)
    await expect(page.locator('[data-network-kind="main"]')).toHaveCount(0)
    await expect(page.locator('[data-source][data-network="mainnet"]')).toHaveCount(0)
  })

  test('on a phone the zones stack, the charts fit and nothing scrolls sideways @PE-04', async ({
    page,
  }) => {
    test.skip(!isPhone(page), 'phone layout')
    await open(page)
    await page.locator('[data-charts]').scrollIntoViewIfNeeded()
    await settled(page)
    expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)
    const boxes = await page
      .locator('#vitals, #quick-entry')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))
    expect(boxes[0]!.bottom).toBeLessThanOrEqual(boxes[1]!.top + 1)
    const chart = await card(page, 'chart-transitions').boundingBox()
    expect(chart!.width).toBeLessThanOrEqual(390)
  })
})

test.describe('Platform overview in Decentralized only mode', () => {
  test('keeps the SDK zones, shows one notice and asks no hosted source @NX-01 @NX-02 @NX-04 @PE-01', async ({
    page,
  }) => {
    const hosted: string[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (u.hostname.endsWith('pe.dashhq.org') || u.hostname === 'radar.dashhq.org')
        hosted.push(r.url())
    })
    await pinClockToFixtures(page)
    await page.goto('/platform?sources=decentralized')
    await expect(heading(page)).toBeVisible()
    await settled(page)
    await expect(card(page, 'vitals')).toContainText('Platform height')
    await card(page, 'proposers').scrollIntoViewIfNeeded()
    await expect(card(page, 'proposers').getByRole('row')).toHaveCount(isPhone(page) ? 10 : 11)
    await expect(card(page, 'contracts')).toContainText('DPNS')
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(card(page, 'pulse')).toHaveCount(0)
    await expect(card(page, 'newest-blocks')).toHaveCount(0)
    await expectAccessible(page)
    expect(hosted, 'requests to the indexer').toEqual([])
  })
})

test.describe('Platform status on /status', () => {
  test('shows what the answering evonode says about Platform, with a verdict @NX-54', async ({
    page,
  }) => {
    await pinClockToFixtures(page)
    await page.goto('/status')
    const platform = card(page, 'platform')
    await expect(platform.getByRole('heading', { name: 'Dash Platform' })).toBeVisible()
    await expect(platform.locator('[data-platform="height"]')).toBeVisible()
    await expect(platform.locator('[data-platform="chainlocked"]')).toBeVisible()
    await expect(platform.locator('[data-platform="core-tip"]')).toBeVisible()
    await expect(platform.locator('[data-platform="last-block"]')).toBeVisible()
    await expect(platform.locator('[data-platform-state]')).toHaveAttribute(
      'data-platform-state',
      /^(live|lagging|stalled)$/,
    )
    await settled(page)
    await expectAccessible(page)
  })

  test('is there on testnet too and keeps the phone layout whole @NX-54', async ({ page }) => {
    await pinClockToFixtures(page)
    await page.goto('/status?network=testnet')
    await expect(card(page, 'platform').locator('[data-platform="height"]')).toBeVisible()
    await settled(page)
    expect(await horizontalOverflow(page), 'sideways overflow').toBeLessThanOrEqual(0)
  })
})
