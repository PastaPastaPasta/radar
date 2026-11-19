import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { pinClockToEpoch, pinClockToFixtures } from '../helpers/clock'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { expectProved, expectReports, sourceLineOf } from '../helpers/sources'
import { CLAIM, H1 } from '../routes/claims'

const card = (page: Page, id: string) => page.locator(`#${id}`)
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 700
/** The rows a table shows (a phone keeps the table and scrolls it sideways). */
const bodyRows = (page: Page, id: string) => card(page, id).locator('tbody tr')

/** An audit at the top of the page: a row that scrolled under the sticky bar counts as obscured. */
async function audit(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
  })
  await expectAccessible(page)
}

async function open(
  page: Page,
  url: string,
  h1: string | RegExp,
  pin: (page: Page) => Promise<Date> = pinClockToFixtures,
): Promise<void> {
  await pin(page)
  await page.goto(url)
  await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
  await settled(page)
}

const mode = (path: string) => `${path}${path.includes('?') ? '&' : '?'}sources=decentralized`
const SORTED = /^(ascending|descending)$/

test.describe('Epochs', () => {
  test('shows where the current epoch stands: clock, start, estimated end, first block and fee multiplier @RA-60 @NX-50', async ({
    page,
  }) => {
    // epoch 88 must still be running, so the clock is the epoch recording's own, not the newest recording's
    await open(page, '/epochs', H1.epochs, pinClockToEpoch)
    const current = card(page, 'current-epoch')
    await expect(current.getByRole('meter')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Epoch 88 is \d+% through$/)
    await expect(current.getByRole('meter')).toHaveAttribute(
      'aria-valuetext',
      /^Epoch 88\. \d+% through\. /,
    )
    await expect(current.locator('.rx-clock')).not.toContainText(/% through/)
    await expect(current).toContainText(/blocks so far/)
    for (const label of ['Started', 'Estimated end', 'First block', 'Fee multiplier']) {
      await expect(current.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(current.locator('a[href^="/platform/block/"]')).toBeVisible()
    // The page line is shared with the proposers, an unproved read, so the part's own report is what proves it.
    await expectReports(current, 'sdk:proved')
    await expect(
      sourceLineOf(current).locator('[data-source="sdk"][data-proved="true"]'),
    ).toBeVisible()
    const rewards = card(page, 'rewards')
    for (const label of [
      'Pool so far',
      'Last pool',
      'Per block',
      'Median monthly earnings',
      'Median yield',
    ]) {
      await expect(rewards.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(
      rewards.getByText('Epoch 87', { exact: true }),
      'the epoch that just ended',
    ).toHaveCount(1)
    await expect(rewards).toContainText('Core block rewards to Core block 2,570,099')
    await expect(sourceLineOf(rewards).locator('[data-source="radar"]').first()).toBeVisible()
    await audit(page)
  })

  test('ranks the twenty top proposers and sorts them @NX-50', async ({ page }) => {
    await open(page, '/epochs', H1.epochs)
    const proposers = card(page, 'proposers')
    await proposers.scrollIntoViewIfNeeded()
    await expect(bodyRows(page, 'proposers')).toHaveCount(20)
    await expect(proposers.locator('a[href^="/mn/"]').first()).toBeVisible()
    await expect(proposers).toContainText(/Combined from \d+ proof-checked answers/)
    if (isPhone(page)) return
    const blocks = async () =>
      (await proposers.locator('tbody tr td:nth-child(3)').allInnerTexts()).map((t) =>
        Number(t.replaceAll(/[^\d]/g, '')),
      )
    const descending = await blocks()
    expect(descending).toEqual([...descending].sort((a, b) => b - a))
    await proposers.getByRole('button', { name: /Blocks/ }).click()
    await expect(proposers.getByRole('columnheader', { name: /Blocks/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    const ascending = await blocks()
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b))
  })

  test('lists the next twelve proposers with their slots and ETA @RA-62', async ({ page }) => {
    await open(page, '/epochs', H1.epochs)
    const upcoming = card(page, 'upcoming')
    await upcoming.scrollIntoViewIfNeeded()
    await expect(bodyRows(page, 'upcoming')).toHaveCount(12)
    await expect(upcoming.locator('a[href^="/mn/"]').first()).toBeVisible()
    await expect(sourceLineOf(upcoming).locator('[data-source="dapi"]').first()).toBeVisible()
    await expect(upcoming).toContainText('from the validator sets an evonode reported at block')
    await expect(upcoming.locator('tbody tr').first()).toContainText(/\+1(?!\d)/)
    await expect(upcoming.locator('tbody')).not.toContainText(/\bago\b/)
    if (!isPhone(page)) {
      await expect(upcoming.getByRole('columnheader', { name: 'Blocks away' })).toBeVisible()
      await expect(upcoming.getByRole('columnheader', { name: 'Proposes around' })).toBeVisible()
    }
  })

  test('draws the earnings band over the last epochs, with a table on request @RA-63', async ({
    page,
  }) => {
    await open(page, '/epochs', H1.epochs)
    const history = card(page, 'history')
    await history.scrollIntoViewIfNeeded()
    await expect(
      history.getByRole('img', { name: /Earnings per evonode in each of the last \d+ epochs/ }),
    ).toBeVisible()
    const show = history.getByRole('button', { name: 'Show as a table' })
    await show.click()
    await expect(history.getByRole('button', { name: 'Hide table' })).toBeVisible()
    const rows = history.locator('.rx-chart__table tbody tr')
    expect(await rows.count()).toBeGreaterThan(20)
    expect(await rows.count()).toBeLessThanOrEqual(60)
    await expect(history.locator('.rx-chart__table thead')).toContainText('Median (DASH)')
  })

  test('lists the latest twenty epochs, each linking to its page @NX-52', async ({ page }) => {
    await open(page, '/epochs', H1.epochs)
    const range = card(page, 'range')
    await range.scrollIntoViewIfNeeded()
    await expect(range).toContainText('The latest 20 epochs.')
    await expect(bodyRows(page, 'range')).toHaveCount(20)
    // Epoch 88 is the current one: its page sends the visitor back here, so a click on its row can't settle on it.
    await expect(range.locator('a[href^="/epoch/"]').first()).toHaveAttribute('href', /\/epoch\/88/)
    await range.locator('a[href^="/epoch/"]').nth(1).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Epoch 87' })).toBeVisible()
    await settled(page)
    await expect(page).toHaveURL(/\/epoch\/87/)
  })

  test('shows a custom range from the address and from the form @NX-52', async ({ page }) => {
    await open(page, '/epochs?from=81&to=86', H1.epochs)
    const range = card(page, 'range')
    await range.scrollIntoViewIfNeeded()
    await expect(range).toContainText('Epochs 81 to 86.')
    await expect(bodyRows(page, 'range')).toHaveCount(6)
    await expect(range.locator('a[href^="/epoch/"]').first()).toHaveAttribute('href', /\/epoch\/86/)
    await expect(range.getByLabel('From epoch')).toHaveValue('81')
    await range.getByLabel('From epoch').fill('84')
    await range.getByLabel('To epoch').fill('86')
    await range.getByRole('button', { name: 'Show', exact: true }).click()
    await expect(page).toHaveURL(/from=84/)
    await expect(page).toHaveURL(/to=86/)
    await expect(bodyRows(page, 'range')).toHaveCount(3)
    await range.getByRole('button', { name: 'Latest 20' }).click()
    await expect(page).not.toHaveURL(/from=/)
    await expect(bodyRows(page, 'range')).toHaveCount(20)
  })

  test('keeps the live pool and schedule in Decentralized only mode, says once what needs Radar, and keeps the proof-checked parts @RA-60 @RA-62 @NX-50 @NX-52', async ({
    page,
  }) => {
    await open(page, mode('/epochs'), H1.epochs)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(card(page, 'radar-zone')).toContainText('need Radar’s crawl')
    await expect(card(page, 'current-epoch').getByRole('meter')).toBeVisible()
    await expect(bodyRows(page, 'proposers')).toHaveCount(20)
    await expect(bodyRows(page, 'range')).toHaveCount(20)
    await expect(card(page, 'rewards')).toContainText('Core block rewards to Core block')
    await expect(bodyRows(page, 'upcoming')).toHaveCount(12)
    await expect(card(page, 'history')).toHaveCount(0)
    await expect(card(page, 'radar-zone').locator('[data-source="radar"]')).toHaveCount(0)
  })

  test('fits the phone and the desktop @NX-50', async ({ page }) => {
    await open(page, '/epochs', H1.epochs)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('works on testnet, whose epochs are an hour long @NX-50', async ({ page }) => {
    await open(page, '/epochs?network=testnet', H1.epochs)
    await expect(card(page, 'current-epoch').getByRole('meter')).toBeVisible()
    await expect(card(page, 'rewards')).toContainText('Pool so far')
    await expect(bodyRows(page, 'range')).toHaveCount(20)
  })
})

/** The recorded current-epoch answer's block time: block 469,065. */
const TIP_MS = 1_794_337_718_422

interface PlatformHooks {
  __radarFixtures: {
    advancePlatformTip(n: number, blockMs?: number): void
    cutPlatform(down: boolean): void
  }
}

/** Opens /epochs with the clock just after the recorded tip, so the section is live rather than quiet. */
async function openLive(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(TIP_MS + 20_000) })
  await page.goto('/epochs')
  await expect(page.getByRole('heading', { level: 1, name: H1.epochs })).toBeVisible()
  await settled(page)
  await expect(page.locator('#upcoming .rx-livesched')).toHaveAttribute('data-live', 'live')
  await expect(bodyRows(page, 'upcoming')).toHaveCount(12)
}

/** Records every class a schedule row took on, so a spec can tell whether rows moved. */
async function watchRowClasses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen = new Set<string>()
    ;(window as unknown as { __rowClasses: Set<string> }).__rowClasses = seen
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as Element
        if (el.tagName === 'TR') for (const c of el.classList) seen.add(c)
        for (const n of r.addedNodes)
          if (n instanceof Element && n.tagName === 'TR') for (const c of n.classList) seen.add(c)
      }
    }).observe(document.querySelector('#upcoming tbody')!, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    })
  })
}
const rowClasses = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { __rowClasses: Set<string> }).__rowClasses])
const rowIds = (page: Page) =>
  bodyRows(page, 'upcoming').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-row-id')))

