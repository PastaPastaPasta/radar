import { expectAccessible } from '../helpers/a11y'
import { lowContrastText } from '../helpers/contrast'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { casesNets, networkQuery, ROUTE_CASES, withQuery } from '../routes'
import { fetchesNothing, sourcesOf, type SiteSource } from '../helpers/site-map'

const BLOCK_HASH = '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6'
const TXID = 'e0028eb9648db56b1ac77cf090b99048a8007e2bb64b74b4a4cb7c4d8d6e6e47'

test.describe('routes', () => {
  for (const route of ROUTE_CASES) {
    for (const net of casesNets(route)) {
      test(`${net} ${route.path} shows its page, with no error, and fits the width @X-08 @X-09`, async ({
        page,
      }) => {
        await page.goto(withQuery(route.path, networkQuery(net)))

        await expect(page.getByRole('heading', { level: 1, name: route.h1 })).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Radar' })).toBeAttached()
        await settled(page)

        await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
        expect(await horizontalOverflow(page), 'sideways overflow in px').toBeLessThanOrEqual(0)
      })
    }
  }

  test('a route has no serious accessibility violations @X-08', async ({ page }) => {
    await page.goto('/masternodes')
    await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()

    await expectAccessible(page)
  })

  test('section pages are one tap from each other @X-08', async ({ page }) => {
    await page.goto('/blocks')

    const pages = page.getByRole('navigation', { name: 'Core pages' })
    await expect(pages.getByRole('link', { name: 'Blocks' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await pages.getByRole('link', { name: 'Charts' }).click()

    await expect(page).toHaveURL(/\/charts$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Charts' })).toBeVisible()
  })

  test('an unknown page says so and offers a way on @X-04', async ({ page }) => {
    await page.goto('/no/such/page')

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page.getByText('There is no page at /no/such/page')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Masternodes' })).toBeVisible()
  })
})

test.describe('first paint', () => {
  // The loader waits for a detail read for at most 1.5 s (DEFAULT_LOADER_DEADLINE_MS); a loader that
  // blocked first paint on it would show the shell that much after the read began.
  const LOADER_DEADLINE_MS = 1_500

  for (const [name, path] of [
    ['block', '/block/2569992'],
    ['transaction', `/tx/${TXID}`],
  ] as const) {
    test(`a cold deep link to a ${name} paints the shell without waiting for DAPI @X-08`, async ({
      page,
    }) => {
      // The test holds every Core block and transaction read until it releases them.
      await page.addInitScript(() => {
        const w = window as unknown as {
          __radarCore?: Record<string, (...args: unknown[]) => Promise<unknown>>
          __coreCallAt?: number
          __shellAt?: number
          __releaseCore: () => void
        }
        let release!: () => void
        const gate = new Promise<void>((resolve) => (release = resolve))
        w.__releaseCore = release
        let core: typeof w.__radarCore
        Object.defineProperty(w, '__radarCore', {
          configurable: true,
          get: () => core,
          set(value: typeof core) {
            core = value
            for (const method of ['block', 'tx'] as const) {
              const original = value?.[method]
              if (!value || !original) continue
              value[method] = async (...args) => {
                w.__coreCallAt ??= performance.now()
                await gate
                return original.apply(value, args)
              }
            }
          },
        })
        new MutationObserver((_, observer) => {
          if (document.querySelector('#root dashhq-bar')) {
            w.__shellAt = performance.now()
            observer.disconnect()
          }
        }).observe(document, { childList: true, subtree: true })
      })

      await page.goto(path, { waitUntil: 'commit' })
      await expect(page.locator('#root dashhq-bar')).toBeAttached({ timeout: 15_000 })
      const { shellAt, callAt } = await page.evaluate(() => {
        const w = window as unknown as { __shellAt?: number; __coreCallAt?: number }
        return { shellAt: w.__shellAt ?? Infinity, callAt: w.__coreCallAt }
      })
      expect(
        shellAt - (callAt ?? shellAt),
        'shell paint after the Core read began, in ms',
      ).toBeLessThan(LOADER_DEADLINE_MS / 2)

      await page.evaluate(() =>
        (window as unknown as { __releaseCore: () => void }).__releaseCore(),
      )
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    })
  }
})

test.describe('network', () => {
  test('mainnet is the default and testnet is marked @RA-91 @HY-17', async ({ page }) => {
    await page.goto('/status')
    await expect(page.getByRole('button', { name: /Network: Mainnet/ })).toBeVisible()
    await expect(page.locator('[data-testnet-keyline]')).toHaveCount(0)

    await page.goto('/status?network=testnet')
    await expect(page.getByRole('button', { name: /Network: Testnet/ })).toBeVisible()
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
    await expect(page.locator('html')).toHaveAttribute('data-network-kind', 'test')
  })

  test('the testnet keyline frames the page and never blocks it @HY-17', async ({ page }) => {
    await page.goto('/status?network=testnet')
    const keyline = page.locator('[data-testnet-keyline]')

    await expect(keyline).toBeAttached()
    const style = await keyline.evaluate((el) => {
      const s = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      return {
        pointer: s.pointerEvents,
        position: s.position,
        width: box.width,
        height: box.height,
        border: s.borderTopWidth,
        color: s.borderTopColor,
      }
    })
    expect(style.pointer).toBe('none')
    expect(style.position).toBe('fixed')
    expect(style.width).toBe(page.viewportSize()?.width)
    expect(style.border).toBe('4px')
    await expect(page.locator('[data-testnet-label]')).toHaveText('Testnet')
    expect(style.color).not.toBe('rgba(0, 0, 0, 0)')
    await page.getByRole('link', { name: 'Data sources' }).click()
    await expect(page).toHaveURL(/\/sources\?network=testnet$/)
  })

  test('switching network keeps the page and its query @X-03 @RA-91', async ({ page }) => {
    await page.goto('/masternodes?type=evo&q=1.2.3.4')

    await page.getByRole('button', { name: /Network: Mainnet/ }).click()
    await page
      .getByRole('navigation', { name: 'Network' })
      .getByRole('link', { name: 'Testnet' })
      .click()

    await expect(page).toHaveURL(/\/masternodes\?.*network=testnet/)
    await expect(page).toHaveURL(/type=evo/)
    await expect(page).toHaveURL(/q=1.2.3.4/)
    await expect(page.getByRole('button', { name: /Network: Testnet/ })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()
  })

  test('switching back to mainnet leaves no network in the link @X-03', async ({ page }) => {
    await page.goto('/platform?network=testnet')

    await page.getByRole('button', { name: /Network: Testnet/ }).click()
    await page
      .getByRole('navigation', { name: 'Network' })
      .getByRole('link', { name: 'Mainnet' })
      .click()

    await expect(page.getByRole('button', { name: /Network: Mainnet/ })).toBeVisible()
    await expect(page).toHaveURL(/\/platform$/)
  })

  test('switching on a record page says which network the record is on @X-03', async ({ page }) => {
    await page.goto(`/block/${BLOCK_HASH}`)

    await page.getByRole('button', { name: /Network: Mainnet/ }).click()

    await expect(page.getByText('This block is on Mainnet.')).toBeVisible()
  })

  test('an old ?net=testnet link opens the testnet view @RA-91 @X-04', async ({ page }) => {
    await page.goto('/masternodes?net=testnet')

    await expect(page).toHaveURL(/\/masternodes\?network=testnet$/)
    await expect(page.getByRole('button', { name: /Network: Testnet/ })).toBeVisible()
  })

  test('an old ?net=testnet link keeps testnet through redirects @RA-91 @X-04', async ({
    page,
  }) => {
    await page.goto('/validators?net=testnet')

    await expect(page).toHaveURL(/\/masternodes\?.*network=testnet/)
    await expect(page.getByRole('button', { name: /Network: Testnet/ })).toBeVisible()
  })

  test('network stays on in-page links @X-03', async ({ page }) => {
    await page.goto('/blocks?network=testnet')

    await page
      .getByRole('navigation', { name: 'Core pages' })
      .getByRole('link', { name: 'Mempool' })
      .click()

    await expect(page).toHaveURL(/\/mempool\?network=testnet$/)
  })

  test('a devnet Radar does not know asks for its addresses first @NX-75', async ({ page }) => {
    await page.goto('/sources?network=devnet-paloma')

    await expect(page.getByRole('heading', { name: 'Set up the paloma devnet' })).toBeVisible()
    await page.getByRole('button', { name: 'Use this devnet' }).click()
    await expect(page.getByRole('alert')).toContainText('at least one DAPI address')

    await page.getByLabel('DAPI addresses').fill('192.0.2.10:1443')
    await page.getByRole('button', { name: 'Use this devnet' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Data sources' })).toBeVisible()
    await expect(page.locator('[data-testnet-keyline="dev"]')).toBeAttached()
  })

  test('a page that needs Platform Explorer says it does not cover devnets @NX-75', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'radar.devnets',
        JSON.stringify([{ name: 'paloma', dapiAddresses: ['192.0.2.10:1443'] }]),
      )
    })
    await page.goto('/votes?network=devnet-paloma')

    await expect(page.getByText('Platform Explorer doesn’t cover devnets.')).toBeVisible()
  })
})

test.describe('theme', () => {
  test('follows the family theme cookie in both themes @HY-17', async ({ page, colorScheme }) => {
    await page.goto('/status')

    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme ?? 'light')
  })
})

test.describe('old paths', () => {
  test('old Radar Platform anchors land on the page that now holds them @X-04', async ({
    page,
  }) => {
    await page.goto('/platform#epochs')
    await expect(page).toHaveURL(/\/epochs$/)

    await page.goto('/platform?network=testnet#upgrade')
    await expect(page).toHaveURL(/\/protocol\?network=testnet$/)
  })

  test('/validators is the evonode list @X-04', async ({ page }) => {
    await page.goto('/validators')

    await expect(page).toHaveURL(/\/masternodes\?.*type=evo/)
    await expect(page).toHaveURL(/view=platform/)
    await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()
  })

  test('Insight-style block paths open the block @X-04', async ({ page }) => {
    await page.goto('/block-index/2569992')
    await expect(page).toHaveURL(/\/block\/2569992$/)

    await page.goto(`/insight/block/${BLOCK_HASH}`)
    await expect(page).toHaveURL(new RegExp(`/block/${BLOCK_HASH}$`))
  })
})

test.describe('phone navigation', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 600, 'phone layout only')

  test('the tab bar sits at the bottom and never covers the last content @X-08 @HY-18', async ({
    page,
  }) => {
    await page.goto('/blocks')
    await expect(page.getByRole('heading', { level: 1, name: 'Blocks' })).toBeVisible()
    await expect(page.getByRole('table', { name: /Core blocks/ })).toBeVisible()
    await settled(page)

    const tabs = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--dh-tabs-h, 0px)'
      document.body.append(probe)
      const height = probe.getBoundingClientRect().height
      probe.remove()
      return height
    })
    expect(tabs).toBeGreaterThan(30)

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const last = page.getByRole('button', { name: 'Keyboard shortcuts' })
    await last.scrollIntoViewIfNeeded()
    const box = await last.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      (viewport?.height ?? 0) - tabs + 1,
    )
  })

  test('the network menu opens inside the screen from 320 to 430 px and the header names the network @IN-16 @HY-17 @HY-18', async ({
    page,
  }) => {
    for (const width of [320, 340, 359, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 })
      for (const [path, name] of [
        ['/', 'Mainnet'],
        ['/?network=testnet', 'Testnet'],
      ] as const) {
        await page.goto(path)
        const button = page.locator('dashhq-bar button.net')
        await expect(button).toBeVisible()
        const where = `${width}px ${name}`
        const widthOf = (selector: string) => async () =>
          (await page.locator(selector).boundingBox())?.width ?? 0
        await expect(page.locator('dashhq-bar button.net .nl'), where).toHaveText(name)
        await expect
          .poll(widthOf('dashhq-bar button.net .nl'), { message: where })
          .toBeGreaterThan(6)
        await expect
          .poll(widthOf('dashhq-bar .lockup'), { message: where })
          .toBeGreaterThanOrEqual(40)
        await expect(page.locator('[data-tip="header"]'), where).toContainText(/\d/)
        const tip = await page.locator('[data-header-tip]').boundingBox()
        expect(tip?.x ?? -1, where).toBeGreaterThanOrEqual(0)
        expect((tip?.x ?? 0) + (tip?.width ?? 0), where).toBeLessThanOrEqual(width)

        await button.click()
        const menu = page.locator('dashhq-bar .netpop')
        await expect(menu).toBeVisible()
        const box = await menu.boundingBox()
        expect(box?.x ?? -1, where).toBeGreaterThanOrEqual(0)
        expect((box?.x ?? 0) + (box?.width ?? 0), where).toBeLessThanOrEqual(width)
        for (const option of ['Mainnet', 'Testnet']) {
          const o = await menu.getByRole('link', { name: option }).boundingBox()
          expect(o?.x ?? -1, `${where} ${option}`).toBeGreaterThanOrEqual(0)
          expect((o?.x ?? 0) + (o?.width ?? 0), `${where} ${option}`).toBeLessThanOrEqual(width)
        }
        await page.keyboard.press('Escape')
      }
    }
  })

  test('Home, Core, Network, Platform and Search are the tabs @X-08 @HY-18', async ({ page }) => {
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Radar' })
    for (const name of ['Home', 'Core', 'Network', 'Platform', 'Search']) {
      await expect(nav.getByRole('link', { name })).toBeVisible()
    }
    await expect(nav.getByRole('link', { name: 'Tools' })).toBeHidden()
  })

  test('no page scrolls sideways @X-08', async ({ page }) => {
    for (const path of [
      '/',
      '/platform',
      '/masternodes',
      '/search?q=2569992',
      '/status?network=testnet',
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settled(page)
      expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0)
    }
  })
})

