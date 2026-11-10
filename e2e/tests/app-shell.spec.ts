import { expectAccessible } from '../helpers/a11y'
import { expect, test } from '../helpers/test'

const BLOCK_HASH = '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6'
const TXID = 'e0028eb9648db56b1ac77cf090b99048a8007e2bb64b74b4a4cb7c4d8d6e6e47'
const ADDRESS = 'XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc'
const PROTX = '5'.repeat(64)
const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

const ROUTES: [path: string, heading: string][] = [
  ['/', 'Radar'],
  ['/search', 'Search'],
  ['/blocks', 'Blocks'],
  ['/blocks?date=2026-10-01', 'Blocks'],
  [`/block/${BLOCK_HASH}`, 'Block'],
  ['/block/2569992', 'Block'],
  [`/tx/${TXID}`, 'Transaction'],
  [`/address/${ADDRESS}`, 'Address'],
  ['/mempool', 'Mempool'],
  ['/rich-list', 'Rich list'],
  ['/charts', 'Charts'],
  ['/governance', 'Governance'],
  [`/governance/${TXID}`, 'Proposal'],
  ['/status', 'Status'],
  ['/nodes', 'Nodes'],
  ['/masternodes', 'Masternodes'],
  ['/masternodes?type=evo&view=platform', 'Masternodes'],
  [`/mn/${PROTX}`, 'Masternode'],
  [`/mn/${PROTX}?tab=payments`, 'Masternode'],
  ['/map', 'Map'],
  ['/epochs', 'Epochs'],
  ['/epoch/1234', 'Epoch'],
  ['/protocol', 'Protocol'],
  ['/v24', 'Core 24 activation'],
  ['/changes', 'Changes'],
  ['/platform', 'Platform'],
  ['/platform/blocks', 'Platform blocks'],
  ['/platform/block/1234', 'Platform block'],
  ['/platform/txs', 'State transitions'],
  [`/platform/tx/${TXID}`, 'State transition'],
  ['/identities', 'Identities'],
  ['/identity/lookup?pkh=62e907b15cbf27d5425399ebf6f0fb50ebb88f18', 'Identity by key hash'],
  [`/identity/${CONTRACT}`, 'Identity'],
  ['/contracts', 'Contracts'],
  [`/contract/${CONTRACT}`, 'Contract'],
  [`/contract/${CONTRACT}/documents/domain`, 'Documents'],
  [`/document/${CONTRACT}/domain/${CONTRACT}`, 'Document'],
  ['/tokens', 'Tokens'],
  [`/token/${CONTRACT}`, 'Token'],
  [`/token/${CONTRACT}/holders`, 'Token holders'],
  ['/names', 'Names'],
  ['/name/alice', 'Name'],
  ['/contests', 'Name contests'],
  ['/contest/alice', 'Name contest'],
  ['/votes', 'Masternode votes'],
  ['/polls', 'Vote polls'],
  [`/groups/${CONTRACT}`, 'Groups'],
  [`/group/${CONTRACT}/0`, 'Group'],
  ['/credits', 'Credits'],
  ['/shielded', 'Shielded pool'],
  ['/platform-address/dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs', 'Platform address'],
  ['/quorums', 'Quorums'],
  ['/query', 'Query'],
  ['/tools/transition', 'Transition decoder'],
  ['/tools/verify-message', 'Verify message'],
  ['/tools/qr', 'QR reader'],
  ['/tools/tx', 'Decoder'],
  ['/sdk-reference', 'SDK reference'],
  ['/api', 'Radar API'],
  ['/sources', 'Data sources'],
  ['/saved', 'Saved'],
  ['/settings', 'Settings'],
  ['/about', 'About'],
]

test.describe('routes', () => {
  for (const [path, heading] of ROUTES) {
    test(`${path} says what will be here and where the data comes from @X-08 @X-09`, async ({
      page,
    }) => {
      await page.goto(path)

      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Radar' })).toBeAttached()
      if (path === '/search') return
      if (path === '/') {
        await expect(page.getByRole('link', { name: /Search blocks/ })).toBeVisible()
        return
      }
      await expect(page.getByText('This page is on its way')).toBeVisible()
      await expect(page.getByText('Read from')).toBeVisible()
    })
  }

  test('no route needs horizontal page scroll @X-08', async ({ page }) => {
    for (const [path] of ROUTES.slice(0, 30)) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })

  test('a route has no serious accessibility violations @X-08', async ({ page }) => {
    await page.goto('/masternodes')
    await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()

    await expectAccessible(page, { exclude: ['dashhq-bar'] })
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
    expect(style.border).toBe('3px')
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
    await page.goto('/status?network=devnet-paloma')

    await expect(page.getByRole('heading', { name: 'Set up the paloma devnet' })).toBeVisible()
    await page.getByRole('button', { name: 'Use this devnet' }).click()
    await expect(page.getByRole('alert')).toContainText('at least one DAPI address')

    await page.getByLabel('DAPI addresses').fill('192.0.2.10:1443')
    await page.getByRole('button', { name: 'Use this devnet' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()
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
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
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
