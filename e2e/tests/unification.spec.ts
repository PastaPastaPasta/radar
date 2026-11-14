import type { Page } from '@playwright/test'
import { lowContrastText } from '../helpers/contrast'
import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { casesNets, networkQuery, ROUTE_CASES, withQuery } from '../routes'
import { netIds } from '../routes/fixtures'

const main = netIds('mainnet')
const isPhone = (name: string) => name.startsWith('phone')

/** Entity routes: the pages that stand for one record, which a visitor shares. */
const ENTITY_ROUTE =
  /^\/(identity|contract|name|contest|epoch|document|group|tx|block|address|mn|governance|token|platform-address|platform\/block|platform\/tx)\/(?!lookup)[^/?]/

const entityCases = ROUTE_CASES.filter(
  (c) => c.built && ENTITY_ROUTE.test(c.path) && !/0{64}/.test(c.path),
)

async function openCard(page: Page, kind: string, via: 'hover' | 'focus') {
  const chip = page.locator(`[data-entity="${kind}"] a, [data-entity="${kind}"] button`).first()
  if (via === 'hover') await chip.hover()
  else await chip.focus()
  const card = page.locator('.rx-hc').first()
  await expect(card).toBeVisible({ timeout: 8_000 })
  return card
}

async function longPress(page: Page, kind: string) {
  const chip = page.locator(`[data-entity="${kind}"] a`).first()
  await page.waitForLoadState('networkidle')
  await chip.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = await chip.boundingBox()
  if (!box) throw new Error(`no ${kind} chip`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(700)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  return page.locator(`[data-long-press-card="${kind}"]`)
}

/** One page per kind whose chips the fixtures can answer for. */
const CARD_KINDS: { kind: string; path: string }[] = [
  { kind: 'masternode', path: '/votes' },
  { kind: 'evonode', path: '/masternodes?type=evo' },
  { kind: 'identity', path: '/identities' },
  { kind: 'contract', path: '/contracts' },
  { kind: 'name', path: '/names' },
  { kind: 'epoch', path: '/epochs' },
  { kind: 'platform-block', path: '/platform/blocks' },
  { kind: 'transition', path: '/platform/txs' },
  { kind: 'contest', path: '/polls' },
  { kind: 'token', path: `/contract/${main.id('contract', '')}?tab=tokens` },
  { kind: 'document', path: `/name/${main.id('name_registered', '')}` },
]

test.describe('hover cards, one per kind', () => {
  for (const { kind, path } of CARD_KINDS) {
    test(`a ${kind} chip opens a card with its title, an Open link and a source @X-06`, async ({
      page,
    }, testInfo) => {
      await page.goto(path)
      await settled(page)
      const chip = page.locator(`[data-entity="${kind}"] a`).first()
      await expect(chip, `a ${kind} chip on ${path}`).toBeVisible({ timeout: 15_000 })

      if (isPhone(testInfo.project.name)) {
        const card = await longPress(page, kind)
        await expect(card).toBeVisible({ timeout: 8_000 })
        await expect(card.locator('.rx-hc__kind')).not.toBeEmpty()
        // The tap that opened the card did not open the page.
        await expect(page).toHaveURL(new RegExp(path.split('?')[0]!.replace(/[/$]/g, '\\$&')))
        await page.mouse.click(2, 2)
        await expect(card).toBeHidden()
        return
      }

      const card = await openCard(page, kind, 'hover')
      await expect(card.locator('.rx-hc__kind')).not.toBeEmpty()
      await expect(card.getByRole('link', { name: /^Open/ })).toBeVisible()
      await expect(card.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
    })
  }

  test('a chip opens the same card on keyboard focus and Escape closes it @X-06 @X-07', async ({
    page,
  }, testInfo) => {
    test.skip(isPhone(testInfo.project.name), 'a phone has no keyboard focus ring to open a card')
    await page.goto('/masternodes')
    await settled(page)
    const card = await openCard(page, 'masternode', 'focus')
    await expect(card.locator('.rx-hc__kind')).not.toBeEmpty()
    await page.keyboard.press('Escape')
    await expect(page.locator('.rx-hc')).toBeHidden()
  })

  test('a chip that regains focus on a phone leaves no card over its neighbours @X-06', async ({
    page,
  }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'phone only')
    await page.goto('/masternodes')
    await settled(page)
    const chip = page.locator('[data-entity="masternode"] a').first()
    // The list can still replace its rows after the page settles.
    await expect(async () => {
      await chip.scrollIntoViewIfNeeded({ timeout: 2000 })
      await chip.focus({ timeout: 2000 })
    }).toPass()
    await page.waitForTimeout(800)
    await expect(page.locator('.rx-hc')).toHaveCount(0)
  })

  test('a card in Decentralized only mode says what needs an indexer and asks no hosted backend @X-06 @X-05', async ({
    page,
  }, testInfo) => {
    test.skip(isPhone(testInfo.project.name), 'hover cards open by long press on a phone')
    const hosted: string[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (
        /platform-explorer|hyphen|insight|radar-api|dashhq\.org\/api/.test(u.hostname + u.pathname)
      )
        hosted.push(r.url())
    })
    await page.goto('/names?sources=decentralized')
    await settled(page)
    const card = await openCard(page, 'name', 'hover')
    await expect(card.locator('.rx-hc__kind')).not.toBeEmpty()
    expect(hosted, 'hosted requests while the card was open').toEqual([])
  })
})