test.describe('keyboard', () => {
  test('? lists the shortcuts @X-07', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.keyboard.press('?')

    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Search Radar', { exact: true }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('a skip link jumps past the bar @X-07', async ({ page }) => {
    await page.goto('/status')
    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()
    await page.keyboard.press('Tab')

    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  })
})

const TRANSFER = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'

test.describe('legibility', () => {
  for (const path of ['/', '/charts', `/tx/${TRANSFER}`, '/settings', '/tools/verify-message']) {
    test(`every small text on ${path.slice(0, 12)} meets WCAG AA in this theme @IN-14 @HY-02`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settled(page)
      expect(await lowContrastText(page)).toEqual([])
    })
  }

  test('secondary text, source stamps and copy icons stay clear of the card ground @IN-14 @HY-02', async ({
    page,
  }) => {
    await page.goto(`/tx/${TRANSFER}`)
    await settled(page)
    const grounds = ['--dh-page', '--dh-surface', '--dh-sunken', '--dh-chip']
    const ratios = await page.evaluate((names) => {
      const probe = (name: string) => {
        const el = document.createElement('div')
        el.style.cssText = `position:absolute;visibility:hidden;color:var(${name})`
        document.body.append(el)
        const c = getComputedStyle(el).color
        el.remove()
        return (
          c
            .match(/\d+(\.\d+)?/g)
            ?.slice(0, 3)
            .map(Number) ?? [0, 0, 0]
        )
      }
      const lum = ([r = 0, g = 0, b = 0]: number[]) => {
        const f = (v: number) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const ink = lum(probe('--dh-ink-2'))
      return names.map((n) => {
        const [hi, lo] = [ink, lum(probe(n))].sort((a, b) => b - a)
        return [n, ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)] as const
      })
    }, grounds)
    const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
    for (const [name, ratio] of ratios) {
      expect(ratio, `--dh-ink-2 on ${name}`).toBeGreaterThanOrEqual(dark ? 7 : 4.5)
    }
    const icon = page.locator('.rx-copy .rx-ico').first()
    await expect(icon).toBeVisible()
    expect((await icon.boundingBox())?.width).toBeGreaterThanOrEqual(16)
  })
})

