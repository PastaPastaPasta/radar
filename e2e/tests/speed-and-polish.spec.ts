import { expectAccessible } from '../helpers/a11y'
import type { Page } from '@playwright/test'
import { settled } from '../helpers/settled'
import { tabBarHeight } from '../helpers/contrast'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const TRANSFER = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const TIP = 2570085
const FIRST_CHUNK = 4
const NEXT_CHUNK = 8

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) <= 640

/** Whether anything is drawn in the outermost pixel column of a canvas, and whether the canvas shows anything at all. */
function canvasEdges(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLCanvasElement>('.rx-chart__view canvas')].map((c) => {
      const ctx = c.getContext('2d')!
      const alpha = (x: number, w: number) => {
        const data = ctx.getImageData(x, 0, w, c.height).data
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) return true
        return false
      }
      return { drawn: alpha(0, c.width), rightEdgeInk: alpha(c.width - 1, 1) }
    }),
  )
}

test.describe('last axis tick', () => {
  for (const [width, label] of [
    [null, 'the project width'],
    [320, '320 px'],
  ] as const) {
    test(`stays inside every chart at ${label} on every range @HY-02`, async ({ page }) => {
      if (width) await page.setViewportSize({ width, height: 844 })
      for (const range of ['1d', '1w', '1m']) {
        await page.goto(`/charts?range=${range}`)
        await expect(page.getByRole('heading', { level: 1, name: 'Charts' })).toBeVisible()
        await settled(page)
        await expect
          .poll(async () => (await canvasEdges(page)).filter((c) => c.drawn).length, {
            message: `charts drawn on ${range}`,
          })
          .toBe(6)
        // Let the entry animation finish so the labels are in place.
        await page.waitForTimeout(700)
        for (const edge of await canvasEdges(page)) {
          expect(edge.rightEdgeInk, `ink on the right edge of a chart on ${range}`).toBe(false)
        }
      }
    })
  }
})

/**
 * Holds calls to one method of the Core façade until the spec lets them go. A call is known by a number read from its
 * second argument: a row count for `blockRows`, a time for `heightAtTime`. Calls whose number is `pass` go straight through.
 */
async function holdCore(
  page: Page,
  method: 'blockRows' | 'heightAtTime',
  pass?: number,
): Promise<(key: number) => Promise<void>> {
  await page.addInitScript(
    ([name, free]) => {
      type Core = Record<string, (...args: unknown[]) => Promise<unknown>>
      const w = window as unknown as {
        __radarCore?: Core
        __held: { key: number; release: () => void }[]
      }
      w.__held = []
      let core: Core | undefined
      Object.defineProperty(w, '__radarCore', {
        configurable: true,
        get: () => core,
        set(value: Core | undefined) {
          core = value
          const original = value?.[name]
          if (!value || !original) return
          value[name] = async (...args) => {
            const arg = args[1] as number | { count: number }
            const key = typeof arg === 'number' ? arg : arg.count
            if (key !== free) await new Promise<void>((release) => w.__held.push({ key, release }))
            return original.apply(value, args)
          }
        },
      })
    },
    [method, pass] as const,
  )
  return async (key) => {
    await expect
      .poll(() =>
        page.evaluate((k) => {
          const held = (window as unknown as { __held: { key: number; release: () => void }[] })
            .__held
          const at = held.findIndex((h) => h.key === k)
          if (at < 0) return false
          held.splice(at, 1)[0]!.release()
          return true
        }, key),
      )
      .toBe(true)
  }
}

