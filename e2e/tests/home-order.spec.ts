import { settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const NETWORKS = [
  ['mainnet', '/'],
  ['testnet', '/?network=testnet'],
] as const

test.describe('one home order for eyes and keyboard', () => {
  for (const [name, path] of NETWORKS) {
    test(`shows the three activity columns and a first row of each on the first desktop screen on ${name} @IN-01 @HY-03 @IN-16`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.goto(path)
      await expect(page.locator('#h-latest')).toBeVisible()
      await settled(page)
      const viewportHeight = await page.evaluate(() => window.innerHeight)
      const columns = page.locator('.rx-activity__grid > .rx-card')
      await expect(columns).toHaveCount(3)
      const titles = await columns.locator('.rx-card__title').allTextContents()
      expect(titles.map((t) => t.trim())).toEqual([
        'Core blocks',
        'Platform transitions',
        'Pending transactions',
      ])
      const boxes = await columns.evaluateAll((cards) =>
        cards.map((card) => {
          const rect = (el: Element | null) => {
            const r = el?.getBoundingClientRect()
            return r ? { top: r.top, bottom: r.bottom, left: r.left } : null
          }
          const first = card.querySelector('tbody tr') ?? card.querySelector('.rx-empty__t')
          return {
            card: rect(card),
            heading: rect(card.querySelector('.rx-card__title')),
            first: rect(first),
            note: card.querySelector('.rx-empty__b') !== null,
          }
        }),
      )
      boxes.forEach((b, i) => {
        expect(
          b.heading!.bottom,
          `column ${i} heading inside the first screen`,
        ).toBeLessThanOrEqual(viewportHeight)
        expect(b.first, `column ${i} has a first row or note`).not.toBeNull()
        expect(
          b.first!.bottom,
          `column ${i} first row inside the first screen`,
        ).toBeLessThanOrEqual(viewportHeight)
        expect(Math.abs(b.card!.top - boxes[0]!.card!.top), `column ${i} is level`).toBeLessThan(2)
      })
      expect(boxes[0]!.card!.left).toBeLessThan(boxes[1]!.card!.left)
      expect(boxes[1]!.card!.left).toBeLessThan(boxes[2]!.card!.left)
      if (name === 'testnet') {
        await expect(columns.nth(2)).toContainText(/since you opened this page/)
      } else {
        expect(boxes[2]!.note).toBe(false)
        expect(await columns.nth(2).locator('tbody tr').count()).toBeGreaterThanOrEqual(1)
      }
      await expect(columns.nth(2).getByRole('link', { name: 'Mempool' })).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0)
    })
  }

  for (const [name, path] of NETWORKS) {
    test(`shows size, the reported pool and "tx" counts on the Core rows, and size on the pending rows, in the first desktop screen on ${name} @IN-01 @HY-03`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.goto(path)
      await expect(page.locator('#h-latest')).toBeVisible()
      await settled(page)
      const viewportHeight = await page.evaluate(() => window.innerHeight)
      const columns = page.locator('.rx-activity__grid > .rx-card')
      const rows = (card: number) =>
        columns
          .nth(card)
          .locator('tbody tr')
          .first()
          .evaluate((tr) => {
            const pseudo = (td: Element, which: '::before' | '::after') => {
              const c = getComputedStyle(td, which).content
              return c === 'none' || c === 'normal' ? '' : c.replace(/^"|"$/g, '')
            }
            return {
              bottom: tr.getBoundingClientRect().bottom,
              cells: [...tr.querySelectorAll('td')]
                .filter((td) => td.getBoundingClientRect().width > 0)
                .map((td) =>
                  `${pseudo(td, '::before')}${td.textContent?.trim() ?? ''}${pseudo(td, '::after')}`
                    .replace(/\s+/g, ' ')
                    .trim(),
                ),
            }
          })
      const size = /^[\d.,]+ (B|kB|MB)$/
      const core = await rows(0)
      expect(core.bottom, 'first Core row inside the first screen').toBeLessThanOrEqual(
        viewportHeight,
      )
      expect(
        core.cells.some((c) => /^[\d,]+ tx$/.test(c)),
        'the count carries its unit',
      ).toBe(true)
      expect(
        core.cells.some((c) => size.test(c)),
        'the size is shown',
      ).toBe(true)
      expect(
        core.cells.some((c) => /^Mined by \S/.test(c)),
        'the reported pool is shown',
      ).toBe(name === 'mainnet')
      if (name === 'mainnet') {
        const pending = await rows(2)
        expect(pending.bottom).toBeLessThanOrEqual(viewportHeight)
        expect(
          pending.cells.some((c) => size.test(c)),
          'the pending size is shown',
        ).toBe(true)
        expect(pending.cells.some((c) => c.endsWith('DASH'))).toBe(true)
      }
    })
  }

  test('links the charts from the Latest activity header on desktop @IN-01 @HY-02', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
    await page.goto('/')
    await expect(page.locator('#h-latest')).toBeVisible()
    const link = page.locator('.rx-activity .rx-sec__head').getByRole('link', { name: 'Charts' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /\/charts/)
  })

  for (const width of [1024, 1100, 1280]) {
    test(`keeps the three columns inside their cards at ${width} px @IN-01 @HY-03`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.locator('#h-latest')).toBeVisible()
      await settled(page)
      const spill = await page.locator('.rx-activity__grid > .rx-card').evaluateAll((cards) =>
        cards.map((card) => {
          const table = card.querySelector('table')?.getBoundingClientRect()
          return table ? Math.round(table.right - card.getBoundingClientRect().right) : 0
        }),
      )
      for (const s of spill) expect(s).toBeLessThanOrEqual(0)
    })
  }

  for (const [name, path] of [
    ['mainnet', '/'],
    ['testnet', '/?network=testnet'],
  ] as const) {
    test(`sizes each activity card to its own rows instead of the tallest one on ${name} @IN-01`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
      await page.goto(path)
      await expect(page.locator('#h-latest')).toBeVisible()
      await settled(page)
      const cards = await page.locator('.rx-activity__grid > .rx-card').evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect()
          const last = el.lastElementChild!.getBoundingClientRect()
          return { top: box.top, height: box.height, blank: box.bottom - last.bottom }
        }),
      )
      expect(cards).toHaveLength(3)
      for (const c of cards) expect(c.blank, 'no empty area under the last row').toBeLessThan(40)
      for (const c of cards) expect(Math.abs(c.top - cards[0]!.top)).toBeLessThan(2)
    })
  }

  test('puts the pending list full width under the two block lists on a tablet @IN-01 @HY-03', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only')
    await page.setViewportSize({ width: 800, height: 900 })
    await page.goto('/')
    await expect(page.locator('#h-latest')).toBeVisible()
    await settled(page)
    const cards = page.locator('.rx-activity__grid > .rx-card')
    await expect(cards).toHaveCount(3)
    const [core, platform, pending] = await cards.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    )
    expect(Math.abs(core!.top - platform!.top)).toBeLessThan(2)
    expect(core!.left).toBeLessThan(platform!.left)
    expect(pending!.top, 'under both').toBeGreaterThanOrEqual(
      Math.max(core!.bottom, platform!.bottom) - 1,
    )
    expect(pending!.width, 'full width').toBeGreaterThan(core!.width + platform!.width)
  })

  for (const width of [320, 390, 430]) {
    test(`follows the page's order with the keyboard at ${width} px: timeline, then the pending band, then the block lists @IN-01 @HY-03 @HY-18`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await expect(page.locator('#lane-plat .rx-blk').first()).toBeVisible()
      await settled(page)
      const last = page.locator('#lane-plat a.rx-blk').last()
      await last.focus()
      const section = () =>
        page.evaluate(() => {
          const el = document.activeElement
          if (!el) return 'none'
          if (el.closest('.rx-scope')) return 'hero'
          if (el.closest('#core')) return 'pending'
          if (el.closest('.rx-home__activity')) return 'activity'
          return 'outside'
        })
      const seen: string[] = []
      for (let i = 0; i < 70; i++) {
        await page.keyboard.press('Tab')
        const s = await section()
        if (s === 'outside') break
        seen.push(s)
      }
      expect(seen[0], 'the next stop after the timeline is the pending band').toBe('pending')
      const rank = { hero: 0, pending: 1, activity: 2 } as const
      const ranks = seen.map((s) => rank[s as keyof typeof rank])
      expect(ranks, 'sections are reached in the order they are drawn').toEqual(
        [...ranks].sort((a, b) => a - b),
      )
      expect(seen).toContain('activity')
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
      await expect(page.locator('#h-latest')).toBeVisible()
      await settled(page)
      const report = await page.evaluate(() => {
        const home = document.querySelector('.rx-home')!
        const containers = [
          home,
          home.querySelector('.rx-home__activity')!,
          home.querySelector('.rx-activity__grid')!,
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