/**
 * What a page that reads a backend does when that backend is gone: it still draws its frame, nothing keeps loading,
 * no figure is shown as coming from the missing source, and the page either says what is missing or shows what the
 * other sources gave. The fixture build fails the named source from the start.
 */
const BACKENDS: SiteSource[] = ['radar', 'pe', 'hyphen', 'insight', 'rate', 'sdk', 'dapi']

/** Pages that read a backend and do not yet say it is gone; the later design rounds own them (notes/INT.md). */
const SILENT_WHEN_DOWN = new Set([
  '/mempool|dapi',
  // The SDK only supplies the Platform tip, and Platform Explorer's one-block lookup answered without it.
  '/search?q=2569992|sdk',
])

/** Wording a page uses for a missing figure, where there is no alert to find. */
const MISSING_WORDS =
  /did not answer|didn.t answer|isn.t answering|couldn.t|can.t be reached|not available/i

const SAYS_SOMETHING_IS_MISSING = [
  '[role="alert"]',
  '.rx-empty--error',
  '.rx-errrow',
  '.rx-down__msg',
  '[data-unavailable]',
  '[data-state="down"]',
  '[data-state="stale"]',
  '[data-fallback]',
  '[data-balance-state="unknown"]',
  '[data-spend-reason="no-index"]',
  '[data-spend-reason="not-reported"]',
].join(', ')

