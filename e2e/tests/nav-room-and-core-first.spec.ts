import { settled } from '../helpers/settled'
import { tabBarHeight } from '../helpers/contrast'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const TRANSFER = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const COINBASE = 'ff1ebb495704b3ef38bc23c85076b3282af81bcc564c8aea492b0413ab290328'

test.describe('section rail room on phones', () => {
  for (const width of [320, 390, 430]) {
    for (const path of ['/blocks', '/tools/qr']) {
      test(`the unit switch sits outside the rail at ${width} px on ${path} @HY-18 @IN-12`, async ({
        page,
      }, testInfo) => {
        test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
        await page.setViewportSize({ width, height: 844 })
        await page.goto(path)
        const rail = page.locator('nav[data-section-nav]')
        await expect(rail).toBeVisible()
        const unit = page.locator('[data-unit-switch] select:visible')
        await expect(unit).toHaveCount(1)
        const [r, u, container] = await Promise.all([
          rail.boundingBox(),
          unit.boundingBox(),
          page.locator('main').boundingBox(),
        ])
        expect(u!.y, 'the unit switch is on its own line under the rail').toBeGreaterThanOrEqual(
          r!.y + r!.height - 1,
        )
        expect(r!.width, 'the rail has the full content width').toBeGreaterThanOrEqual(
          container!.width - 40,
        )
        expect(u!.x + u!.width).toBeLessThanOrEqual(width)
        const fits = await rail.evaluate((el) => ({
          end: (el as HTMLElement).dataset.moreEnd,
          overflows: el.scrollWidth > el.clientWidth + 1,
          mask: getComputedStyle(el).maskImage,
        }))
        if (fits.overflows) {
          expect(fits.end, 'a cropped rail keeps its fade cue').toBe('true')
          expect(fits.mask).not.toBe('none')
        }
      })
    }
  }

  for (const width of [320, 390, 430]) {
    test(`the unit switch has a hit area of at least 44 px at ${width} px, answering a tap below its visible chip @IN-12 @HY-16 @HY-18`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/blocks')
      const unit = page.locator('[data-unit-switch] select:visible')
      await expect(unit).toHaveCount(1)
      const box = (await unit.boundingBox())!
      expect(box.height, 'hit area height').toBeGreaterThanOrEqual(44)
      expect(box.width, 'hit area width').toBeGreaterThanOrEqual(44)
      for (const dy of [2, box.height - 2]) {
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x!, y!)?.tagName,
          [box.x + box.width / 2, box.y + dy],
        )
        expect(hit, `a tap ${dy} px into the hit area reaches the select`).toBe('SELECT')
      }
      await unit.selectOption('duffs')
      await expect(unit).toHaveValue('duffs')
    })
  }

  for (const path of [
    '/blocks',
    '/mempool',
    '/rich-list',
    '/charts',
    '/masternodes',
    '/tools/qr',
  ]) {
    test(`the unit switch's hit area covers nothing tappable on ${path} @IN-12 @HY-16 @HY-18`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)
      const unit = page.locator('[data-unit-switch] select:visible')
      await expect(unit).toHaveCount(1)
      await settled(page)
      const box = (await unit.boundingBox())!
      const beneath = await unit.evaluate(
        (el, [x, y]) => {
          const select = el as HTMLElement
          select.style.pointerEvents = 'none'
          const under = document.elementFromPoint(x!, y!)
          select.style.pointerEvents = ''
          return (
            under?.closest('a, button, input, select, summary, [role="button"]')?.tagName ?? null
          )
        },
        [box.x + box.width / 2, box.y + box.height - 3],
      )
      expect(beneath, 'what lies under the lower edge of the hit area').toBeNull()
    })
  }

  test('shows Blocks, Mempool, Rich list, Charts and part of Governance at 390 px @HY-18', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/blocks')
    const rail = page.locator('nav[data-section-nav="core"]')
    await expect(rail).toBeVisible()
    const box = await rail.boundingBox()
    const link = (name: string) => page.getByRole('link', { name, exact: true }).first()
    for (const name of ['Blocks', 'Mempool', 'Rich list', 'Charts']) {
      const b = await link(name).boundingBox()
      expect(b!.x + b!.width, `${name} is inside the rail`).toBeLessThanOrEqual(
        box!.x + box!.width + 1,
      )
    }
    const governance = await link('Governance').boundingBox()
    expect(governance!.x, 'Governance starts inside the rail').toBeLessThan(
      box!.x + box!.width - 24,
    )
  })
})

