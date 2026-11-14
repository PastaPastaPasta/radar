import { expect, test } from '../helpers/test'
import { horizontalOverflow, settled } from '../helpers/settled'
import { casesNets, networkQuery, ROUTE_CASES, withQuery } from '../routes'

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
      expect(await horizontalOverflow(page), 'sideways overflow in px').toBeLessThanOrEqual(0)
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
