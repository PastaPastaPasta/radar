import type { Locator, Page, TestInfo } from '@playwright/test'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const IDENTITY = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const isPhone = (info: TestInfo) => info.project.name.startsWith('phone')
const isDark = (info: TestInfo) => info.project.name.endsWith('dark')

const open = async (page: Page, target: string) => {
  await page.goto(target)
  await settled(page)
}

const box = async (el: Locator) => {
  const b = await el.boundingBox()
  if (!b) throw new Error('element has no box')
  return { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height, width: b.width }
}

/** Relative luminance of a computed colour, read through a canvas so any colour syntax works. */
const luminance = (page: Page, color: string) =>
  page.evaluate((c) => {
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    const lin = (v: number) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return { y: 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!), alpha: a! / 255 }
  }, color)

test.describe('Record header', () => {
  test('names and pictures an identity, with its key facts in the band @W2-41', async ({
    page,
  }) => {
    await open(page, `/identity/${IDENTITY}`)
    const band = page.locator('[data-record="identity"]')
    await expect(band.getByRole('heading', { level: 1 })).toHaveText('pshenmic.dash')
    await expect(page).toHaveTitle(/pshenmic\.dash/)
    await expect(
      band.locator('.rx-rec__face svg, .rx-rec__face canvas, .rx-rec__face img'),
    ).toBeVisible()
    await expect(band.locator('[data-record-id]')).toContainText(IDENTITY.slice(0, 6))
    await expect(band.locator('[data-record-facts] .rx-stat')).toHaveCount(2)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })

  test('gives an address the same header, named by its short form @W2-41', async ({ page }) => {
    await open(page, '/address/XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14')
    const band = page.locator('[data-record="address"]')
    await expect(band.getByRole('heading', { level: 1 })).toHaveText(/^Address XnT33zjr…\S+$/)
    await expect(page).toHaveTitle(/Address XnT33zjr/)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })
})

test.describe('Section rail', () => {
  test('marks the list a record belongs to as the current page @W2-44', async ({ page }) => {
    await open(page, `/identity/${IDENTITY}`)
    const rail = page.locator('.rx-secrail nav')
    const current = rail.locator('a[aria-current="page"]')
    await expect(current).toHaveCount(1)
    await expect(current).toHaveText('Identities')
  })

  test('keeps its scroll hints off the link text @W2-44', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the rail only scrolls on a phone')
    await open(page, `/identity/${IDENTITY}`)
    const nav = page.locator('.rx-secrail nav')
    await expect(nav).toHaveAttribute('data-more-end', 'true')
    const edge = await box(nav)
    const hint = await box(page.locator('.rx-secrail__hint--end'))
    expect(hint.left).toBeGreaterThanOrEqual(edge.right - hint.width - 1)
    const mask = await nav.evaluate((el) => {
      const s = getComputedStyle(el)
      return s.maskImage || s.getPropertyValue('-webkit-mask-image')
    })
    expect(mask).not.toBe('none')
  })
})

test.describe('Section grounds', () => {
  test('raise every second section of a long page on a band, with no sideways scroll @W2-42', async ({
    page,
  }) => {
    await open(page, '/platform')
    await expect(page.locator('.rx-page > .rx-sec--ruled').nth(2)).toBeVisible()
    const grounds = await page
      .locator('.rx-page > .rx-sec--ruled')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderImageSource !== 'none'))
    expect(grounds.length).toBeGreaterThanOrEqual(3)
    expect(grounds.slice(0, 3)).toEqual([false, true, false])
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })
})