test.describe('a backend that is down', () => {
  test.use({ allowFixtureMisses: true })

  for (const route of ROUTE_CASES) {
    for (const backend of BACKENDS.filter(
      (b) => !fetchesNothing(route.path) && sourcesOf(route.path).includes(b),
    )) {
      const net = casesNets(route)[0]!
      test(`${net} ${route.path} with ${backend} down shows what is left and says what is missing @X-09`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-light', 'one project reads the page')
        test.skip(
          SILENT_WHEN_DOWN.has(`${route.path}|${backend}`) ||
            SILENT_WHEN_DOWN.has(`${route.path.split('?')[0]}|${backend}`),
          'listed in notes',
        )
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(e.message))
        await page.addInitScript(
          (down) => sessionStorage.setItem('radar.fixture.down', JSON.stringify(down)),
          [backend],
        )
        await page.goto(withQuery(route.path, networkQuery(net)))

        await expect(page.getByRole('navigation', { name: 'Radar' })).toBeAttached()
        const frame = page.getByRole('heading', { level: 1 }).or(page.getByRole('alert')).first()
        await expect(frame, 'neither the page nor a message about it').toBeVisible({
          timeout: 20_000,
        })
        await expect(
          page.locator('[data-skeleton], [aria-busy="true"]'),
          'something is still loading',
        ).toHaveCount(0, { timeout: 30_000 })
        await expect(
          page.locator(
            `main .rx-sources [data-source="${backend}"]:not([data-state="down"], [data-state="stale"])`,
          ),
          `a figure is shown as served by ${backend}, which is down`,
        ).toHaveCount(0)
        // A page that asked the dead backend must say so; one that never did only has to show something.
        await expect
          .poll(
            async () => {
              const asked = await page.evaluate(
                (source) =>
                  (
                    window as unknown as {
                      __radarFixtures: { refusedReads(source: string): number }
                    }
                  ).__radarFixtures.refusedReads(source),
                backend,
              )
              const saysMissing =
                (await page.locator('main').locator(SAYS_SOMETHING_IS_MISSING).count()) +
                (MISSING_WORDS.test(await page.locator('main').innerText()) ? 1 : 0)
              return asked > 0
                ? saysMissing
                : saysMissing +
                    (await page.locator('main [data-source]:not([role="alert"])').count())
            },
            {
              message: `the page neither says ${backend} is missing nor shows another source`,
              timeout: 15_000,
            },
          )
          .toBeGreaterThan(0)
        expect(await horizontalOverflow(page), 'sideways overflow in px').toBeLessThanOrEqual(0)
        expect(errors, 'uncaught errors').toEqual([])
      })
    }
  }
})
