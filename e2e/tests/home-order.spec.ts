import { settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const NETWORKS = [
  ['mainnet', '/'],
  ['testnet', '/?network=testnet'],
] as const

const overflow = () => document.documentElement.scrollWidth - document.documentElement.clientWidth

test.describe('one home order for eyes and keyboard', () => {
  for (const [name, path] of NETWORKS) {
    test(`follows the hero with Dash Core and then Dash Platform, each with its lists side by side, on ${name} @IN-01 @HY-03 @IN-16`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.goto(path)
      await expect(page.getByRole('table', { name: 'Latest Core blocks' })).toBeVisible()
      await settled(page)
      const sections = page.locator('.rx-home > section')
      await expect(sections).toHaveCount(3)
      expect(
        await sections.evaluateAll((els: Element[]) => els.map((el) => el.id || el.className)),
      ).toEqual(['rx-hero', 'core', 'platform'])
      const tops = await sections.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().top),
      )
      expect(tops).toEqual([...tops].sort((x, y) => x - y))

      const core = page.locator('#core .rx-home__lists > .rx-card')
      await expect(core).toHaveCount(2)
      const titles = await core.locator('.rx-card__title').allTextContents()
      expect(titles.map((title) => title.trim())).toEqual(['Core blocks', 'Pending transactions'])
      const boxes = await core.evaluateAll((cards) =>
        cards.map((card) => {
          const r = card.getBoundingClientRect()
          const first = card.querySelector('tbody tr') ?? card.querySelector('.rx-empty__t')
          return { top: r.top, left: r.left, first: first !== null }
        }),
      )
      expect(Math.abs(boxes[0]!.top - boxes[1]!.top), 'the two lists are level').toBeLessThan(2)
      expect(boxes[0]!.left).toBeLessThan(boxes[1]!.left)
      for (const b of boxes) expect(b.first, 'a first row or a note').toBe(true)
      if (name === 'testnet') {
        await expect(core.nth(1)).toContainText(/since you opened this page/)
      } else {
        expect(await core.nth(1).locator('tbody tr').count()).toBeGreaterThanOrEqual(1)
      }
      await expect(core.nth(1).getByRole('link', { name: 'Mempool' })).toBeVisible()
      expect(await page.evaluate(overflow)).toBeLessThanOrEqual(0)
    })
  }

  for (const [name, path] of NETWORKS) {
    test(`shows transactions, size and the reported pool on the Core rows, and size on the pending rows, on ${name} @IN-01 @HY-03`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.goto(path)
      const blocks = page.getByRole('table', { name: 'Latest Core blocks' })
      await expect(blocks.locator('tbody tr').first()).toBeVisible()
      await settled(page)
      const headers = (await blocks.locator('thead th').allTextContents()).map((h) => h.trim())
      expect(headers, 'the pool column shows where any row names one').toEqual([
        'Block',
        'Age',
        'Txs',
        'Size',
        ...(name === 'mainnet' ? ['Mined by'] : []),
      ])
      const cells = (await blocks.locator('tbody tr').first().locator('td').allTextContents()).map(
        (c) => c.replace(/\s+/g, ' ').trim(),
      )
      const size = /^[\d.,]+ (B|kB|MB)$/
      expect(cells[2], 'the transaction count').toMatch(/^[\d,]+$/)
      expect(cells[3], 'the size').toMatch(size)
      if (name === 'mainnet') expect(cells[4], 'the reported pool').toMatch(/\S/)
      if (name === 'mainnet') {
        const pending = page.getByRole('table', { name: 'Pending transactions' })
        const row = (await pending.locator('tbody tr').first().locator('td').allTextContents()).map(
          (c) => c.replace(/\s+/g, ' ').trim(),
        )
        expect(
          row.some((c) => size.test(c)),
          'the pending size is shown',
        ).toBe(true)
        expect(row.some((c) => c.endsWith('DASH'))).toBe(true)
      }
    })
  }

  test('links the charts from the Dash Core header on desktop @IN-01 @HY-02', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
    await page.goto('/')
    await expect(page.locator('#h-core')).toBeVisible()
    const link = page.locator('#core .rx-sec__head').getByRole('link', { name: 'Charts' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /\/charts/)
  })

  for (const width of [1024, 1100, 1280, 1440, 1920]) {
    test(`keeps the map, the figures and every list inside the page at ${width} px @IN-01 @HY-03`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.locator('[data-map="nodes"] circle.mn').first()).toBeVisible()
      await expect(page.getByRole('table', { name: 'Latest Platform blocks' })).toBeVisible()
      await settled(page)
      expect(await page.evaluate(overflow), 'no sideways scroll').toBeLessThanOrEqual(0)
      const spill = await page.locator('.rx-home__lists > .rx-card').evaluateAll((cards) =>
        cards.map((card) => {
          const table = card.querySelector('table')?.getBoundingClientRect()
          return table ? Math.round(table.right - card.getBoundingClientRect().right) : 0
        }),
      )
      expect(spill).toHaveLength(4)
      for (const s of spill) expect(s).toBeLessThanOrEqual(0)
      const [copy, map] = await Promise.all([
        page.locator('.rx-hero__copy').boundingBox(),
        page.locator('.rx-hero__map .rx-map').boundingBox(),
      ])
      expect(map!.x, 'the map sits beside the words').toBeGreaterThan(copy!.x)
      expect(map!.width, 'and takes at least two fifths of the width').toBeGreaterThan(width * 0.4)
      const words = await page
        .locator('.rx-hero h1, .rx-hero__lede, [data-hero-figures] .rx-fig__value')
        .evaluateAll((els) =>
          els.map((el) => {
            const range = document.createRange()
            range.selectNodeContents(el)
            return range.getBoundingClientRect().right
          }),
        )
      for (const right of words) {
        expect(right, 'no words run under the map').toBeLessThanOrEqual(map!.x + 1)
      }
    })
  }

  for (const [name, path] of NETWORKS) {
    test(`sizes each list card to its own rows instead of the tallest one on ${name} @IN-01`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.goto(path)
      await expect(page.getByRole('table', { name: 'Latest Core blocks' })).toBeVisible()
      await settled(page)
      for (const id of ['core', 'platform']) {
        const cards = await page.locator(`#${id} .rx-home__lists > .rx-card`).evaluateAll((els) =>
          els.map((el) => {
            const box = el.getBoundingClientRect()
            const last = el.lastElementChild!.getBoundingClientRect()
            return { top: box.top, blank: box.bottom - last.bottom }
          }),
        )
        expect(cards).toHaveLength(2)
        for (const c of cards) expect(c.blank, 'no empty area under the last row').toBeLessThan(40)
        expect(Math.abs(cards[0]!.top - cards[1]!.top)).toBeLessThan(2)
      }
    })
  }

  test('stacks the map under the words, and each pair of lists, on a tablet @IN-01 @HY-03', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
    await page.setViewportSize({ width: 800, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('table', { name: 'Latest Core blocks' })).toBeVisible()
    await settled(page)
    const [copy, map] = await Promise.all([
      page.locator('.rx-hero__copy').boundingBox(),
      page.locator('.rx-hero__map .rx-map').boundingBox(),
    ])
    expect(map!.y, 'the map comes after the words').toBeGreaterThanOrEqual(copy!.y + copy!.height)
    expect(map!.width, 'at nearly the full width').toBeGreaterThan(800 * 0.85)
    const [blocks, pending] = await page
      .locator('#core .rx-home__lists > .rx-card')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))
    expect(pending!.top, 'pending under the blocks').toBeGreaterThanOrEqual(blocks!.bottom - 1)
    expect(await page.evaluate(overflow)).toBeLessThanOrEqual(0)
  })

  for (const width of [320, 390, 430]) {
    test(`follows the page's order with the keyboard at ${width} px: the hero, then Dash Core, then Dash Platform @IN-01 @HY-03 @HY-18`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await expect(page.getByRole('table', { name: 'Latest Platform blocks' })).toBeVisible()
      await settled(page)
      await page.locator('.rx-hero a').first().focus()
      const section = () =>
        page.evaluate(() => {
          const el = document.activeElement
          if (!el) return 'none'
          if (el.closest('.rx-hero')) return 'hero'
          if (el.closest('#core')) return 'core'
          if (el.closest('#platform')) return 'platform'
          return 'outside'
        })
      const seen: string[] = [await section()]
      for (let i = 0; i < 160; i++) {
        await page.keyboard.press('Tab')
        const s = await section()
        if (s === 'outside') break
        seen.push(s)
      }
      const rank = { hero: 0, core: 1, platform: 2 } as const
      const ranks = seen.map((s) => rank[s as keyof typeof rank])
      expect(ranks, 'sections are reached in the order they are drawn').toEqual(
        [...ranks].sort((x, y) => x - y),
      )
      expect(new Set(seen)).toEqual(new Set(['hero', 'core', 'platform']))
    })
  }

  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    test(`draws the home's sections in the order they sit in the page, with no CSS reordering, at ${width} px @IN-01 @HY-03 @HY-18`, async ({
      page,
    }, testInfo) => {
      test.skip(
        !testInfo.project.name.startsWith(width > 640 ? 'desktop' : 'phone'),
        'matching form factor only',
      )
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.getByRole('table', { name: 'Latest Platform blocks' })).toBeVisible()
      await settled(page)
      const report = await page.evaluate(() => {
        const home = document.querySelector('.rx-home')!
        const containers = [
          home,
          home.querySelector('.rx-hero')!,
          home.querySelector('.rx-hero__copy')!,
          home.querySelector('[data-hero-figures]')!,
          ...home.querySelectorAll('.rx-home__sec'),
          ...home.querySelectorAll('.rx-home__lists'),
        ]
        const sections = containers.flatMap((c) => [...c.children] as HTMLElement[])
        const problems: string[] = []
        for (const c of containers) {
          const cs = getComputedStyle(c)
          if (cs.flexDirection.includes('reverse'))
            problems.push(`${c.className}: ${cs.flexDirection}`)
        }
        for (const el of sections) {
          const cs = getComputedStyle(el)
          if (cs.order !== '0') problems.push(`${el.className || el.tagName}: order ${cs.order}`)
          if (cs.display === 'none') problems.push(`${el.className || el.tagName}: hidden`)
        }
        const visual = (group: Element) => {
          const kids = [...group.children].map((el) => el.getBoundingClientRect())
          return kids.every((r, i) => {
            const p = kids[i - 1]
            return !p || r.top > p.top - 1 || (Math.abs(r.top - p.top) < 2 && r.left >= p.left)
          })
        }
        const unordered = containers.filter((c) => !visual(c)).map((c) => c.className)
        return { problems, unordered }
      })
      expect(report.problems).toEqual([])
      expect(report.unordered, 'sections drawn in reading order').toEqual([])
    })
  }
})