test.describe('Live schedule', () => {
  test('shows the latest block, its proposer and a countdown, with no crawl age @RA-62', async ({
    page,
  }) => {
    await openLive(page)
    const strip = page.locator('#upcoming .rx-livesched')
    await expect(strip).toContainText(/Latest block\s*469,065/)
    await expect(strip).toContainText('proposed by')
    await expect(strip).toContainText(/Next block expected in about \d+ min \d+ s/)
    await expect(card(page, 'upcoming')).not.toContainText('Crawled')
    await audit(page)
  })

  test('drops the proposer whose block landed, moves the rest up and adds a twelfth row @RA-62', async ({
    page,
  }) => {
    await openLive(page)
    const before = await rowIds(page)
    await watchRowClasses(page)
    await page.evaluate(() => {
      ;(window as unknown as PlatformHooks).__radarFixtures.advancePlatformTip(1, 10_000)
    })
    const strip = page.locator('#upcoming .rx-livesched')
    await expect(strip.locator('[data-tip-height="469066"]')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => rowIds(page)).toEqual([...before.slice(1), expect.any(String)])
    expect((await rowIds(page)).at(-1)).not.toBe(before.at(-1))
    // The proposer of the new block comes from the validator sets read for it: the evonode that was first in line.
    // It is read again once the 10 s gap after the page's first read has passed.
    await expect(strip.locator(`a[href*="${before[0]!.slice(0, 16)}"]`).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(bodyRows(page, 'upcoming')).toHaveCount(12)
    const classes = await rowClasses(page)
    expect(classes).toEqual(expect.arrayContaining(['rx-leave', 'rx-rise', 'rx-enter']))
  })

  test('updates the list in place under reduced motion @RA-62', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openLive(page)
    const before = await rowIds(page)
    await watchRowClasses(page)
    await page.evaluate(() => {
      ;(window as unknown as PlatformHooks).__radarFixtures.advancePlatformTip(2, 10_000)
    })
    await expect(page.locator('#upcoming .rx-livesched [data-tip-height="469067"]')).toBeVisible({
      timeout: 15_000,
    })
    await expect
      .poll(() => rowIds(page))
      .toEqual([...before.slice(2), expect.any(String), expect.any(String)])
    const classes = await rowClasses(page)
    expect(classes).not.toContain('rx-leave')
    expect(classes).not.toContain('rx-rise')
  })

  test('says updates are paused when Platform stops answering, and resumes on Try again @RA-62', async ({
    page,
  }) => {
    await openLive(page)
    await page.evaluate(() => {
      ;(window as unknown as PlatformHooks).__radarFixtures.cutPlatform(true)
    })
    const strip = page.locator('#upcoming .rx-livesched')
    await expect(strip).toHaveAttribute('data-live', 'paused', { timeout: 30_000 })
    await expect(strip).toContainText(/Updates paused, last block \d+/)
    await expect(bodyRows(page, 'upcoming'), 'the last order stays').toHaveCount(12)
    await page.evaluate(() => {
      ;(window as unknown as PlatformHooks).__radarFixtures.cutPlatform(false)
    })
    await strip.getByRole('button', { name: 'Try again' }).click()
    await expect(strip).toHaveAttribute('data-live', 'live', { timeout: 15_000 })
  })
})