test.describe('links between layers', () => {
  test('an asset lock names the identity it created, or says it topped one up @X-02', async ({
    page,
  }) => {
    await page.goto(`/tx/${main.id('tx_assetlock', '')}`)
    await settled(page)
    const row = page
      .locator('dt', { hasText: 'Identity created' })
      .locator('xpath=following-sibling::dd[1]')
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText(
      /None\. A top-up credits an identity that already existed\.|[1-9A-HJ-NP-Za-km-z]{40,}|…/,
    )
  })

  test('an asset unlock links to the withdrawals on Platform @X-02', async ({ page }) => {
    await page.goto(`/tx/${main.id('tx_assetunlock', '')}`)
    await settled(page)
    const link = page.getByRole('link', { name: 'Withdrawals on Platform' })
    await expect(link).toBeVisible({ timeout: 15_000 })
    await link.click()
    await expect(page).toHaveURL(/\/platform\/txs\?.*type=/)
  })

  test('an evonode chip opens the Platform tab of its masternode @X-02', async ({ page }) => {
    await page.goto('/masternodes?type=evo')
    await settled(page)
    const chip = page.locator('[data-entity="evonode"] a').first()
    await expect(chip).toBeVisible({ timeout: 15_000 })
    await expect(chip).toHaveAttribute(
      'href',
      /\/mn\/[0-9a-f]{64}\?.*tab=platform|\/mn\/[0-9a-f]{64}\?tab=platform/,
    )
  })

  test('a Platform block links to the Core block that locked it @X-02', async ({ page }) => {
    await page.goto(`/platform/block/${main.id('pblock', '')}`)
    await settled(page)
    await expect(page.locator('[data-entity="block"] a').first()).toBeVisible({ timeout: 15_000 })
  })

  test('a masternode payout address opens the address page @X-02', async ({ page }) => {
    await page.goto(`/mn/${main.id('mn_regular', '')}`)
    await settled(page)
    await expect(page.locator('[data-entity="address"] a').first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('network switch', () => {
  const switchTo = async (page: Page, to: 'Testnet' | 'Mainnet') => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await settled(page)
    await page.getByRole('button', { name: /Network: (Mainnet|Testnet)/ }).click()
    await page
      .getByRole('navigation', { name: 'Network' })
      .getByRole('link', { name: to })
      .dispatchEvent('click')
  }

  for (const path of ['/nodes', '/map', '/masternodes?type=evo', '/epochs', '/platform/blocks']) {
    test(`${path} keeps its page and its query on the other network @X-03 @RA-91`, async ({
      page,
    }) => {
      await page.goto(path)
      await switchTo(page, 'Testnet')
      const url = new URL(page.url())
      expect(url.pathname).toBe(path.split('?')[0])
      expect(url.searchParams.get('network')).toBe('testnet')
      for (const [key, value] of new URLSearchParams(path.split('?')[1] ?? '')) {
        expect(url.searchParams.get(key)).toBe(value)
      }
    })
  }

  test('a record that only exists on one network opens a search for it on the other @X-03', async ({
    page,
  }) => {
    const id = main.id('tx_normal', '')
    await page.goto(`/tx/${id}`)
    await switchTo(page, 'Testnet')
    await expect(page).toHaveURL(/\/search\?/)
    const url = new URL(page.url())
    expect(url.searchParams.get('q')).toBe(id)
    expect(url.searchParams.get('network')).toBe('testnet')
  })

  test('a Platform identity keeps its page, because an identifier is the same on every network @X-03', async ({
    page,
  }) => {
    // The same id has no recording on testnet, which the test does not need: it reads the address only.
    await page.addInitScript(() => {
      const error = console.error.bind(console)
      console.error = (...args: unknown[]) => {
        if (!String(args[0]).startsWith('[radar-fixtures]')) error(...args)
      }
    })
    const id = main.id('identity', '')
    await page.goto(`/identity/${id}?tab=keys`)
    await switchTo(page, 'Testnet')
    const url = new URL(page.url())
    expect(url.pathname).toBe(`/identity/${id}`)
    expect(url.searchParams.get('network')).toBe('testnet')
  })

  test('an epoch goes to the list of epochs on the other network @X-03', async ({ page }) => {
    await page.goto(`/epoch/${main.id('epoch_current', '88')}`)
    await switchTo(page, 'Testnet')
    await expect(page).toHaveURL(/\/epochs\?.*network=testnet|\/epochs$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Epochs' })).toBeVisible()
  })
})

test.describe('old links', () => {
  test('an old evonode link opens the Platform tab of the masternode @X-04', async ({ page }) => {
    await page.goto(`/mn/${main.id('mn_evo', '')}?tab=platform`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/tab=platform/)
  })

  test('the old Radar tools path opens the path-elements tool @X-04', async ({ page }) => {
    await page.goto('/tools/path')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})

test.describe('share links', () => {
  for (const route of entityCases) {
    for (const net of casesNets(route)) {
      test(`${net} ${route.path} has a copy-link control @X-10`, async ({ page }) => {
        await page.goto(withQuery(route.path, networkQuery(net)))
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await settled(page)
        await expect(page.getByRole('button', { name: 'Copy link' }).first()).toBeAttached()
      })
    }
  }

  test('copy link puts this page’s full address on the clipboard @X-10', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const path = `/identity/${main.id('identity', '')}`
    await page.goto(path)
    await settled(page)
    await page.getByRole('button', { name: 'Copy link' }).first().click()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain(path)
    expect(copied.startsWith('http')).toBe(true)
  })

  test('a shared link opens the page with its network @X-10', async ({ page }) => {
    const id = netIds('testnet').id('identity', '')
    await page.goto(`/identity/${id}?network=testnet`)
    await expect(page.getByRole('button', { name: /Network: Testnet/ })).toBeVisible()
  })
})

test.describe('acting elsewhere', () => {
  const linkOut = (page: Page, host: string) => page.locator(`a[href*="${host}"]`).first()

  test('identity, name and contract pages offer Manage in Bridge @X-11', async ({ page }) => {
    for (const path of [
      `/identity/${main.id('identity', '')}`,
      `/name/${main.id('name_registered', '')}`,
      `/contract/${main.id('contract', '')}`,
    ]) {
      await page.goto(path)
      await settled(page)
      await expect(linkOut(page, 'bridge.dashhq.org'), path).toBeVisible({ timeout: 15_000 })
    }
  })

  test('contest and masternode pages offer Vote in Governance @X-11', async ({ page }) => {
    for (const path of [`/contest/${main.id('contest', '')}`, `/mn/${main.id('mn_regular', '')}`]) {
      await page.goto(path)
      await settled(page)
      await expect(linkOut(page, 'gov.dashhq.org'), path).toBeVisible({ timeout: 15_000 })
    }
  })

  test('a proposal links to its page in Governance @X-11', async ({ page }) => {
    await page.goto(`/governance/${main.id('proposal', '')}`)
    await settled(page)
    await expect(linkOut(page, 'gov.dashhq.org/p/h/')).toBeVisible({ timeout: 15_000 })
  })

  const KEY_INPUT =
    'input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"], input[name*="mnemonic" i], input[name*="private" i], input[name*="wif" i], input[name*="seed" i], textarea[name*="mnemonic" i], textarea[name*="private" i]'
  const seen = new Set<string>()
  for (const route of ROUTE_CASES) {
    if (!route.built || seen.has(route.path)) continue
    seen.add(route.path)
    const net = casesNets(route)[0] ?? 'mainnet'
    test(`${route.path} asks for no key, mnemonic, password or signature @X-11`, async ({
      page,
    }) => {
      await page.goto(withQuery(route.path, networkQuery(net)))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settled(page)
      await expect(page.locator(KEY_INPUT)).toHaveCount(0)
    })
  }
})

test.describe('keyboard', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 600, 'a phone has no keyboard')

  test('? lists the shortcuts, including the proof inspector and diagnostics @X-07', async ({
    page,
  }) => {
    await page.goto('/status')
    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()
    await page.keyboard.press('?')
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('Open the proof inspector')).toBeVisible()
    await expect(sheet.getByText('Open the diagnostics drawer')).toBeVisible()
  })

  for (const path of [
    '/masternodes',
    '/blocks',
    '/identities',
    '/names',
    '/contracts',
    '/platform/blocks',
    '/platform/txs',
    '/polls',
    '/contests',
  ]) {
    test(`j moves down ${path} and Enter opens the row @X-07`, async ({ page }) => {
      await page.goto(path)
      await settled(page)
      const rows = page.locator('tbody tr[data-index]')
      await expect(rows.first()).toBeVisible({ timeout: 15_000 })
      await page.locator('h1').first().click()
      await page.keyboard.press('j')
      await expect(page.locator('tbody tr.is-focus').first()).toBeVisible()
      await page.keyboard.press('j')
      await page.keyboard.press('k')
      const before = page.url()
      await page.keyboard.press('Enter')
      await expect(page).not.toHaveURL(before)
    })
  }

  test('Alt+Shift+P opens the proof inspector and Alt+Shift+D the diagnostics @X-07', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    const proofs = page.getByRole('dialog', { name: 'Proof inspector' })
    await expect(async () => {
      if (!(await proofs.isVisible())) await page.keyboard.press('Alt+Shift+KeyP')
      await expect(proofs).toBeVisible({ timeout: 1_500 })
    }).toPass({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await expect(proofs).toBeHidden()
    await page.keyboard.press('Alt+Shift+KeyD')
    await expect(page.getByRole('dialog', { name: /Diagnostics/ })).toBeVisible()
  })
})

test.describe('themes and motion', () => {
  const PAGES = [
    '/',
    '/charts',
    '/masternodes',
    '/platform',
    '/identities',
    `/identity/${main.id('identity', '')}`,
    `/tx/${main.id('tx_assetlock', '')}`,
  ]

  for (const path of PAGES) {
    test(`${path} reads in the theme the visitor chose, with no low-contrast text @RA-92`, async ({
      page,
    }, testInfo) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settled(page)
      const dark = testInfo.project.name.endsWith('dark')
      await expect(page.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light')
      expect(await lowContrastText(page)).toEqual([])
    })
  }

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    for (const path of ['/', '/map', '/blocks', '/masternodes', '/platform', '/status']) {
      test(`${path} runs no animation or transition @RA-92`, async ({ page }) => {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await settled(page)
        const moving = await page.evaluate(() => {
          const out: string[] = []
          for (const el of document.querySelectorAll('*')) {
            const s = getComputedStyle(el)
            const anim = s.animationDuration.split(',').some((d) => parseFloat(d) > 0)
            const trans = s.transitionDuration.split(',').some((d) => parseFloat(d) > 0)
            if (anim || trans)
              out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
          }
          return out.slice(0, 10)
        })
        expect(moving, 'elements with a running animation or transition').toEqual([])
      })
    }
  })

  test('the family theme cookie decides the theme on any page @RA-92', async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    const other = testInfo.project.name.endsWith('dark') ? 'light' : 'dark'
    await context.addCookies([{ name: 'dh_theme', value: other, url: baseURL ?? '' }])
    await page.goto('/status')
    await expect(page.locator('html')).toHaveAttribute('data-theme', other)
  })
})
