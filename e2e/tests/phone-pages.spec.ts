import { expect as baseExpect, test } from '../helpers/test'
import { horizontalOverflow, settled } from '../helpers/settled'
import { casesNets, networkQuery, ROUTE_CASES, withQuery } from '../routes'

const expect = baseExpect.configure({ timeout: 15_000 })

const TIP = 2570085
const TESTNET_TIP = 1589232
const MAINNET_ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const TESTNET_ADDRESS = 'yjSvwyLB5X4dqQqVMPMu6UdrFpYZ3u9v5U'

const onPhone = (page: { viewportSize(): { width: number } | null }) =>
  (page.viewportSize()?.width ?? 1000) <= 640

test.describe('Core height on the home card', () => {
  for (const [label, path, tip] of [
    ['mainnet', '/', TIP],
    ['testnet', '/?network=testnet', TESTNET_TIP],
  ] as const) {
    test(`says the tip is ChainLocked on the ${label} height card @IN-01`, async ({ page }) => {
      await page.goto(path)
      const card = page.locator('[data-pulse="core"]')
      await expect(card).toContainText(tip.toLocaleString('en-US'))
      await expect(card.locator('.rx-ok')).toContainText('ChainLocked')
    })
  }

  test('states the newest Core height once as a figure, and lists that block first @IN-01 @HY-01', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText(TIP.toLocaleString('en-US'))
    await expect(page.locator('[data-pulse="core"]')).toHaveCount(1)
    await expect(page.locator('[data-headline]')).toContainText('Difficulty')
    await expect(page.locator('[data-headline]')).not.toContainText(TIP.toLocaleString('en-US'))
    const first = page
      .getByRole('table', { name: 'Latest Core blocks' })
      .locator('tbody tr')
      .first()
    await expect(first.locator(`a[href="/block/${TIP}"]`).first()).toBeAttached()
  })
})

test.describe('A long name in a phone row card', () => {
  test('is cut short instead of pushing the card past the screen @X-08', async ({ page }) => {
    test.skip(!onPhone(page), 'phone only')
    await page.goto('/names')
    await settled(page)
    const chip = page.locator('.rx-table--cards td.e .rx-chip').first()
    // An owner's name arrives only when its lookup lands, so the longest testnet name is put in place directly.
    await chip.evaluate((el) => {
      const name = document.createElement('span')
      name.className = 'rx-chip__name'
      name.textContent = 'identity-name-goes-hereeeeeeeeeeeeeeeeeeeeeeeeeeeee.dash'
      el.append(name)
    })
    const fits = await chip.evaluate((el) => {
      const cell = el.closest('td')!.getBoundingClientRect()
      const card = el.closest('tr')!.getBoundingClientRect()
      return cell.right <= card.right + 0.5
    })
    expect(fits, 'the cell stays inside its card').toBe(true)
    expect(await horizontalOverflow(page), 'sideways overflow in px').toBeLessThanOrEqual(0)
  })
})

