import { expectAccessible } from '../helpers/a11y'
import { tabBarHeight } from '../helpers/contrast'
import { settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

interface RadarFixtureWindow {
  __radarFixtures: {
    breakLiveConnection(): void
    restoreLiveConnection(): void
    dapiCalls(method: string): number
  }
  __radarCore: {
    status(
      net: string,
      signal?: AbortSignal,
    ): Promise<{ height?: number; data: { blocks: number; difficulty: number } }>
  }
  __radarQueryClient: {
    getQueryData(key: unknown[]): { data: { height: number } } | undefined
    setQueryData(key: unknown[], data: unknown): void
  }
}

test.describe('Home', () => {
  test('shows the Core and Platform heights, the census and the node map @IN-01 @HY-01', async ({
    page,
  }) => {
    await page.goto('/')
    const core = page.locator('[data-pulse="core"]')
    await expect(core).toContainText('2,570,085')
    await expect(core.locator('[data-source="dapi"]')).toBeVisible()
    await expect(page.locator('[data-pulse="platform"]')).toContainText(/Epoch \d+/)
    await expect(page.locator('[data-pulse="census"]')).toContainText(/of \d/)
    const map = page.locator('[data-map="nodes"]')
    await expect(map.locator('circle.mn').first()).toBeVisible()
    await expect(map.locator('.rx-callout')).toContainText('masternodes')
    await expect(page.getByText(/not loaded yet|Arrives with the network pages/)).toHaveCount(0)
    await expectAccessible(page)
  })

  test('lists the latest Core blocks and pending transactions, each opening its page @HY-03 @IN-01', async ({
    page,
  }) => {
    await page.goto('/')
    const blocks = page.getByRole('table', { name: 'Latest Core blocks' })
    await expect(blocks.locator('a[href="/block/2570085"]').first()).toBeVisible()
    await expect(page.getByRole('table', { name: 'Pending transactions' })).toBeVisible()
    const link = blocks.locator('a[href="/block/2570085"]').first()
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/block\/2570085/)
  })

  test('shows height, difficulty, supply and size @HY-01', async ({ page }) => {
    await page.goto('/')
    const headline = page.locator('[data-headline]')
    await expect(headline).toContainText('Height')
    await expect(headline).toContainText('Difficulty')
    await expect(headline).toContainText('Circulating supply')
    await expect(headline).toContainText('Blockchain size')
  })

  test('puts the height and difficulty in the Core figures as soon as DAPI answers @HY-01', async ({
    page,
  }) => {
    await page.goto('/')
    const headline = page.locator('[data-headline]')
    await expect(headline).toContainText(/Height.*2,570,085/)
    await expect(headline).toContainText(/Difficulty.*106,426,839\.80/)
  })

  test('a phone jumps from the top of the page to the Core figures @HY-01', async ({
    page,
    viewport,
  }) => {
    test.skip((viewport?.width ?? 0) > 640, 'phone layout only')
    await page.goto('/')
    await page.getByRole('link', { name: 'Core figures' }).click()
    await expect(page).toHaveURL(/#core-figures$/)
    const top = async () => (await page.locator('[data-headline]').boundingBox())?.y ?? -1
    await expect.poll(top).toBeGreaterThanOrEqual(0)
    await expect.poll(top).toBeLessThan(page.viewportSize()!.height / 2)
  })

  test('opens a block from search by height @IN-10', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-palette-trigger]:visible').first().click()
    await page.locator('[data-palette] input').fill('2570085')
    await page
      .getByRole('option', { name: /Core block 2,570,085/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/block\/2570085/)
  })

  test('says there is no match for nonsense @IN-10', async ({ page }) => {
    await page.goto('/search?q=hello+nobody')
    await expect(page.getByText(/No match|no results|Nothing found/i).first()).toBeVisible()
  })

  test('shows the current height and no stopped-updates notice while the connection is up @IN-15', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
    await expect(page.locator('[data-live-notice]')).toHaveCount(0)
    await expect(page.locator('[data-pulse="core"] [data-source="dapi"]')).toBeVisible()
  })

  test('says live updates stopped when the connection is cut, and clears once it is back @IN-15', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
    await expect(page.locator('[data-live-notice]')).toHaveCount(0)

    await page.evaluate(() =>
      (window as unknown as RadarFixtureWindow).__radarFixtures.breakLiveConnection(),
    )
    const notice = page.locator('[data-live-notice]')
    await expect(notice).toContainText('Live updates have stopped.')

    await notice.getByRole('button', { name: 'Try again' }).click()
    await expect(notice).toContainText('Live updates have stopped.')

    await page.evaluate(() =>
      (window as unknown as RadarFixtureWindow).__radarFixtures.restoreLiveConnection(),
    )
    await expect(notice).toHaveCount(0)
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
  })

  test('reads the Core figures again when a new block arrives @HY-01', async ({ page }) => {
    await page.goto('/')
    const difficulty = page.locator('[data-headline] .rx-stat').filter({ hasText: 'Difficulty' })
    await expect(difficulty).toContainText(/\d/)
    await expect(difficulty).not.toHaveAttribute('aria-busy', 'true')
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as RadarFixtureWindow).__radarQueryClient.getQueryData([
              'mainnet',
              'dapi',
              'tip',
            ]) !== undefined,
        ),
      )
      .toBe(true)
    const shown = (await difficulty.locator('.rx-stat__value').innerText()).trim()

    await page.evaluate(() => {
      const w = window as unknown as RadarFixtureWindow
      const original = w.__radarCore.status.bind(w.__radarCore)
      w.__radarCore.status = async (net, signal) => {
        const read = await original(net, signal)
        return {
          ...read,
          height: (read.height ?? 0) + 1,
          data: { ...read.data, blocks: read.data.blocks + 1, difficulty: 123_456_789.5 },
        }
      }
      const key = ['mainnet', 'dapi', 'tip']
      const tip = w.__radarQueryClient.getQueryData(key)!
      w.__radarQueryClient.setQueryData(key, {
        ...tip,
        height: tip.data.height + 1,
        data: { ...tip.data, height: tip.data.height + 1 },
      })
    })

    await expect(difficulty.locator('.rx-stat__value')).toHaveText('123,456,789.5')
    expect(shown).not.toBe('123,456,789.5')
    await expect(difficulty.locator('[data-source]')).toHaveCount(0)
  })

  test('keeps the Core height and ChainLock in the header while scrolling @IN-15', async ({
    page,
  }) => {
    await page.goto('/')
    const tip = page.locator('[data-header-tip]')
    await expect(tip).toContainText('2,570,085')
    await expect(tip.locator('.rx-hdrtip__lock')).toBeVisible()
    await page.getByRole('heading', { name: 'Latest activity' }).scrollIntoViewIfNeeded()
    await expect(tip).toBeInViewport()
    await expect(tip).toContainText('2,570,085')
    await page.goto('/status')
    await expect(page.locator('[data-header-tip]')).toContainText('2,570,085')
  })

  test('qualifies Live as soon as the browser goes offline, and recovers @IN-15', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
    const word = page.locator('[data-live-word]')
    const tip = page.locator('[data-header-tip]')
    await expect(word).toHaveText('Live')
    await expect(tip).toHaveAttribute('data-connection', 'live')

    await context.setOffline(true)
    await expect(word).toHaveText(/^Stopped since \d\d:\d\d$/)
    await expect(tip).toHaveAttribute('data-connection', 'stopped')
    await expect(tip).toContainText('Stopped since')
    await expect(tip.locator('.rx-hdrtip__state:visible, .rx-hdrtip__short:visible')).toContainText(
      'Stopped',
    )
    await expect(page.locator('.rx-lanes .rx-live')).toContainText('Stopped since')

    await context.setOffline(false)
    await expect(word).toHaveText('Live')
    await expect(tip).toHaveAttribute('data-connection', 'live')
    await expect(page.locator('.rx-lanes .rx-live')).toContainText('Live')
  })

  test('does not say Live while the live connection is cut @IN-15', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-pulse="core"]')).toContainText('2,570,085')
    await expect(page.locator('[data-live-word]')).toHaveText('Live')
    await page.evaluate(() =>
      (window as unknown as RadarFixtureWindow).__radarFixtures.breakLiveConnection(),
    )
    await expect(page.locator('[data-live-word]')).not.toHaveText('Live')
    await expect(page.locator('[data-header-tip]')).toHaveAttribute(
      'data-connection',
      /reconnecting|polling|stopped/,
    )
    await page.evaluate(() =>
      (window as unknown as RadarFixtureWindow).__radarFixtures.restoreLiveConnection(),
    )
    await expect(page.locator('[data-live-word]')).toHaveText('Live')
  })

  test('fits the circulating supply and its USD companion inside the card at every width @HY-01', async ({
    page,
  }) => {
    for (const width of [1440, 1180, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const supply = page
        .locator('[data-headline] .rx-stat')
        .filter({ hasText: 'Circulating supply' })
      await expect(supply.locator('.rx-fiat')).toBeVisible()
      const fits = await supply.evaluate((card) => {
        const box = card.getBoundingClientRect()
        return [...card.querySelectorAll('.rx-stat__value, .rx-amt, .rx-fiat')].every((el) => {
          const r = el.getBoundingClientRect()
          return r.left >= box.left - 0.5 && r.right <= box.right + 0.5
        })
      })
      expect(fits, `supply card at ${width}px`).toBe(true)
    }
  })

  test('shows one source badge per source across the headline figures @IN-09', async ({ page }) => {
    await page.goto('/')
    const headline = page.locator('[data-headline]')
    await expect(headline.locator('[data-source="hyphen"]')).toHaveCount(1)
    await expect(headline.locator('[data-source="dapi"]')).toHaveCount(1)
    await expect(headline.locator('.rx-stat')).toHaveCount(4)
  })

  test('works on testnet @IN-16 @HY-19', async ({ page }) => {
    await page.goto('/?network=testnet')
    await expect(page.locator('[data-pulse="core"]')).toContainText('1,589,232')
    await expect(page.locator('dashhq-bar')).toHaveAttribute('network', 'testnet')
    await expect(page.locator('[data-headline]')).toContainText('Best ChainLock')
    await expect(page.locator('[data-hyphen-lag]')).toContainText(
      /Testnet index is behind the chain/,
    )
  })

  test('keeps the tab bar below the content on a phone @HY-18', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await page.goto('/')
    const bar = page.locator('dashhq-bar')
    await expect(bar).toBeVisible()
    await page.getByRole('heading', { name: /Latest blocks/ }).scrollIntoViewIfNeeded()
    await expect(page.locator('[data-pulse="core"]')).toBeVisible()
  })
})