test.describe('One epoch', () => {
  test('shows a past epoch’s finalized totals and proposers @NX-51', async ({ page }) => {
    await open(page, '/epoch/86', 'Epoch 86')
    const totals = card(page, 'epoch-totals')
    for (const label of [
      'Started',
      'Ended',
      'First block',
      'Blocks',
      'Proposers',
      'Processing fees',
      'Fee multiplier',
    ]) {
      await expect(totals.getByText(label, { exact: true })).toBeVisible()
    }
    await expectProved(totals)
    const proposers = card(page, 'epoch-proposers')
    await proposers.scrollIntoViewIfNeeded()
    await expect(bodyRows(page, 'epoch-proposers').first()).toBeVisible()
    await expect(proposers.locator('a[href^="/mn/"]').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible()
    await audit(page)
  })

  test('links to the previous and next epoch @NX-51', async ({ page }) => {
    await open(page, '/epoch/86', 'Epoch 86')
    await page.getByRole('link', { name: 'Previous: epoch 85' }).click()
    await expect(page).toHaveURL(/\/epoch\/85/)
    await expect(page.getByRole('heading', { level: 1, name: 'Epoch 85' })).toBeVisible()
    await page.getByRole('link', { name: 'Next: epoch 86' }).click()
    await page.getByRole('link', { name: 'Next: epoch 87' }).click()
    await expect(page).toHaveURL(/\/epoch\/87/)
  })

  test('sorts the proposers by blocks and keeps the order in the address @NX-51', async ({
    page,
  }) => {
    test.skip(isPhone(page), 'phone cards have no sortable header')
    await open(page, '/epoch/86', 'Epoch 86')
    const table = card(page, 'epoch-proposers')
    await table.scrollIntoViewIfNeeded()
    await table.getByRole('button', { name: /Blocks/ }).click()
    await expect(page).toHaveURL(/sort=blocks/)
    await expect(table.getByRole('columnheader', { name: /Blocks/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    const counts = (await table.locator('tbody tr td:nth-child(3)').allInnerTexts()).map((t) =>
      Number(t.replaceAll(/[^\d]/g, '')),
    )
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
  })

  test('sends the current epoch to the epochs page @NX-51', async ({ page }) => {
    await pinClockToFixtures(page)
    await page.goto('/epoch/88')
    await expect(page).toHaveURL(/\/epochs(\?|$)/)
    await expect(page.getByRole('heading', { level: 1, name: CLAIM.epochs })).toBeVisible()
  })

  test('says a future or unknown epoch is not there, without an error @NX-51', async ({ page }) => {
    await open(page, '/epoch/99999', 'Epoch 99,999')
    await expect(page.getByText('Epoch 99,999 has not started')).toBeVisible()
    await expect(page.getByText('The current epoch is 88.')).toBeVisible()
    await open(page, '/epoch/abc', 'Epoch')
    await expect(page.getByText('That is not an epoch number')).toBeVisible()
    await expect(page.locator('[data-error]')).toHaveCount(0)
  })

  test('shows its data in Decentralized only mode without a notice @NX-51', async ({ page }) => {
    await open(page, mode('/epoch/86'), 'Epoch 86')
    await expect(card(page, 'epoch-totals').getByText('Blocks', { exact: true })).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(0)
  })
})

test.describe('Protocol', () => {
  test('shows the current and next version and the votes against the threshold @RA-61', async ({
    page,
  }) => {
    await open(page, '/protocol', 'Protocol')
    const vote = card(page, 'vote')
    await expect(vote.getByText('Current version', { exact: true })).toBeVisible()
    await expect(vote).toContainText('v14')
    await expect(vote).toContainText('None proposed')
    const meter = vote.getByRole('meter')
    await expect(meter).toBeVisible()
    await expect(vote.locator('.rx-meter__mark')).toBeVisible()
    await expect(vote.getByText('Activation threshold', { exact: true })).toBeVisible()
    await expect(vote).toContainText(/244 of 363 evonodes \(67%\)/)
    await expect(
      vote.getByText('Pending votes', { exact: true }),
      'nothing is proposed',
    ).toHaveCount(0)
    await expect(vote.getByText('Candidate version', { exact: true })).toBeVisible()
    await expect(sourceLineOf(vote).locator('[data-source="radar"]').first()).toBeVisible()
    await audit(page)
  })

  test('tallies the votes across versions and lists each evonode’s vote @NX-56', async ({
    page,
  }) => {
    await open(page, '/protocol', 'Protocol')
    const tally = card(page, 'tally')
    await expect(tally).toContainText('v14')
    await expect(bodyRows(page, 'tally')).toHaveCount(1)
    const table = card(page, 'vote-table')
    await table.scrollIntoViewIfNeeded()
    await expect(table).toContainText(/Combined from \d+ proof-checked answers/)
    await expect(bodyRows(page, 'vote-table').first()).toBeVisible()
    await expect(table.locator('a[href^="/mn/"]').first()).toBeVisible()
  })

  test('sorts the vote table and keeps the order in the address @NX-56', async ({ page }) => {
    test.skip(isPhone(page), 'phone cards have no sortable header')
    await open(page, '/protocol', 'Protocol')
    const table = card(page, 'vote-table')
    await table.scrollIntoViewIfNeeded()
    await expect(table.getByRole('columnheader', { name: /Votes for/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await table.getByRole('button', { name: 'Evonode', exact: true }).click()
    await expect(page).toHaveURL(/sort=node/)
    await expect(table.getByRole('columnheader', { name: /Evonode/ })).toHaveAttribute(
      'aria-sort',
      SORTED,
    )
    const hashes = await table
      .locator('tbody tr a[href^="/mn/"]')
      .evaluateAll((els) => els.map((a) => a.getAttribute('href')!.replace('/mn/', '')))
    expect(hashes.slice(0, 20)).toEqual([...hashes.slice(0, 20)].sort())
  })

  test('says in Decentralized only mode that the exact threshold needs Radar, and states the rule @RA-61 @NX-56', async ({
    page,
  }) => {
    await open(page, mode('/protocol'), 'Protocol')
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    const vote = card(page, 'vote')
    await expect(vote.getByRole('meter')).toBeVisible()
    await expect(vote).toContainText('two thirds of the evonodes that vote')
    await expect(vote.getByText('Candidate version', { exact: true })).toHaveCount(0)
    await expect(bodyRows(page, 'tally')).toHaveCount(1)
  })

  test('works on testnet @NX-56', async ({ page }) => {
    await open(page, '/protocol?network=testnet', 'Protocol')
    await expect(card(page, 'vote').getByRole('meter')).toBeVisible()
    await expect(card(page, 'tally')).toContainText('v14')
  })
})

test.describe('Chain state', () => {
  test('switches between quorums, credits and the shielded pool with the group tabs @NX-55 @NX-57 @NX-58', async ({
    page,
  }) => {
    await open(page, '/quorums', 'Quorums')
    const tabs = page.getByRole('navigation', { name: 'Sections' })
    await expect(tabs.getByRole('link', { name: 'Quorums' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await tabs.getByRole('link', { name: 'Credits' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Credits' })).toBeVisible()
    await expect(tabs.getByRole('link', { name: 'Credits' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await tabs.getByRole('link', { name: 'Shielded pool' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Shielded pool' })).toBeVisible()
    await tabs.getByRole('link', { name: 'Quorums' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Quorums' })).toBeVisible()
  })

  test('lists the current quorums and says they are not proof-checked @NX-55', async ({ page }) => {
    await open(page, '/quorums', 'Quorums')
    const quorums = card(page, 'quorums')
    await expect(quorums).toContainText('Not proof-checked')
    await expect(
      sourceLineOf(quorums).locator('[data-source="sdk"][data-proved="false"]').first(),
    ).toBeVisible()
    await expect(quorums.locator('[data-quorum-hash]').first()).toBeVisible()
    expect(await quorums.locator('[data-quorum-hash]').count()).toBeGreaterThan(3)
    await expect(quorums.getByRole('button', { name: /LLMQ/ }).first()).toBeVisible()
    await audit(page)
  })

  test('filters quorums by hash prefix and by type, and keeps both in the address @NX-55', async ({
    page,
  }) => {
    await open(page, '/quorums', 'Quorums')
    const quorums = card(page, 'quorums')
    const all = await quorums.locator('[data-quorum-hash]').count()
    const first = await quorums
      .locator('[data-quorum-hash]')
      .first()
      .getAttribute('data-quorum-hash')
    const prefix = first!.slice(0, 24)
    await quorums.getByRole('searchbox', { name: 'Quorum hash starts with' }).fill(prefix)
    await expect(page).toHaveURL(new RegExp(`q=${prefix}`))
    await expect(quorums.locator('[data-quorum-hash]')).toHaveCount(1)
    await quorums.getByRole('searchbox', { name: 'Quorum hash starts with' }).fill('')
    await expect(quorums.locator('[data-quorum-hash]')).toHaveCount(all)
    const type = quorums.getByRole('group', { name: 'Quorum type' }).getByRole('button').first()
    const name = (await type.innerText()).trim()
    await type.click()
    await expect(type).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(new RegExp(`type=${name}`))
    expect(await quorums.locator('[data-quorum-hash]').count()).toBeLessThanOrEqual(all)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Quorums' })).toBeVisible()
    await expect(
      card(page, 'quorums').getByRole('group', { name: 'Quorum type' }).getByRole('button').first(),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('opens the quorums filtered by a hash from a link @NX-55', async ({ page }) => {
    await open(page, '/quorums?q=0000001e', 'Quorums')
    const quorums = card(page, 'quorums')
    for (const hash of await quorums
      .locator('[data-quorum-hash]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-quorum-hash')!))) {
      expect(hash.startsWith('0000001e')).toBe(true)
    }
    await expect(quorums.getByRole('searchbox', { name: 'Quorum hash starts with' })).toHaveValue(
      '0000001e',
    )
  })

  test('shows the quorums in Decentralized only mode without a notice @NX-55', async ({ page }) => {
    await open(page, mode('/quorums'), 'Quorums')
    await expect(card(page, 'quorums').locator('[data-quorum-hash]').first()).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(0)
  })

  test('shows the total credits with a USD estimate @NX-57', async ({ page }) => {
    await open(page, '/credits', 'Credits')
    const total = card(page, 'total-credits')
    await expect(total.locator('[data-amount]').first()).toBeVisible()
    await expectProved(total)
    await expect(total.locator('.rx-fiat')).toContainText('$')
    await audit(page)
  })

  test('shows no USD estimate in Decentralized only mode @NX-57', async ({ page }) => {
    await open(page, mode('/credits'), 'Credits')
    await expect(card(page, 'total-credits').locator('[data-amount]').first()).toBeVisible()
    await expect(card(page, 'total-credits').locator('.rx-fiat')).toHaveCount(0)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(0)
  })

  test('says there is no prefunded balance for an ID that has none @NX-57', async ({ page }) => {
    await open(page, '/credits', 'Credits')
    const lookup = card(page, 'prefunded')
    await lookup.getByLabel('Balance ID').fill('11111111111111111111111111111111')
    await lookup.getByRole('button', { name: 'Look up' }).click()
    await expect(page).toHaveURL(/id=1111/)
    await expect(lookup.getByText('No prefunded balance')).toBeVisible()
    await expectProved(lookup)
  })

  test('refuses an ID that is not an ID before asking anything @NX-57', async ({ page }) => {
    await open(page, '/credits?id=not-an-id', 'Credits')
    await expect(card(page, 'prefunded').getByText('That is not a valid ID')).toBeVisible()
    await expect(card(page, 'prefunded').locator('[data-source]')).toHaveCount(0)
  })

  test('shows the pool, its most recent anchor and its anchors with a copy control on each hash @NX-58', async ({
    page,
  }) => {
    await open(page, '/shielded', 'Shielded pool')
    const pool = card(page, 'pool')
    await expect(pool.locator('[data-amount]').first()).toBeVisible()
    await expect(pool.locator('[data-recent-anchor] [data-copy]')).toHaveCount(1)
    await expectProved(pool)
    const anchors = card(page, 'anchors')
    await anchors.scrollIntoViewIfNeeded()
    await expect(anchors.locator('[data-anchors] li')).toHaveCount(10)
    await expect(anchors.locator('[data-anchors] [data-copy]')).toHaveCount(10)
    await anchors.getByRole('button', { name: 'Show more' }).click()
    expect(await anchors.locator('[data-anchors] li').count()).toBeGreaterThan(10)
    await audit(page)
  })

  test('lists encrypted notes a chunk at a time, with a copy control on every hash @NX-58', async ({
    page,
  }) => {
    await open(page, '/shielded', 'Shielded pool')
    const notes = card(page, 'notes')
    await notes.scrollIntoViewIfNeeded()
    await expect(bodyRows(page, 'notes')).toHaveCount(10)
    await expect(notes).toContainText('starting at note 0')
    expect(await notes.locator('[data-copy]').count()).toBeGreaterThanOrEqual(30)
    await expect(notes.getByRole('button', { name: 'Previous chunk' })).toBeDisabled()
    await notes.getByRole('button', { name: 'Next chunk' }).click()
    await expect(notes).toContainText('starting at note 2,048')
    await expect(bodyRows(page, 'notes')).toHaveCount(10)
    await expect(notes.getByRole('button', { name: 'Previous chunk' })).toBeEnabled()
  })

  test('looks up a nullifier: spent, not spent, and not a nullifier @NX-58', async ({ page }) => {
    const spent = '7f826385e888a51a3eb12cf9bd6ffc77d75af749987fa06db37c62e6d173f501'
    await open(page, `/shielded?nf=${spent}`, 'Shielded pool')
    const lookup = card(page, 'nullifier')
    await expect(lookup.locator('[data-nullifier-result="spent"]')).toBeVisible()
    await expect(lookup.locator('[data-nullifier-result] [data-copy]')).toHaveCount(1)
    await expectProved(lookup)

    await lookup.getByLabel('Nullifier').fill('0'.repeat(63) + '1')
    await lookup.getByRole('button', { name: 'Look up' }).click()
    await expect(lookup.locator('[data-nullifier-result="unspent"]')).toBeVisible()

    await lookup.getByLabel('Nullifier').fill('xyz')
    await lookup.getByRole('button', { name: 'Look up' }).click()
    await expect(lookup.getByText('That is not a nullifier')).toBeVisible()
  })

  test('draws the shield and unshield history for the range in the address @NX-58', async ({
    page,
  }) => {
    await open(page, '/shielded', 'Shielded pool')
    const history = card(page, 'chart-shielded')
    await history.scrollIntoViewIfNeeded()
    await expect(history.getByRole('button', { name: '1 w' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await history.getByRole('button', { name: '1 m' }).click()
    await expect(page).toHaveURL(/range=1m/)
    await settled(page)
    await expect(history.getByRole('button', { name: 'Show as a table' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: '1 m' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('keeps the proved state and says the history needs Platform Explorer in Decentralized only mode @NX-58', async ({
    page,
  }) => {
    await open(page, mode('/shielded'), 'Shielded pool')
    await expect(card(page, 'pool').locator('[data-amount]').first()).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(card(page, 'shield-history')).toContainText('Platform Explorer')
    await expect(card(page, 'chart-shielded')).toHaveCount(0)
    await expect(bodyRows(page, 'notes')).toHaveCount(10)
  })

  test('fits the phone and the desktop on testnet @NX-58', async ({ page }) => {
    await open(page, '/shielded?network=testnet', 'Shielded pool')
    await expect(card(page, 'pool').locator('[data-amount]').first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})
