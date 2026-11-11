import { expectAccessible } from '../helpers/a11y'
import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

test.describe('status', () => {
  test('shows the Core tip, the best ChainLock and every source @IN-09', async ({ page }) => {
    await page.goto('/status')
    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()

    await expect(page.getByText('Core tip', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Best ChainLock', { exact: true }).first()).toBeVisible()

    const sources = page.getByRole('heading', { name: 'Sources' })
    await expect(sources).toBeVisible()
    for (const name of ['DAPI', 'Hyphen', 'Platform Explorer', 'Radar']) {
      await expect(page.locator('main').getByText(name, { exact: false }).first()).toBeVisible()
    }
    await expect(page.getByText('DAPI request budget')).toBeVisible()
    await expectAccessible(page)
  })

  test("names the Core summary's source once, beside its heading @IN-09", async ({ page }) => {
    await page.goto('/status')
    const card = page.locator('#core')
    await expect(card.locator('[data-status="tip"]')).toContainText('2,570,')
    await expect(card.locator('[data-status="sync"]')).toBeVisible()
    await expect(card.locator('[data-source="dapi"]')).toHaveCount(1)
    await expect(card.locator('[data-source]').first()).toBeVisible()
  })

  test('source and freshness labels stay at least 12 px, 500 weight and AA contrast @IN-09', async ({
    page,
  }) => {
    for (const path of ['/status', '/', '/status?network=testnet']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settled(page)
      const labels = await page.evaluate(() => {
        const parse = (c: string) => c.match(/[\d.]+/g)!.map(Number)
        const lum = ([r, g, b]: number[]) => {
          const f = (x: number) =>
            (x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
        }
        const backdrop = (el: Element) => {
          for (let e: Element | null = el; e; e = e.parentElement) {
            const c = parse(getComputedStyle(e).backgroundColor)
            if (c.length < 4 || c[3]! > 0.5) return c
          }
          return [255, 255, 255]
        }
        return [...document.querySelectorAll('.rx-src, .rx-src time')]
          .filter((el) => (el as HTMLElement).offsetParent)
          .map((el) => {
            const cs = getComputedStyle(el)
            const a = lum(parse(cs.color))
            const b = lum(backdrop(el))
            return {
              size: parseFloat(cs.fontSize),
              weight: Number(cs.fontWeight),
              ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            }
          })
      })
      expect(labels.length, path).toBeGreaterThan(0)
      for (const l of labels) {
        expect(l.size, path).toBeGreaterThanOrEqual(12)
        expect(l.weight, path).toBeGreaterThanOrEqual(500)
        expect(l.ratio, path).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  test('works on testnet and says which network it is reading @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/status?network=testnet')
    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()
    await expect(page.getByText('Core tip', { exact: true }).first()).toBeVisible()
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
    await expectAccessible(page)
  })
})

test.describe('units and fiat', () => {
  test('offers DASH, mDASH, µDASH and duffs and remembers the choice @IN-12 @HY-16', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    const group = page.getByRole('group', { name: 'Unit for amounts' })
    const example = page.locator('#units').getByText(/Example/)

    for (const [unit, shown] of [
      ['mDASH', /1,234\.56\d*\s*mDASH/],
      ['µDASH', /1,234,567(\.\d+)?\s*µDASH/],
      ['duffs', /123,456,789\s*duffs/],
      ['DASH', /1\.2346\s*DASH/],
    ] as const) {
      await group.getByRole('button', { name: unit, exact: true }).click()
      await expect(group.getByRole('button', { name: unit, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(example).toHaveText(shown)
    }

    await group.getByRole('button', { name: 'duffs', exact: true }).click()
    await page.reload()
    await expect(page.locator('#units').getByText(/Example/)).toHaveText(/123,456,789\s*duffs/)
    await expectAccessible(page)
  })

  test('USD can be the primary unit on mainnet, with DASH after it, and is remembered @IN-12', async ({
    page,
  }) => {
    await page.goto('/settings')
    const group = page.getByRole('group', { name: 'Unit for amounts' })
    const example = page.locator('#units').getByText(/Example/)
    await group.getByRole('button', { name: 'USD', exact: true }).click()
    await expect(group.getByRole('button', { name: 'USD', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(example).toHaveText(/≈ \$[\d,.]+\s*\(1\.2346\s*DASH\)/)
    await expect(page.locator('[data-rate-note]').first()).toContainText(
      /Rate: ≈ \$[\d,.]+ per DASH/,
    )

    await page.reload()
    await expect(group.getByRole('button', { name: 'USD', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(example).toHaveText(/≈ \$[\d,.]+\s*\(1\.2346\s*DASH\)/)

    await page.goto('/blocks')
    const note = page.locator('footer, dashhq-footer').locator('[data-rate-note]')
    await expect(note).toContainText(/USD at ≈ \$[\d,.]+ per DASH, from /)
    await expect(note).toContainText('Price via Platform Explorer')
  })

  test('explains the amount order once, for the unit that is selected @IN-12 @HY-16', async ({
    page,
  }) => {
    await page.goto('/settings')
    const units = page.locator('#units')
    const group = page.getByRole('group', { name: 'Unit for amounts' })
    const example = units.getByText(/Example/)
    const contradicts = [/USD leads/, /always follows/]

    for (const unit of ['DASH', 'mDASH', 'µDASH', 'duffs']) {
      await group.getByRole('button', { name: unit, exact: true }).click()
      await expect(units).toContainText(`Amounts show in ${unit}.`)
      await expect(units).toContainText(`follows the amount in ${unit}`)
      await expect(units).not.toContainText('USD comes first')
      for (const text of contradicts) await expect(units.getByText(text)).toHaveCount(0)
      await expect(example).toHaveText(new RegExp(`^Example:\\s*[\\d,.]+\\s*${unit}`))
    }

    await group.getByRole('button', { name: 'USD', exact: true }).click()
    await expect(units).toContainText('USD comes first, with the DASH figure after it')
    await expect(units).toContainText('This choice doesn’t apply while USD comes first')
    await expect(units).not.toContainText('Amounts show in')
    await expect(units).not.toContainText('follows the amount in')
    for (const text of contradicts) await expect(units.getByText(text)).toHaveCount(0)
    await expect(example).toHaveText(/^Example:\s*≈ \$[\d,.]+\s*\(1\.2346\s*DASH\)/)
  })

  test('USD is not offered on testnet, which shows DASH there @IN-12 @IN-16', async ({ page }) => {
    await page.goto('/settings')
    await page
      .getByRole('group', { name: 'Unit for amounts' })
      .getByRole('button', { name: 'USD' })
      .click()

    await page.goto('/settings?network=testnet')
    const group = page.getByRole('group', { name: 'Unit for amounts' })
    await expect(group.getByRole('button', { name: 'USD' })).toBeDisabled()
    await expect(group.getByRole('button', { name: 'DASH', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('#units').getByText(/Example/)).not.toContainText('$')
    await expect(page.locator('[data-rate-note]')).toHaveCount(0)
  })

  test('fiat is a choice on mainnet and absent on testnet @IN-12 @HY-17', async ({ page }) => {
    await page.goto('/settings')
    const toggle = page.getByRole('checkbox', { name: /USD value/ })
    await expect(toggle).toBeVisible()
    await toggle.check()
    await page.reload()
    await expect(page.getByRole('checkbox', { name: /USD value/ })).toBeChecked()

    await page.goto('/settings?network=testnet')
    await expect(page.getByText(/never show USD/)).toBeVisible()
    await expect(page.locator('#units').getByText(/Example/)).not.toContainText('$')
    await expect(page.locator('#units').getByText(/Example/)).toContainText('tDASH')
  })
})

test.describe('testnet is unmistakable', () => {
  test('a coloured 4 px frame and a Testnet label frame every page @HY-17', async ({ page }) => {
    await page.goto('/status')
    await expect(page.locator('[data-testnet-keyline]')).toHaveCount(0)

    await page.goto('/status?network=testnet')
    const frame = page.locator('[data-testnet-keyline]')
    await expect(frame).toBeAttached()
    await expect(page.locator('[data-testnet-label]')).toHaveText('Testnet')
    const frameStyle = await frame.evaluate((el) => {
      const s = getComputedStyle(el)
      return { width: s.borderTopWidth, color: s.borderTopColor }
    })
    expect(frameStyle.width).toBe('4px')
    expect(frameStyle.color).not.toBe('rgba(0, 0, 0, 0)')

    await page.goto('/blocks?network=testnet')
    await expect(page.locator('[data-testnet-label]')).toHaveText('Testnet')
  })

  test('a devnet gets a dashed frame with its own name @HY-17', async ({ page }) => {
    await page.goto('/status?network=devnet-qa')
    await expect(page.locator('[data-testnet-keyline="dev"]')).toBeAttached()
    await expect(page.locator('[data-testnet-label]')).toHaveText('Devnet qa')
  })
})

test.describe('phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 600, 'phone layout only')

  test('status and settings need no sideways scroll and keep the tabs reachable @HY-18', async ({
    page,
  }) => {
    for (const path of ['/status', '/settings', '/status?network=testnet']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
      const nav = page.getByRole('navigation', { name: 'Radar' })
      await expect(nav.getByRole('link', { name: 'Core' })).toBeVisible()
    }
  })
})
