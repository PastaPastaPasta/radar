import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { routeBuilt } from '../routes/uni-s'

const MAINNET_ADDRESS = 'XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc'
const MAINNET_P2SH = '7iRPy8FEHBzbChrktsG85YbDZ3SuiCxsNq'
const TESTNET_ADDRESS = 'yhq7ifNCtTKEpY4Yu5XPCcztQco6Fh6JsZ'
const TESTNET_P2SH = '8erZsDLXAvEFj3B4ojXDykVBsQGC5NnCnU'
const MAINNET_PLATFORM = 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs'
const TESTNET_PLATFORM = 'tdash1krma5z3ttj75la4m93xcndna9ullamq9y5fzq2j7'
const BLOCK_HASH = '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6'
const TESTNET_BLOCK_HASH = '00000bafbc94add76cb75e2ec92894837288a481e5c005f6563d91623bf8bc2c'
/** A 64-hex string that is no block or transaction on either network; its lookups are recorded as not found. */
const UNKNOWN_HASH = '5ca1ab1e'.repeat(8)
const PKH = '62e907b15cbf27d5425399ebf6f0fb50ebb88f18'
const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

interface Sample {
  label: string
  q: string
  network?: 'testnet'
  looksLike: RegExp
  result?: { name: RegExp; href: string }
  /** A reading whose page is not built yet: search must not offer it. */
  withheld?: RegExp
  /** A destination whose page is not built yet: no link may lead there. */
  withheldRoute?: { route: string; prefix: string }
}

const samples: Sample[] = [
  {
    label: 'a Core height',
    q: '2569992',
    looksLike: /a number: could be a Core height, a Platform height or an epoch/,
    result: { name: /Core block 2,569,992/, href: '/block/2569992' },
  },
  {
    label: 'a Core height on testnet',
    q: '1500000',
    network: 'testnet',
    looksLike: /a number/,
    result: { name: /Core block 1,500,000/, href: '/block/1500000?network=testnet' },
  },
  {
    label: 'a block hash',
    q: BLOCK_HASH,
    looksLike: /a 64-character hash/,
  },
  {
    label: 'a testnet block hash',
    q: TESTNET_BLOCK_HASH,
    network: 'testnet',
    looksLike: /a 64-character hash/,
  },
  {
    label: 'a public-key hash',
    q: PKH,
    looksLike: /a 40-character hash: a public-key hash/,
    result: { name: /Identity with this public-key hash/, href: `/identity/lookup?pkh=${PKH}` },
  },
  {
    label: 'an identity or contract ID',
    q: CONTRACT,
    looksLike: /an ID: could be an identity, a contract or a token/,
  },
  {
    label: 'a mainnet address',
    q: MAINNET_ADDRESS,
    looksLike: /a Core address/,
    result: { name: new RegExp(MAINNET_ADDRESS), href: `/address/${MAINNET_ADDRESS}` },
  },
  {
    label: 'a mainnet script address',
    q: MAINNET_P2SH,
    looksLike: /a Core address/,
    result: { name: new RegExp(MAINNET_P2SH), href: `/address/${MAINNET_P2SH}` },
  },
  {
    label: 'a testnet address',
    q: TESTNET_ADDRESS,
    network: 'testnet',
    looksLike: /a Core address/,
    result: {
      name: new RegExp(TESTNET_ADDRESS),
      href: `/address/${TESTNET_ADDRESS}?network=testnet`,
    },
  },
  {
    label: 'a testnet script address',
    q: TESTNET_P2SH,
    network: 'testnet',
    looksLike: /a Core address/,
    result: { name: new RegExp(TESTNET_P2SH), href: `/address/${TESTNET_P2SH}?network=testnet` },
  },
  {
    label: 'a Platform address',
    q: MAINNET_PLATFORM,
    looksLike: /a Platform address/,
    result: { name: new RegExp(MAINNET_PLATFORM), href: `/platform-address/${MAINNET_PLATFORM}` },
  },
  {
    label: 'a testnet Platform address',
    q: TESTNET_PLATFORM,
    network: 'testnet',
    looksLike: /a Platform address/,
    result: {
      name: new RegExp(TESTNET_PLATFORM),
      href: `/platform-address/${TESTNET_PLATFORM}?network=testnet`,
    },
  },
  {
    label: 'an IP address with a port',
    q: '85.209.241.228:9999',
    looksLike: /an IP address: a masternode’s service address/,
    result: {
      name: /Masternode 85\.209\.241\.228:9999/,
      href: '/mn/219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32',
    },
  },
  {
    label: 'a date',
    q: '2026-10-01',
    looksLike: /a date: the Core blocks of that UTC day/,
    result: { name: /Core blocks on October 1, 2026/, href: '/blocks?date=2026-10-01' },
  },
  {
    label: 'a name typed with capitals, offered as its name page',
    q: 'Pshenmic.dash',
    looksLike: /text: could be a name, a contract or a token/,
    result: { name: /pshenmic\.dash/, href: '/name/pshenmic' },
  },
]

