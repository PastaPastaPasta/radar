import { readFileSync } from 'node:fs'
import { expect, test } from '../helpers/test'
import { horizontalOverflow, settled } from '../helpers/settled'
import { casesNets, networkQuery, ROUTE_CASES, withQuery } from '../routes'
import { fetchesNothing } from '../helpers/site-map'

const isPhone = (name: string) => name.startsWith('phone')

test.describe('layout between a phone and a wide screen', () => {
  for (const route of ROUTE_CASES) {
    const net = casesNets(route)[0]!
    test(`${net} ${route.path} does not widen the page at 1024 px @X-08`, async ({
      page,
    }, testInfo) => {
      test.skip(isPhone(testInfo.project.name), 'desktop projects only')
      await page.setViewportSize({ width: 1024, height: 900 })
      await page.goto(withQuery(route.path, networkQuery(net)))
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await settled(page)
      // The scroll box takes over on the frame after a table's rows land, so the width is read until it settles.
      await expect
        .poll(() => horizontalOverflow(page), {
          message: 'sideways overflow in px',
          timeout: 3_000,
        })
        .toBeLessThanOrEqual(0)
    })
  }

  test('a segmented filter wraps at 320 px instead of scrolling out of sight @X-08', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/nodes')
    await settled(page)
    const groups = page.locator('.dh-seg')
    await expect(groups.first()).toBeVisible()
    const clipped = await groups.evaluateAll((els) =>
      els
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.getAttribute('aria-label')),
    )
    expect(clipped, 'filters whose options are hidden off to the side').toEqual([])
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('a tab bar may shrink below its tabs, so it scrolls inside itself @X-08', async ({
    page,
  }) => {
    await page.goto('/identity/BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp')
    await settled(page)
    const bar = page.locator('.rx-tabbar').first()
    await expect(bar).toBeAttached()
    const width = await bar.evaluate((el) => {
      const grid = document.createElement('div')
      grid.style.cssText = 'display:grid;width:300px'
      const copy = el.cloneNode(true) as HTMLElement
      grid.append(copy)
      document.body.append(grid)
      const w = copy.getBoundingClientRect().width
      grid.remove()
      return w
    })
    expect(width, 'width of a tab bar as a grid item in a 300 px box').toBeLessThanOrEqual(300)
  })

  test('the copy-link control of a card is a fingertip target on a phone @X-08 @X-10', async ({
    page,
  }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'phone only')
    await page.goto('/nodes')
    await settled(page)
    const copy = page.locator('#hosting').getByRole('button', { name: 'Copy link to this section' })
    const box = await copy.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(40)
    expect(box?.height).toBeGreaterThanOrEqual(40)
    await copy.click()
    await expect(page.getByText('Link copied')).toBeAttached()
  })
})

test.describe('identities on a list that wants names', () => {
  for (const path of ['/names', '/votes']) {
    test(`${path} draws an identity with its DPNS name once the batch has answered @NX-40 @NX-41`, async ({
      page,
    }) => {
      await page.goto(path)
      await settled(page)
      await expect(
        page
          .locator('[data-entity="identity"]')
          .filter({ hasText: /\.dash$/ })
          .first(),
      ).toBeVisible({ timeout: 15_000 })
    })
  }
})

test.describe('every page says where its figures came from and how old they are', () => {
  for (const route of ROUTE_CASES) {
    const net = casesNets(route)[0]!
    test(`${net} ${route.path} shows at least one source line @X-05`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-light', 'one project reads the page')
      test.skip(fetchesNothing(route.path), 'nothing is fetched here')
      await page.goto(withQuery(route.path, networkQuery(net)))
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await settled(page)
      await expect(page.locator('main .rx-sources [data-source]:visible').first()).toBeVisible()
    })
  }
})

test.describe('the census links into the masternode list', () => {
  for (const href of [
    '/masternodes?reach=reachable',
    '/masternodes?status=pose-banned',
    '/masternodes?dkg=ready&status=enabled',
    '/masternodes?dkg=protocol&status=enabled',
    '/masternodes?host=51167&type=evo',
    '/masternodes?country=DE&type=evo',
  ]) {
    test(`${href} lists the nodes it counts @RA-04 @RA-09`, async ({ page }) => {
      await page.goto(href)
      await settled(page)
      await expect(page.locator('a[href^="/mn/"]').first()).toBeVisible({ timeout: 15_000 })
    })
  }
})

test('every page in the site map has a route case, so the sweeps and the mode walk reach it @X-05 @X-08 @X-09', ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'reads files; one project is enough')
  const source = readFileSync(
    new URL('../../apps/web/src/features/entity/site-map.ts', import.meta.url),
    'utf8',
  )
  const paths = [...source.matchAll(/^\s+path: '([^']+)',$/gm)].map((m) => m[1]!)
  expect(paths.length).toBeGreaterThan(50)
  const uncovered = paths.filter((path) => {
    const pattern = new RegExp(`^${path.replace(/\$[a-zA-Z]+/g, '[^/?]+')}(\\?.*)?$`)
    return !ROUTE_CASES.some((c) => pattern.test(c.path))
  })
  expect(uncovered, 'site-map pages with no route case').toEqual([])
})

test('the data sources page names every backend the pages read and links the Platform Explorer API docs @PE-28', async ({
  page,
}) => {
  await page.goto('/sources')
  await expect(page.getByRole('heading', { level: 1, name: /sources/i })).toBeVisible()
  const main = page.locator('main')
  for (const name of [
    'DAPI',
    'Platform SDK',
    'Hyphen',
    'Insight',
    'Platform Explorer',
    'Radar census API',
  ]) {
    await expect(main.getByText(name, { exact: true }).first(), name).toBeVisible()
  }
  await expect(
    main.getByRole('link', { name: "Platform Explorer's API documentation" }),
  ).toHaveAttribute('href', /platform-explorer/)
})