test.describe('Governance', () => {
  test('shows every proposal name in full view of its status edge @W2-45', async ({ page }) => {
    await open(page, '/governance')
    const row = page.locator('.rx-proptable tbody[data-proposal] > tr').first()
    const name = row.locator('.rx-propname__label')
    await expect(name).toBeVisible()
    const edge = await box(row)
    const n = await box(name)
    expect(n.left).toBeGreaterThanOrEqual(edge.left + 8)
  })

  test('lists proposals as cards on a phone, with nothing to scroll sideways @W2-45', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'cards are the phone layout')
    await open(page, '/governance')
    const scroller = page.locator('.rx-tablescroll:has(.rx-proptable)')
    const [scroll, client] = await scroller.evaluate((el) => [el.scrollWidth, el.clientWidth])
    expect(scroll).toBeLessThanOrEqual(client + 1)
    await expect(page.locator('.rx-proptable thead')).not.toBeInViewport()
    // No name, however long, runs under its status or past the card.
    const fits = await page
      .locator('.rx-proptable tbody[data-proposal] > tr:first-child')
      .evaluateAll((rows) =>
        rows.every((row) => {
          const edge = row.getBoundingClientRect().right
          const status = row.querySelector('.rx-propstatus')!.getBoundingClientRect().left
          const name = row.querySelector('.rx-propname')!.getBoundingClientRect().right
          return name <= status + 0.5 && name <= edge + 0.5
        }),
      )
    expect(fits).toBe(true)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
    await page.locator('tbody[data-proposal] .rx-propname').first().click()
    await expect(page.locator('[data-proposal-details]')).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })
})

test.describe('Network internals', () => {
  test('plots each history as a chart the width of its card, with a named axis @W2-46', async ({
    page,
  }) => {
    await open(page, '/internals')
    const plots = page.locator('[data-internals-plot]')
    await expect(plots).toHaveCount(4)
    for (const id of ['hashrate', 'difficulty', 'utxos', 'transactions']) {
      const plot = page.locator(`[data-internals-plot="${id}"]`)
      await plot.scrollIntoViewIfNeeded()
      await expect(plot.locator('canvas').first()).toBeVisible()
      const p = await box(plot)
      const canvas = await box(plot.locator('canvas').first())
      expect(canvas.width).toBeGreaterThanOrEqual(p.width - 2)
    }
    await expect(page.locator('[data-share-bar] .rx-legend').first()).toBeVisible()
  })
})

test.describe('Tab bar', () => {
  test('keeps the current tab in view and fades the side with more tabs @W2-51', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'the tab bar only scrolls on a phone')
    await open(page, `/identity/${IDENTITY}?tab=transfers`)
    const tabs = page.locator('.rx-tabs')
    await expect(tabs).toHaveAttribute('data-more-start', 'true')
    const bar = await box(tabs)
    const current = await box(tabs.locator('a[aria-current]'))
    expect(current.left).toBeGreaterThanOrEqual(bar.left - 1)
    expect(current.right).toBeLessThanOrEqual(bar.right + 1)
    const mask = await tabs.evaluate((el) => {
      const s = getComputedStyle(el)
      return s.maskImage || s.getPropertyValue('-webkit-mask-image')
    })
    expect(mask).not.toBe('none')
  })
})

test.describe('Dark theme', () => {
  test('keeps a vote bar’s track visible against its ground @W2-47', async ({ page }, info) => {
    test.skip(!isDark(info), 'a dark-theme check')
    await open(page, '/protocol')
    const meter = page.locator('.rx-meter').first()
    await expect(meter).toBeVisible()
    const track = await meter.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect((await luminance(page, track)).alpha).toBeGreaterThanOrEqual(0.12)
  })

  test('draws a placeholder dimmer than a typed value @W2-62', async ({ page }, info) => {
    test.skip(!isDark(info), 'a dark-theme check')
    await open(page, '/governance')
    const input = page.getByRole('searchbox', { name: 'Filter proposals by name or hash' })
    await expect(input).toBeVisible()
    const [value, placeholder] = await input.evaluate((el) => [
      getComputedStyle(el).color,
      getComputedStyle(el, '::placeholder').color,
    ])
    const v = await luminance(page, value)
    const p = await luminance(page, placeholder)
    expect(p.y).toBeLessThan(v.y * 0.6)
  })
})