async function openPalette(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('/')
  const dialog = page.getByRole('dialog', { name: 'Search Radar' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('search page', () => {
  for (const s of samples) {
    test(`understands ${s.label} @X-01 @NX-05 @IN-10`, async ({ page }) => {
      const network = s.network ? `&network=${s.network}` : ''
      await page.goto(`/search?q=${encodeURIComponent(s.q)}${network}`)

      await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible()
      await expect(page.locator('[data-classified]')).toContainText(s.looksLike)
      if (s.result) {
        const link = page.getByRole('link', { name: s.result.name }).first()
        await expect(link).toBeVisible()
        await expect(link).toHaveAttribute('href', s.result.href)
      }
      if (s.withheld) {
        await expect(page.locator('[data-classified]')).toBeVisible()
        await expect(page.getByRole('link', { name: s.withheld })).toHaveCount(0)
      }
      if (s.withheldRoute && !routeBuilt(s.withheldRoute.route)) {
        await expect(page.locator('[data-classified]')).toBeVisible()
        await settled(page)
        await expect(page.locator(`a[href^="${s.withheldRoute.prefix}"]`)).toHaveCount(0)
      }
    })
  }

  test('says nothing was found and offers the other network @X-01 @NX-05', async ({ page }) => {
    await page.goto(`/search?q=${UNKNOWN_HASH}`)

    await expect(page.getByText('No match for', { exact: false })).toBeVisible()
    await page.getByRole('link', { name: 'Search Testnet' }).click()

    await expect(page).toHaveURL(new RegExp(`/search\\?.*network=testnet`))
    await expect(page.getByRole('button', { name: /Network: Testnet/ })).toBeVisible()
    await expect(page.getByText('No match for', { exact: false })).toContainText('Testnet')
  })

  test('says plainly that nonsense matched nothing and offers only a name guess @IN-10', async ({
    page,
  }) => {
    await page.goto('/search?q=zzzz-not-a-real-core-thing-12345')

    await expect(page.getByText(/No match for .* on Mainnet/)).toBeVisible()
    const guess = page.getByRole('region', { name: 'A guess' })
    await expect(guess.getByText('zzzz-not-a-real-core-thing-12345.dash')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Platform' })).toHaveCount(0)
  })

  test('says what it cannot look up @X-01', async ({ page }) => {
    await page.goto('/search?q=%3F')

    await expect(page.getByText('isn’t something Radar can look up')).toBeVisible()
  })

  test('explains the box when it is empty and links examples @X-01', async ({ page }) => {
    await page.goto('/search')

    await expect(page.getByText('What you can search for')).toBeVisible()
    await page.getByRole('link', { name: '2569992' }).click()

    await expect(page).toHaveURL(/q=2569992/)
    await expect(page.getByRole('link', { name: /Core block 2,569,992/ })).toBeVisible()
  })

  test('submitting the box puts the query in the link @X-01', async ({ page }) => {
    await page.goto('/search')

    await page.getByRole('searchbox', { name: 'Search Radar' }).fill('2026-10-01')
    await page.getByRole('button', { name: 'Search', exact: true }).click()

    await expect(page).toHaveURL(/q=2026-10-01$/)
    await expect(page.getByRole('link', { name: /Core blocks on/ })).toBeVisible()
  })

  test('a recovery phrase is not searched @X-01', async ({ page }) => {
    const phrase =
      'abandon ability able about above absent absorb abstract absurd abuse access accident'
    await page.goto(`/search?q=${encodeURIComponent(phrase)}`)

    await expect(page.getByText('That looks like a private key or recovery phrase')).toBeVisible()
    await expect(page.getByRole('searchbox')).toHaveValue('')
  })

  test('results have no serious accessibility violations @X-01', async ({ page }) => {
    await page.goto('/search?q=2569992')
    await expect(page.getByRole('link', { name: /Core block 2,569,992/ })).toBeVisible()

    await expectAccessible(page)
  })
})

test.describe('palette', () => {
  test('opens from the bar, with / and with Ctrl+K, and returns focus @X-01 @X-07', async ({
    page,
    viewport,
  }) => {
    await page.goto('/status')
    await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible()

    await page.keyboard.press('/')
    const dialog = page.getByRole('dialog', { name: 'Search Radar' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: 'Search Radar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await page.keyboard.press('Control+k')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(dialog).toBeHidden()

    if ((viewport?.width ?? 0) > 640) {
      await page.locator('[data-palette-trigger]:visible').first().click()
      await expect(dialog).toBeVisible()
    }
    await expect(page).toHaveURL(/\/status$/)
  })

  test('Enter on a recovery phrase never reaches the address bar @X-01', async ({ page }) => {
    const dialog = await openPalette(page, '/')

    await dialog
      .getByRole('combobox')
      .fill('abandon ability able about above absent absorb abstract absurd abuse access accident')
    await page.keyboard.press('Enter')

    await expect(dialog.getByText(/private key or recovery phrase/)).toBeVisible()
    expect(page.url()).not.toContain('abandon')
  })

  test('the search box follows the address when the palette changes the query @X-01', async ({
    page,
  }) => {
    await page.goto('/search?q=foo')
    const box = page.getByRole('searchbox', { name: 'Search Radar' })
    await expect(box).toHaveValue('foo')

    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Search Radar' }).fill('abandon ability able about')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/search\?q=abandon%20ability%20able%20about$/)
    await expect(box).toHaveValue('abandon ability able about')
  })

  test('/ does not steal typing from a text box @X-07', async ({ page }) => {
    await page.goto('/search')
    const box = page.getByRole('searchbox', { name: 'Search Radar' })
    await box.click()

    await page.keyboard.type('a/b')

    await expect(box).toHaveValue('a/b')
    await expect(page.getByRole('dialog', { name: 'Search Radar' })).toBeHidden()
  })

  test('shows what the input is as you type and opens an exact match on Enter @X-01 @X-07', async ({
    page,
  }) => {
    const dialog = await openPalette(page, '/')

    await dialog.getByRole('combobox').fill(MAINNET_ADDRESS)
    await expect(dialog.getByText(/Looks like a Core address/)).toBeVisible()
    await expect(
      dialog.getByRole('option', { name: new RegExp(`^${MAINNET_ADDRESS}`) }),
    ).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/address/${MAINNET_ADDRESS}$`))
    await expect(dialog).toBeHidden()
  })

  test('an address from the other network opens there @X-01 @X-03', async ({ page }) => {
    const dialog = await openPalette(page, '/')

    await dialog.getByRole('combobox').fill(TESTNET_ADDRESS)
    await expect(dialog.getByText('This is a testnet address')).toBeVisible()
    await expect(dialog.getByText('Open on Testnet')).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/address/${TESTNET_ADDRESS}\\?network=testnet$`))
    await expect(page.getByRole('button', { name: /Network: Testnet/ })).toBeVisible()
  })

  test('a typed height opens its Core block, never the results page @X-01', async ({ page }) => {
    const dialog = await openPalette(page, '/')

    await dialog.getByRole('combobox').fill('2569992')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/block\/2569992$/)
  })

  test('arrow keys choose a result @X-07', async ({ page }) => {
    const dialog = await openPalette(page, '/')

    await dialog.getByRole('combobox').fill('2569992')
    await expect(dialog.getByRole('option', { name: /Core block 2,569,992/ })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page).not.toHaveURL(/\/search/)
    await expect(page).toHaveURL(/\/block\/2569992$/)
  })

  test('finds pages by name @X-01', async ({ page }) => {
    const dialog = await openPalette(page, '/')

    await dialog.getByRole('combobox').fill('mempo')
    await dialog.getByRole('option', { name: /Mempool/ }).click()

    await expect(page).toHaveURL(/\/mempool$/)
  })

  test('keeps the network on the page it opens @X-01 @X-03', async ({ page }) => {
    const dialog = await openPalette(page, '/status?network=testnet')

    await dialog.getByRole('combobox').fill('1500000')
    await expect(dialog.getByRole('option', { name: /Core block 1,500,000/ })).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/block\/1500000\?network=testnet$/)
  })

  test('fits a phone and has no serious accessibility violations @X-08', async ({ page }) => {
    const dialog = await openPalette(page, '/')
    await dialog.getByRole('combobox').fill('2569992')
    await expect(dialog.getByRole('option', { name: /Core block 2,569,992/ })).toBeVisible()

    const box = await dialog.boundingBox()
    const viewport = page.viewportSize()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0)
    await expectAccessible(page)
  })
})