test.describe('Core figures first on the home page', () => {
  test('sit directly under the hero plate content, before the lanes, on desktop @HY-01 @HY-03', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
    await page.goto('/')
    await settled(page)
    const headline = page.locator('.rx-scope [data-headline]')
    await expect(headline.locator('.rx-stat')).toHaveCount(4)
    const [h, pulse, lanes] = await Promise.all([
      headline.boundingBox(),
      page.locator('.rx-pulse').boundingBox(),
      page.locator('.rx-lanes').boundingBox(),
    ])
    expect(h!.y, 'right under the pulse cards').toBeLessThan(pulse!.y + pulse!.height + 40)
    expect(h!.y + h!.height).toBeLessThanOrEqual(lanes!.y)
    expect(h!.y + (await page.evaluate(() => scrollY)), 'within the first screen').toBeLessThan(900)
    for (const label of ['Height', 'Difficulty', 'Circulating supply', 'Blockchain size']) {
      await expect(headline).toContainText(label)
    }
    await expect(page.locator('#core'), 'the pending list is a column of the activity').toHaveCount(
      0,
    )
    await expect(page.locator('.rx-activity__grid > .rx-card')).toHaveCount(3)
  })

  for (const [name, path] of [
    ['mainnet', '/'],
    ['testnet', '/?network=testnet'],
  ] as const) {
    test(`keeps the latest activity heading on the first desktop screen on ${name} @IN-01 @HY-03 @IN-16`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.goto(path)
      const heading = page.locator('#h-latest')
      await expect(heading).toBeVisible()
      await settled(page)
      await expect(page.locator('.rx-lane .rx-blk').first()).toBeVisible()
      const top = () =>
        heading.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY))
      await expect.poll(top, { message: 'heading top' }).toBeLessThan(900 - 24)
      const box = (await heading.boundingBox())!
      expect(box.y + box.height, 'the whole heading is inside 900 px').toBeLessThanOrEqual(900)
      const strip = (await page.locator('.rx-scope [data-headline]').boundingBox())!
      expect(strip.height, 'the Core figures are one compact strip').toBeLessThan(80)
      await expect(page.locator('.rx-scope [data-headline] .rx-stat')).toHaveCount(4)
    })
  }

  for (const width of [320, 390, 430]) {
    test(`sit within two screens of the top at ${width} px, with the first view intact @HY-01 @HY-03`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await settled(page)
      const barTop = 844 - (await tabBarHeight(page))
      for (const part of ['.rx-pulse__value', '.rx-pulse__meta']) {
        const b = await page.locator(`[data-pulse="core"] ${part}`).boundingBox()
        expect(b!.y + b!.height, `Core ${part} above the tab bar`).toBeLessThanOrEqual(barTop)
      }
      await expect(page.locator('.rx-maplegend')).toBeVisible()
      const headline = page.locator('.rx-scope [data-headline]')
      const box = await headline.boundingBox()
      expect(box!.y + (await page.evaluate(() => scrollY))).toBeLessThan(844 * 2)
      expect(box!.y).toBeGreaterThan(0)
      const pending = await page.locator('#core').boundingBox()
      expect(box!.y, 'before the pending list').toBeLessThan(pending!.y)
      await page.getByRole('link', { name: 'Core figures' }).click()
      await expect(page).toHaveURL(/#core-figures$/)
      await expect.poll(async () => (await headline.boundingBox())?.y ?? -1).toBeLessThan(844 / 2)
    })
  }

  test('keeps the Platform-locked-to-Core line on a phone, without costing a line @IN-01', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.goto('/')
    await settled(page)
    const title = page.locator('#h-lanes')
    await expect(title).toHaveAttribute('title', 'Each Platform block is locked to a Core block.')
    const caption = page.locator('.rx-lanes__short')
    await expect(caption).toBeVisible()
    const [t, c, live] = await Promise.all([
      title.boundingBox(),
      caption.boundingBox(),
      page.locator('.rx-lanes__head .rx-live').boundingBox(),
    ])
    expect(
      Math.abs(c!.y + c!.height / 2 - (t!.y + t!.height / 2)),
      'on the title line',
    ).toBeLessThan(12)
    expect(c!.x + c!.width, 'clear of the live control').toBeLessThanOrEqual(live!.x)
  })
})

test.describe('sources show their sync on the row', () => {
  test('the heights and lag are visible without opening a disclosure on a phone @IN-09', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.goto('/status')
    const list = page.getByRole('list', { name: 'Sources' })
    await expect(list).toBeVisible()
    await settled(page)
    for (const source of ['dapi', 'radar', 'pe', 'hyphen']) {
      const row = list.locator(`[data-source-row="${source}"]`)
      await expect(row.locator('[data-source-lag]')).toBeVisible()
    }
    for (const source of ['dapi', 'hyphen']) {
      const details = list.locator(`[data-source-row="${source}"] details`)
      expect(await details.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false)
    }
    await expect(list.locator('[data-source-row="hyphen"] [data-source-sync]')).toContainText(
      /Indexed to Core block/,
    )
    await expect(list.locator('[data-source-row="pe"] [data-source-sync]')).toContainText(
      /Indexed to Platform block/,
    )
    await expect(
      list.locator('[data-source-row="hyphen"] details summary'),
      'latency stays behind the disclosure',
    ).toContainText(/Median answer|Details/)
  })

  test('also shows them on the row on desktop @IN-09', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
    await page.goto('/status')
    const list = page.getByRole('list', { name: 'Sources' })
    await settled(page)
    await expect(list.locator('[data-source-row="hyphen"] [data-source-sync]')).toBeVisible()
    await expect(list.locator('[data-source-row="hyphen"] [data-source-lag]')).toBeVisible()
  })
})

test.describe('transaction inputs and outputs fit their cards', () => {
  for (const [name, txid] of [
    ['a transfer', TRANSFER],
    ['a coinbase', COINBASE],
  ] as const) {
    test(`from 641 px up for ${name} @IN-14`, async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop widths')
      for (const width of [641, 768, 901, 1024, 1099, 1100, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/tx/${txid}`)
        await expect(page.locator('#io')).toBeVisible()
        await settled(page)
        const tables = await page.locator('.rx-io .rx-card').evaluateAll((cards) =>
          cards.map((card) => {
            const box = card.getBoundingClientRect()
            const table = card.querySelector('table')?.getBoundingClientRect()
            const holder = card.querySelector('table')?.parentElement
            return {
              spill: table ? Math.max(0, Math.round(table.right - box.right)) : 0,
              scroll: holder ? holder.scrollWidth - holder.clientWidth : 0,
            }
          }),
        )
        for (const t of tables) {
          expect(t.spill, `table spills its card at ${width} px`).toBeLessThanOrEqual(1)
          expect(t.scroll, `card scrolls sideways at ${width} px`).toBeLessThanOrEqual(1)
        }
      }
    })
  }
})