test.describe('blocks of a day', () => {
  test('paints the first rows, then the rest in steps as each read arrives @IN-02', async ({
    page,
  }) => {
    const release = await holdCore(page, 'blockRows', FIRST_CHUNK)
    await page.goto('/blocks?date=2026-11-03')
    await expect(page.locator('tr[data-row-id]')).toHaveCount(FIRST_CHUNK)
    await expect(page.locator('[data-pending-row]')).toHaveCount(20 - FIRST_CHUNK)
    await expect(page.locator('a[href="/block/2566380"]').first()).toBeVisible()
    await release(NEXT_CHUNK)
    await expect(page.locator('tr[data-row-id]')).toHaveCount(FIRST_CHUNK + NEXT_CHUNK)
    await expect(page.locator('[data-pending-row]')).toHaveCount(20 - FIRST_CHUNK - NEXT_CHUNK)
    await release(NEXT_CHUNK)
    await expect(page.locator('tr[data-row-id]')).toHaveCount(20)
    await expect(page.locator('[data-pending-row]')).toHaveCount(0)
  })

  test('says how far the search for the day has come, and shows the day’s newest blocks before its start is found @IN-02', async ({
    page,
  }) => {
    const dayStart = Date.parse('2026-11-03T00:00:00Z')
    const dayEnd = dayStart + 86_400_000
    const release = await holdCore(page, 'heightAtTime')
    await page.goto('/blocks?date=2026-11-03')
    const progress = page.locator('[data-range-progress]')
    await expect(progress).toHaveAttribute('data-range-progress', '0')
    await expect(progress).toContainText('0 of 2 found')
    await expect(progress.getByRole('progressbar')).toHaveAttribute('value', '1')
    await expect(page.locator('tr[data-row-id]')).toHaveCount(0)

    await release(dayEnd)
    await expect(progress).toHaveAttribute('data-range-progress', '1')
    await expect(progress).toContainText('1 of 2 found')
    await expect(page.locator('a[href="/block/2566380"]').first()).toBeVisible()
    await expect(page.locator('tr[data-row-id]')).toHaveCount(FIRST_CHUNK)

    await release(dayStart)
    await expect(progress).toHaveCount(0)
    await expect(page.locator('tr[data-row-id]')).toHaveCount(20)
    await settled(page)
  })
})

test.describe('unit switch', () => {
  test('changes the unit where amounts are read and remembers it @IN-12 @HY-16', async ({
    page,
  }) => {
    await page.goto(`/tx/${TRANSFER}`)
    await expect(page.locator('[data-amount]').first()).toBeVisible()
    const control = page.locator('[data-unit-switch] select:visible')
    await expect(control).toHaveCount(1)
    await expect(control).toHaveValue('DASH')
    await control.selectOption('duffs')
    await expect(page.locator('.rx-amt .rx-u').filter({ hasText: 'DASH' })).toHaveCount(0)
    await expect(
      page
        .locator('.rx-colunit:visible, .rx-amt .rx-u:visible')
        .filter({ hasText: 'duffs' })
        .first(),
    ).toBeVisible()
    await page.reload()
    await expect(page.locator('[data-unit-switch] select:visible')).toHaveValue('duffs')
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: 'duffs', pressed: true })).toBeVisible()
  })

  test('is reachable on a phone without opening Settings, and keeps USD off testnet @IN-12 @HY-16', async ({
    page,
  }) => {
    await page.goto('/blocks?network=testnet')
    const control = page.locator('[data-unit-switch] select:visible')
    await expect(control).toHaveCount(1)
    await expect(control.locator('option[value="USD"]')).toHaveAttribute('disabled', '')
    const box = await control.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    if (isPhone(page)) {
      const barTop = 844 - (await tabBarHeight(page))
      expect(box!.y + box!.height).toBeLessThanOrEqual(barTop)
    }
  })
})

test.describe('phone home', () => {
  for (const width of [320, 390, 430]) {
    test(`shows the claim and the Core height on the first screen at ${width} px @IN-01 @HY-01`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await expect(page.locator('[data-pulse="core"] .rx-tick')).toContainText(/\d/)
      await settled(page)
      expect(await page.evaluate(() => window.scrollY)).toBe(0)
      const barTop = 844 - (await tabBarHeight(page))
      const claim = await page.getByRole('heading', { level: 1 }).boundingBox()
      const core = await page.locator('[data-pulse="core"]').boundingBox()
      expect(claim!.y + claim!.height, 'the claim comes first').toBeLessThanOrEqual(core!.y)
      expect(core!.y + core!.height).toBeLessThanOrEqual(barTop)
    })
  }
})

test.describe('block transactions on a phone', () => {
  test('are one line each, opened on tap @IN-03', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.goto(`/block/${TIP}`)
    const list = page.getByRole('list', { name: /Transactions in block 2,570,085/ })
    await expect(list).toBeVisible()
    const rows = list.getByRole('listitem')
    const first = rows.first()
    const second = rows.nth(1)
    const [a, b] = [await first.boundingBox(), await second.boundingBox()]
    expect(a!.height, 'a closed row is one line').toBeLessThan(60)
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height - 1)
    const toggle = first.locator('button[aria-expanded]')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(first.getByText('Inputs → outputs')).toBeVisible()
    await expect(first.getByRole('link')).toHaveAttribute('href', /\/tx\//)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1)
  })
})

