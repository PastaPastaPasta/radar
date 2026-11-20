import type { Page } from '@playwright/test'
import { H1 } from '../routes/claims'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 20_000 })

// The chunks that fail include fixture recordings the page would have loaded, so reads go unanswered on purpose.
test.use({ allowFixtureMisses: true })

interface FixtureHooks {
  __radarFixtures: { failNewChunks(mode: 'missing' | 'broken', only?: string): void }
}

/** Opens the home page, then makes the mempool page's files it has not loaded yet gone (as after a deploy) or broken. */
async function homeThenFail(
  page: Page,
  mode: 'missing' | 'broken',
  only = '/assets/mempool-',
): Promise<void> {
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(10_000)
    // Notes, across reloads, whether the page ever said its code is broken while it was only recovering.
    new MutationObserver(() => {
      if (document.querySelector('[data-error-page="error"]')) {
        sessionStorage.setItem('e2e.saw-code-error', '1')
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(
    ([m, o]) => {
      ;(window as unknown as FixtureHooks).__radarFixtures.failNewChunks(m, o)
    },
    [mode, only] as const,
  )
}

/** Follows an in-app link, the way a visitor moves between pages without loading the document again. */
async function follow(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    const a = document.createElement('a')
    a.href = p
    a.textContent = p
    document.body.append(a)
    a.click()
    a.remove()
  }, path)
}

const sawCodeError = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem('e2e.saw-code-error') === '1')

const restoreChunks = (page: Page) =>
  page.evaluate(() => {
    sessionStorage.removeItem('radar.fixture.chunks')
  })

test.describe('the error page', () => {
  test('a page whose code is gone after a deploy reloads once, into the current build @NX-77', async ({
    page,
  }) => {
    await homeThenFail(page, 'missing')
    let loads = 0
    page.on('load', () => {
      loads++
    })
    await follow(page, '/mempool')

    // The reload's page names the route's files itself (the edge preloads them), so it loads the current build.
    await expect(page.getByRole('heading', { level: 1, name: H1.mempool })).toBeVisible()
    expect(loads, 'one guarded reload into the current build').toBe(1)
    expect(new URL(page.url()).pathname, 'the reload keeps the address').toBe('/mempool')
    await expect(page.locator('[data-error-page]')).toHaveCount(0)
    expect(await sawCodeError(page), 'recovery never shows the page for broken code').toBe(false)
  })

  test('once the reload has been tried, a missing page says so inside the shell, without reloading again @NX-77', async ({
    page,
  }) => {
    await homeThenFail(page, 'missing')
    await page.evaluate(() => {
      sessionStorage.setItem('radar.chunk-reload', String(Date.now()))
    })
    let loads = 0
    page.on('load', () => {
      loads++
    })
    await follow(page, '/mempool')

    const errorPage = page.locator('[data-error-page="chunk"]')
    await expect(errorPage).toBeVisible()
    expect(loads, 'no second reload inside the guard window').toBe(0)
    expect(new URL(page.url()).pathname).toBe('/mempool')
    await expect(errorPage.getByRole('heading', { level: 1 })).toHaveText(
      'This page couldn’t be loaded',
    )
    await expect(errorPage).toContainText('Radar was probably updated')
    await expect(errorPage.locator('details')).toHaveCount(0)
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
    await expect(page.locator('#root dashhq-bar')).toBeAttached()
    await expect(errorPage.getByRole('link', { name: 'Go home' })).toBeVisible()
    await expect(errorPage.getByRole('heading', { level: 1 })).toBeFocused()
    expect(await sawCodeError(page), 'recovery never shows the page for broken code').toBe(false)

    await restoreChunks(page)
    await errorPage.getByRole('button', { name: 'Reload' }).click()
    await expect(page.getByRole('heading', { level: 1, name: H1.mempool })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/mempool')
  })

  test('a route that breaks shows the branded page, with what broke behind a disclosure @NX-77', async ({
    page,
  }) => {
    await homeThenFail(page, 'broken')
    let loads = 0
    page.on('load', () => {
      loads++
    })
    await follow(page, '/mempool')

    const errorPage = page.locator('[data-error-page="error"]')
    await expect(errorPage).toBeVisible()
    await expect(errorPage.getByRole('heading', { level: 1 })).toHaveText(
      'This page couldn’t be shown',
    )
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
    await expect(page.locator('#root dashhq-bar')).toBeAttached()
    expect(loads, 'an error that is not about fetching code does not reload').toBe(0)

    const detail = errorPage.locator('details[data-error-detail]')
    await expect(detail).not.toHaveAttribute('open')
    await detail.locator('summary').click()
    await expect(detail).toContainText('SyntaxError')

    await restoreChunks(page)
    await errorPage.getByRole('link', { name: 'Go home' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /^Radar:/ })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/')
  })

  test('a link hovered on a stale tab fails to preload without reloading the page @NX-77', async ({
    page,
  }) => {
    // A hover runs the route's loader, whose code and data load through Vite's helper like any other import.
    await homeThenFail(page, 'missing', '/assets/mempool')
    let loads = 0
    page.on('load', () => {
      loads++
    })
    let preloaded = false
    page.on('request', (r) => {
      if (r.url().includes('/assets/mempool')) preloaded = true
    })
    // Hovered again until the router preloads: the home page may still be redrawing the link.
    const link = page.locator('a[href="/mempool"]').first()
    await expect
      .poll(
        async () => {
          await link.hover()
          await page.mouse.move(0, 0)
          return preloaded
        },
        { timeout: 20_000 },
      )
      .toBe(true)
    await page.waitForTimeout(2000)
    expect(loads, 'a failed preload never reloads the page').toBe(0)
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.locator('[data-error-page]')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: /^Radar:/ })).toBeVisible()
  })
})