test.describe('Address summary on a phone', () => {
  test('keeps the figures in one block, the QR code behind a button, and the history close @IN-06 @HY-08', async ({
    page,
  }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto(`/address/${MAINNET_ADDRESS}`)
    const summary = page.locator('[data-address-summary]')
    await expect(summary).toContainText('Balance')
    await expect(page.getByText('Watching for new transactions on this address.')).toBeVisible()
    await expect(page.locator('#address-qr')).toBeHidden()
    await expect(page.locator('#address-qr img')).toHaveCount(0)
    const toggle = page.getByRole('button', { name: 'Show QR code' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.locator('#address-qr')).toBeVisible()
    await page.getByRole('button', { name: 'Hide QR code' }).click()
    await expect(page.locator('#address-qr')).toBeHidden()
    const first = page.locator('#history tbody tr').first()
    await expect(first).toBeVisible()
    const top = await first.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    expect(top).toBeLessThan(2 * 844)
  })

  test('shows no QR button and keeps the QR card on desktop @IN-06', async ({ page }) => {
    test.skip(onPhone(page), 'desktop layout only')
    await page.goto(`/address/${MAINNET_ADDRESS}`)
    await expect(page.getByRole('heading', { name: 'QR code' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show QR code' })).toHaveCount(0)
  })
})

test.describe('First and last seen from Insight', () => {
  test('shows both dates on a testnet address, labelled as Insight @HY-19 @IN-16 @HY-08', async ({
    page,
  }) => {
    await page.goto(`/address/${TESTNET_ADDRESS}?network=testnet`)
    const seen = page.locator('[data-address-summary] [data-seen]')
    await expect(seen).toContainText('First:')
    await expect(seen).toContainText('Last:')
    await expect(seen).toContainText('9 Feb 2026')
    const card = page.locator('section, article').filter({ has: seen }).last()
    await expect(card.getByText('Indexed by Insight').first()).toBeVisible()
  })
})

test.describe('Rich list on a phone', () => {
  test('starts the concentration chart in the first screen @HY-09', async ({ page }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto('/rich-list')
    const note = page.locator('[data-share-basis]')
    await expect(note).toBeVisible()
    await expect(note.locator('summary')).toContainText('Shares are of the circulating supply')
    const chart = page.getByRole('img', { name: /Share of the supply held by the top/ })
    await expect(chart).toBeVisible()
    const top = await chart.evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBeLessThan(844)
  })
})

test.describe('Governance filters', () => {
  test('filters by name or hash and by status, with the counts shown @HY-13', async ({ page }) => {
    await page.goto('/governance')
    const box = page.getByRole('searchbox', { name: 'Filter proposals by name or hash' })
    await expect(box).toBeVisible()
    const result = page.locator('[data-filter-result]')
    await box.fill('no-such-proposal-zzz')
    await expect(result).toContainText(/^0 of \d+ proposals match/)
    await expect(page.getByText('No proposals match')).toBeVisible()
    await box.fill('')
    const funded = page
      .getByRole('group', { name: 'Filter proposals by status' })
      .getByRole('button', { name: /^Funded/ })
    await funded.click()
    await expect(funded).toHaveAttribute('aria-pressed', 'true')
    await expect(result).toContainText(/\d+ of \d+ proposals match/)
  })

  test('groups the yes, no, abstain and threshold figures under one header @HY-13', async ({
    page,
  }) => {
    test.skip(onPhone(page), 'the table header is a desktop layout')
    await page.goto('/governance')
    await expect(page.getByRole('columnheader', { name: 'Votes' }).first()).toBeVisible()
  })

  test('lists each proposal’s votes on one line on a phone @HY-13', async ({ page }) => {
    test.skip(!onPhone(page), 'phone layout only')
    await page.goto('/governance')
    const line = page.locator('.rx-propline').first()
    await expect(line).toBeVisible()
    await expect(line).toContainText(/yes/)
  })
})

test.describe('Blocks per page', () => {
  test('lists 20, 50 or 100 blocks of a day from the index and keeps the size in the URL @IN-02', async ({
    page,
  }) => {
    await page.goto('/blocks?date=2026-11-03')
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(20)
    const group = page.getByRole('group', { name: 'Blocks per page' })
    await group.getByRole('button', { name: '50' }).click()
    await expect(page).toHaveURL(/size=50/)
    await expect(rows).toHaveCount(50)
    await group.getByRole('button', { name: '100' }).click()
    await expect(page).toHaveURL(/size=100/)
    await expect(rows).toHaveCount(100)
    await expect(page.getByRole('link', { name: 'Older' })).toHaveAttribute('href', /size=100/)
  })

  test('opens straight at a size from the URL on the newest page @IN-02', async ({ page }) => {
    await page.goto('/blocks?size=50')
    await expect(page.locator('tbody tr')).toHaveCount(50)
    await expect(page.locator(`a[href="/block/${TIP}"]`).first()).toBeVisible()
  })
})

test.describe('every route on a phone', () => {
  for (const route of ROUTE_CASES) {
    const net = casesNets(route)[0]!
    test(`${net} ${route.path} fits a phone: no sideways scroll, cards for tables, nothing under the navigation @X-08`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone-light', 'phone-light reads the layout')
      await page.goto(withQuery(route.path, networkQuery(net)))
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await settled(page)
      await expect
        .poll(() => horizontalOverflow(page), { message: 'sideways overflow in px' })
        .toBeLessThanOrEqual(0)

      const stiff = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.rx-table--cards')]
          .filter((table) => table.getBoundingClientRect().width > 0)
          .filter((table) => getComputedStyle(table.querySelector('thead')!).display !== 'none')
          .map((table) => table.closest('[id]')?.id ?? table.getAttribute('aria-label') ?? 'table'),
      )
      expect(stiff, 'tables that keep their header row instead of becoming cards').toEqual([])

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(100)
      const covered = await page.evaluate(() => {
        const last = document.querySelector('main')
        if (!last) return []
        const whole = last.getBoundingClientRect()
        const end = new DOMRect(whole.x, whole.bottom - 48, whole.width, 48)
        const overlaps = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
        return [...document.body.querySelectorAll<HTMLElement>('*')]
          .filter((el) => {
            const style = getComputedStyle(el)
            const pinned = style.position === 'fixed' || style.position === 'sticky'
            const rect = el.getBoundingClientRect()
            return (
              pinned &&
              style.pointerEvents !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0 &&
              !el.contains(last) &&
              !last.contains(el) &&
              overlaps(rect, end)
            )
          })
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`)
      })
      expect(covered, 'fixed or sticky elements over the end of the page').toEqual([])
    })
  }
})