test.describe('transaction inputs and outputs', () => {
  test('keep the amount unit in the column header and a gap before the state @IN-14', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop tables')
    await page.goto(`/tx/${TRANSFER}`)
    const outputs = page.locator('table.rx-table--colunit').nth(1)
    await expect(outputs).toBeVisible()
    await expect(outputs.locator('th .rx-colunit')).toHaveText('DASH')
    await expect(outputs.locator('td.e .rx-amt .rx-u').first()).toBeHidden()
    await settled(page)
    await expect
      .poll(
        async () => {
          const figure = await outputs.locator('td.e .rx-amt').first().boundingBox()
          const state = await outputs.locator('td.s > *').first().boundingBox()
          return state!.x - (figure!.x + figure!.width)
        },
        { message: 'gap between amount and state' },
      )
      .toBeGreaterThan(16)
    const rights = await outputs
      .locator('td.e .rx-amt')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().right)))
    expect(new Set(rights).size, 'amounts end on one edge').toBe(1)
  })
})

test.describe('sources on a phone', () => {
  test('are short rows with the explanation behind a disclosure @HY-12', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.goto('/status')
    const list = page.getByRole('list', { name: 'Sources' })
    await expect(list).toBeVisible()
    await settled(page)
    const row = list.locator('[data-source-row="dapi"]')
    const details = row.locator('details')
    await expect(details.locator('summary')).toBeVisible()
    const closed = await row.boundingBox()
    expect(closed!.height, 'a source is a short row').toBeLessThan(150)
    if (!(await details.evaluate((el: HTMLDetailsElement) => el.open))) {
      await details.locator('summary').click()
    }
    await expect(details.getByText(/\S/).nth(1)).toBeVisible()
  })
})

test.describe('section rail', () => {
  test('fades the cropped end and scrolls the current page into view @HY-18', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto('/status')
    const rail = page.locator('[data-section-nav="core"]')
    await expect(rail).toBeVisible()
    const info = await rail.evaluate((el) => ({
      overflows: el.scrollWidth > el.clientWidth + 1,
      end: (el as HTMLElement).dataset.moreEnd,
      start: (el as HTMLElement).dataset.moreStart,
      mask: getComputedStyle(el).maskImage,
      current: (() => {
        const a = el.querySelector('[aria-current="page"]')!.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return a.left >= r.left - 1 && a.right <= r.right + 1
      })(),
    }))
    expect(info.overflows).toBe(true)
    expect(info.current, 'the current page is fully inside the rail').toBe(true)
    expect(info.start === 'true' || info.end === 'true').toBe(true)
    expect(info.mask).not.toBe('none')
  })

  for (const width of [320, 390, 430]) {
    test(`fits the rail or shows a chevron where it scrolls, at ${width} px @HY-18`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/blocks')
      const rail = page.locator('nav[data-section-nav="core"]')
      await expect(rail).toBeVisible()
      const last = rail.getByRole('link').last()
      const inside = () =>
        last.evaluate((el) => {
          const a = el.getBoundingClientRect()
          const r = el.closest('nav')!.getBoundingClientRect()
          return a.left >= r.left - 1 && a.right <= r.right + 1
        })
      const overflows = await rail.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
      const endHint = page.locator('[data-rail-hint="end"]')
      const startHint = page.locator('[data-rail-hint="start"]')
      if (!overflows) {
        expect(await inside(), 'every label fits').toBe(true)
        await expect(endHint).toBeHidden()
        return
      }
      expect(await inside(), 'the last label is cut').toBe(false)
      await expect(endHint, 'a chevron says there is more').toBeVisible()
      const box = await endHint.boundingBox()
      const railBox = await rail.boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(railBox!.x + railBox!.width + 1)
      await rail.evaluate((el) => (el.scrollLeft = el.scrollWidth))
      await expect(endHint).toBeHidden()
      await expect(startHint).toBeVisible()
      expect(await inside(), 'scrolling reaches the last label').toBe(true)
      await expectAccessible(page)
    })
  }
})