test.describe('Home on a phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 600, 'phone layout only')

  for (const [name, path, locked] of [
    ['mainnet', '/', true],
    ['testnet', '/?network=testnet', false],
  ] as const) {
    for (const width of [320, 390, 430]) {
      test(`shows the Core height and its lock state above the tab bar at ${width} px on ${name} @HY-18 @IN-01 @HY-01 @HY-19`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(path)
        const core = page.locator('[data-pulse="core"]')
        await expect(core.locator('.rx-tick')).toContainText(/\d/)
        await expect(core.locator('.rx-pulse__meta time')).toHaveText(/\S/)
        await settled(page)
        expect(await page.evaluate(() => window.scrollY)).toBe(0)
        const barTop = 844 - (await tabBarHeight(page))
        for (const part of [
          core,
          core.locator('.rx-pulse__value'),
          core.locator('.rx-pulse__meta'),
          ...(locked ? [core.locator('.rx-ok')] : []),
        ]) {
          const box = await part.boundingBox()
          expect(box, 'the Core figure is laid out').not.toBeNull()
          expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(barTop)
        }
      })
    }
  }

  for (const width of [320, 390, 430]) {
    test(`keys the map beside the masternode count without pushing the Core card down at ${width} px @HY-18`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      const legend = page.locator('.rx-maplegend')
      await expect(legend.locator('.rx-maplegend__sum')).toContainText(/masternodes/)
      await settled(page)
      const filled = legend.locator('.rx-maplegend__key').first().locator('i.d')
      const hollow = legend.locator('.rx-maplegend__key--other i.d--all')
      await expect(filled).toBeVisible()
      await expect(hollow).toBeVisible()
      await expect(legend.locator('.rx-maplegend__key--other')).toContainText(/\S/)
      await expect(legend.locator('.rx-maplegend__key--other .rx-maplegend__long')).toBeHidden()
      const sum = await legend.locator('.rx-maplegend__sum').boundingBox()
      const dot = await filled.boundingBox()
      expect(Math.abs(dot!.y + dot!.height / 2 - (sum!.y + sum!.height / 2))).toBeLessThan(8)
      const other = await hollow.boundingBox()
      const follows = other!.x > sum!.x || other!.y > sum!.y + sum!.height / 2
      expect(follows, 'the hollow key follows the count, on its line or the next').toBe(true)
      const box = await legend.boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      const barTop = 844 - (await tabBarHeight(page))
      for (const part of ['.rx-pulse__value', '.rx-pulse__meta']) {
        const b = await page.locator(`[data-pulse="core"] ${part}`).boundingBox()
        expect(b!.y + b!.height, `Core ${part} above the tab bar`).toBeLessThanOrEqual(barTop)
      }
    })
  }

  test('puts the Core figures before the long activity lists @HY-01', async ({ page }) => {
    await page.goto('/')
    await settled(page)
    const supply = await page.getByText('Circulating supply').boundingBox()
    const activity = await page.locator('.rx-home__activity').boundingBox()
    expect(supply?.y ?? Infinity).toBeLessThan(activity?.y ?? 0)
  })

  for (const width of [320, 390, 430]) {
    for (const [name, path] of [
      ['mainnet', '/'],
      ['testnet', '/?network=testnet'],
    ] as const) {
      test(`keeps the brand whole in every connection state at ${width} px on ${name} @HY-18 @IN-15`, async ({
        page,
        context,
      }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(path)
        const tip = page.locator('[data-header-tip]')
        const lockup = page.locator('dashhq-bar .lockup')
        const whole = async (state: string) => {
          const box = await lockup.boundingBox()
          const [scroll, client] = await lockup.evaluate((el) => [el.scrollWidth, el.clientWidth])
          expect(box?.width ?? 0, `${state}: brand width`).toBeGreaterThanOrEqual(46)
          expect(scroll, `${state}: brand is not clipped`).toBeLessThanOrEqual(client)
        }
        await expect(tip).toHaveAttribute('data-connection', 'live')
        await whole('live')

        await page.evaluate(() =>
          (window as unknown as RadarFixtureWindow).__radarFixtures.breakLiveConnection(),
        )
        await expect(tip).toHaveAttribute('data-connection', /reconnecting|polling/)
        await whole('retrying')

        await context.setOffline(true)
        await expect(tip).toHaveAttribute('data-connection', 'stopped')
        await whole('stopped')
        await expect(tip.locator('[data-live-state]')).toContainText(/stopped/)
      })
    }
  }
})
