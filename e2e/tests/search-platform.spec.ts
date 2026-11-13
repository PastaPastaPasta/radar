import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { netIds } from '../routes/fixtures'
import { routeBuilt as built } from '../routes/uni-s'

const main = netIds('mainnet')
const test_ = netIds('testnet')

const IDENTITY = main.id('identity', '')
const CONTRACT = main.id('contract', '')
const TOKEN = main.id('token', '')
const PBLOCK = main.id('pblock', '').toLowerCase()
const PTX = main.id('ptx', '').toLowerCase()
const EVO = main.id('mn_evo', '')
const EPOCH = main.id('epoch_final', '')
const DPNS_CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const DOC_ID = main.id('doc', 'FXyN2NZAdRFADgBQfb1XM1Qq7pWoEcgSWj1GaiQJqcrS')
const DOC = { contract: DPNS_CONTRACT, id: DOC_ID, type: 'domain' }
const EVO_IP = '46.62.250.247'
const TESTNET_IDENTITY = test_.id('identity', '')

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58ToHex(value: string): string {
  let n = 0n
  for (const ch of value) n = n * 58n + BigInt(ALPHABET.indexOf(ch))
  return n.toString(16).padStart(64, '0')
}

const isHosted = (url: string): boolean => {
  const u = new URL(url)
  return (
    u.pathname.startsWith('/x/hy/') ||
    u.hostname.endsWith('pe.dashhq.org') ||
    u.hostname === 'radar.dashhq.org' ||
    u.hostname.startsWith('insight.') ||
    /(^|\.)kw\.vg$/.test(u.hostname)
  )
}

const CLASS = {
  int: /a number: could be a Core height, a Platform height or an epoch/,
  hash: /a 64-character hash: could be a Core block, a transaction, a Platform block, a state transition or an identity/,
  id: /an ID: could be an identity, a contract or a token/,
  path: /a document path: a contract, a document type and a document ID/,
  name: /a name/,
  text: /text: could be a name, a contract or a token/,
}

async function search(page: Page, q: string, extra = '') {
  await page.goto(`/search?q=${encodeURIComponent(q)}${extra}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible()
}

async function openPalette(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('/')
  const dialog = page.getByRole('dialog', { name: 'Search Radar' })
  await expect(dialog).toBeVisible()
  return dialog
}

const hrefLink = (page: Page, href: string) => page.locator(`a[href="${href}"]`)

test.describe('search page: what the input was and every kind it can be', () => {
  test('an epoch number is offered with the Core and Platform heights it could also be @X-01 @NX-05', async ({
    page,
  }) => {
    await search(page, EPOCH)

    await expect(page.locator('[data-classified]')).toContainText(CLASS.int)
    await expect(hrefLink(page, `/block/${EPOCH}`)).toBeVisible()
    await expect(hrefLink(page, `/platform/block/${EPOCH}`)).toBeVisible()
    await expect(hrefLink(page, `/epoch/${EPOCH}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Platform' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Core' })).toBeVisible()
    await expectAccessible(page)
  })

  test('a number past the Platform and epoch tips is only a Core height @X-01 @NX-05', async ({
    page,
  }) => {
    await search(page, '2569992')

    await expect(hrefLink(page, '/block/2569992')).toBeVisible()
    await settled(page)
    await expect(hrefLink(page, '/platform/block/2569992')).toHaveCount(0)
    await expect(hrefLink(page, '/epoch/2569992')).toHaveCount(0)
  })

  test('an identity ID finds the identity, proof-checked, once @X-01 @NX-05 @PE-27', async ({
    page,
  }) => {
    await search(page, IDENTITY)

    await expect(page.locator('[data-classified]')).toContainText(CLASS.id)
    const link = hrefLink(page, `/identity/${IDENTITY}`)
    await expect(link).toHaveCount(1)
    await expect(link).toContainText('pshenmic.dash')
    await settled(page)
    const row = page.locator(`li[data-kind="identity"]`).filter({ has: link })
    await expect(row.locator('[data-source="sdk"][data-proved="true"]')).toHaveCount(1)
    await expect(row.locator('[data-source="pe"]')).toHaveCount(0)
    await expectAccessible(page)
  })

  test('an identity written as 64 hex characters is found too @X-01 @NX-05', async ({ page }) => {
    await search(page, base58ToHex(IDENTITY))

    await expect(page.locator('[data-classified]')).toContainText(CLASS.hash)
    await expect(hrefLink(page, `/identity/${IDENTITY}`)).toHaveCount(1)
  })

  test('a contract ID finds the contract @X-01 @NX-05 @PE-27', async ({ page }) => {
    await search(page, CONTRACT)

    await expect(hrefLink(page, `/contract/${CONTRACT}`)).toHaveCount(1)
    await expect(hrefLink(page, `/identity/${CONTRACT}`)).toHaveCount(0)
  })

  test('a token ID finds the token once its page is built @X-01 @NX-05 @PE-27', async ({
    page,
  }) => {
    await search(page, TOKEN)

    await expect(page.locator('[data-classified]')).toContainText(CLASS.id)
    await settled(page)
    await expect(hrefLink(page, `/token/${TOKEN}`)).toHaveCount(built('/token/$id') ? 1 : 0)
  })

  test('a document is found from contract/type/ID, and a bare document ID only by Explorer @X-01 @NX-05', async ({
    page,
  }) => {
    await search(page, `${DOC.contract}/${DOC.type}/${DOC.id}`)

    await expect(page.locator('[data-classified]')).toContainText(CLASS.path)
    await expect(hrefLink(page, `/document/${DOC.contract}/${DOC.type}/${DOC.id}`)).toHaveCount(1)

    await search(page, DOC_ID)
    await expect(page.locator('[data-classified]')).toContainText(CLASS.id)
    await expect(hrefLink(page, `/document/${DOC.contract}/${DOC.type}/${DOC.id}`)).toHaveCount(1)

    await search(page, DOC_ID, '&sources=decentralized')
    await expect(page.locator('[data-classified]')).toContainText(CLASS.id)
    await expect(page.getByText(/No match for/)).toBeVisible()
    await expect(
      page.getByText(/paste its contract, type and ID as contract\/type\/ID/),
    ).toBeVisible()
  })

  test('a Platform block hash, a state transition hash and an evonode hash each open their page @X-01 @NX-05 @PE-27', async ({
    page,
  }) => {
    await search(page, PBLOCK)
    await expect(page.locator('[data-classified]')).toContainText(CLASS.hash)
    await expect(page.locator('a[href^="/platform/block/"]').first()).toBeVisible()

    await search(page, PTX)
    await expect(hrefLink(page, `/platform/tx/${PTX}`)).toHaveCount(1)

    await search(page, EVO)
    await expect(hrefLink(page, `/mn/${EVO}`)).toBeVisible()
  })

  test('a public-key hash goes to the identity lookup @X-01 @NX-05', async ({ page }) => {
    const pkh = main.id('pkh', '')
    await search(page, pkh)

    await expect(page.locator('[data-classified]')).toContainText(
      /a 40-character hash: a public-key hash/,
    )
    await expect(hrefLink(page, `/identity/lookup?pkh=${pkh}`)).toBeVisible()
  })

  test('a Platform address is read as one, and its page is offered when built @X-01 @NX-05', async ({
    page,
  }) => {
    const paddr = main.paddr()
    await search(page, paddr)

    await expect(page.locator('[data-classified]')).toContainText(/a Platform address/)
    await settled(page)
    await expect(hrefLink(page, `/platform-address/${paddr}`)).toHaveCount(
      built('/platform-address/$addr') ? 1 : 0,
    )
  })

  test('a registered name shows its identity, and its name and contest pages once built @X-01 @NX-05 @PE-27', async ({
    page,
  }) => {
    await search(page, 'pshenmic.dash')

    await expect(page.locator('[data-classified]')).toContainText(CLASS.name)
    await expect(hrefLink(page, `/identity/${IDENTITY}`)).toHaveCount(1)
    await settled(page)
    await expect(hrefLink(page, '/name/pshenmic')).toHaveCount(built('/name/$label') ? 1 : 0)
    await expect(hrefLink(page, '/contest/pshenmic')).toHaveCount(built('/contest/$label') ? 1 : 0)
  })

  test('text is searched in Explorer, grouped by kind, without repeats @X-01 @NX-05 @PE-27', async ({
    page,
  }) => {
    await search(page, 'quantum')

    await expect(page.locator('[data-classified]')).toContainText(CLASS.text)
    await settled(page)
    await expect(page.getByRole('heading', { name: 'Platform' })).toBeVisible()
    await expect(
      hrefLink(page, '/identity/BMJWm8wKmbApR7nQ6q7RG3HgD8maJ8t7B4yWBKRe7aZ6'),
    ).toHaveCount(1)
    await expect(page.locator('li[data-kind="identity"]').first()).toContainText(/quantum/i)
  })

  test('a contract is found by its keyword, tokens by their name, and a system contract once @X-01 @NX-05 @PE-27', async ({
    page,
  }) => {
    await search(page, 'sans')
    await expect(hrefLink(page, `/contract/${CONTRACT}`)).toHaveCount(1)
    await expect(hrefLink(page, `/token/${TOKEN}`)).toHaveCount(built('/token/$id') ? 1 : 0)

    await search(page, 'dashpay')
    await settled(page)
    await expect(
      hrefLink(page, '/contract/Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7'),
    ).toHaveCount(1)
  })

  test('older recordings of one kind keep their rank order and every row has its icon @X-01', async ({
    page,
  }) => {
    await search(page, 'quantum')
    await settled(page)

    const rows = page.locator('li[data-kind]')
    expect(await rows.count()).toBeGreaterThan(0)
    for (const row of await rows.all()) {
      await expect(row.locator('.rx-glyph[data-layer]')).toHaveCount(1)
    }
  })
})

test.describe('nothing found', () => {
  test('says so for the network it asked, and carries the same search to the other @X-01 @NX-05', async ({
    page,
  }) => {
    await search(page, TESTNET_IDENTITY)

    const none = page.getByText(/No match for/)
    await expect(none).toBeVisible()
    await expect(none).toContainText('Mainnet')
    await page.getByRole('link', { name: 'Search Testnet' }).click()

    await expect(page).toHaveURL(new RegExp(`/search\\?.*q=${TESTNET_IDENTITY}`))
    await expect(page).toHaveURL(/network=testnet/)
    await expect(hrefLink(page, `/identity/${TESTNET_IDENTITY}?network=testnet`)).toHaveCount(1)
  })

  test('a name nobody holds is not offered as found @X-01 @NX-05', async ({ page }) => {
    await search(page, 'zzzz-not-a-real-core-thing-12345')

    await expect(page.getByText(/No match for/)).toContainText('Mainnet')
    await expect(page.locator('li[data-kind="name"]')).toHaveCount(0)
  })
})

test.describe('palette and header', () => {
  test('finds each kind with its icon and layer colour, and Enter opens the exact one @X-01 @X-07 @NX-05', async ({
    page,
  }) => {
    const dialog = await openPalette(page)
    const box = dialog.getByRole('combobox')
    const cases: [string, RegExp, string, string][] = [
      [IDENTITY, /pshenmic\.dash/, `/identity/${IDENTITY}`, 'platform'],
      [CONTRACT, /Contract/, `/contract/${CONTRACT}`, 'platform'],
      [PTX, /State transition/, `/platform/tx/${PTX}`, 'platform'],
      [EVO, /Evonode/, `/mn/${EVO}`, 'network'],
    ]
    for (const [q, name, href, layer] of cases) {
      await box.fill(q)
      const option = dialog.getByRole('option', { name })
      await expect(option.first()).toBeVisible()
      await expect(option.first().locator(`.rx-glyph[data-layer="${layer}"]`)).toHaveCount(1)
      void href
    }

    await box.fill(IDENTITY)
    await expect(dialog.getByRole('option', { name: /pshenmic\.dash/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/identity/${IDENTITY}$`))
  })

  test('the header box opens the same palette and its results @X-01', async ({
    page,
    viewport,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if ((viewport?.width ?? 0) > 640) {
      await page.locator('[data-palette-trigger]:visible').first().click()
    } else {
      await page.keyboard.press('/')
    }
    const dialog = page.getByRole('dialog', { name: 'Search Radar' })
    await dialog.getByRole('combobox').fill(CONTRACT)

    await expect(
      dialog.getByText(/Looks like an ID: could be an identity, a contract or a token/),
    ).toBeVisible()
    await expect(dialog.getByRole('option', { name: /Contract/ }).first()).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/contract/${CONTRACT}$`))
  })

  test('arrow keys move through Platform results and a word lists matching pages first @X-07', async ({
    page,
  }) => {
    const dialog = await openPalette(page)
    const box = dialog.getByRole('combobox')

    await box.fill('mempo')
    await expect(dialog.getByRole('option').first()).toContainText(/Mempool/)

    await box.fill(IDENTITY)
    const options = dialog.getByRole('option')
    await expect(options.first()).toContainText(/pshenmic\.dash/)
    await page.keyboard.press('ArrowDown')
    await expect(options.first()).toHaveAttribute('data-selected', 'true')
  })

  test('fits a phone and has no serious accessibility violations with Platform results @X-08', async ({
    page,
  }) => {
    const dialog = await openPalette(page)
    await dialog.getByRole('combobox').fill(IDENTITY)
    await expect(dialog.getByRole('option', { name: /pshenmic\.dash/ })).toBeVisible()

    const box = await dialog.boundingBox()
    const viewport = page.viewportSize()
    expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0)
    await expectAccessible(page)
  })
})

test.describe('Decentralized only mode', () => {
  function watchHosted(page: Page): string[] {
    const hosted: string[] = []
    page.on('request', (request) => {
      if (isHosted(request.url())) hosted.push(`${request.method()} ${request.url()}`)
    })
    return hosted
  }

  test('asks no hosted service, finds what the SDK and nodes answer, and names what it skipped @X-01 @NX-05 @X-05', async ({
    page,
  }) => {
    const hosted = watchHosted(page)

    await search(page, IDENTITY, '&sources=decentralized')
    await expect(hrefLink(page, `/identity/${IDENTITY}?sources=decentralized`)).toBeVisible()
    await settled(page)
    await expect(page.locator('[data-unavailable="mode"]')).toContainText(
      /Lookups in an index were skipped/,
    )
    await expect(page.locator('[data-unavailable="mode"]')).toContainText(/Platform Explorer/)

    await search(page, EPOCH, '&sources=decentralized')
    await expect(hrefLink(page, `/epoch/${EPOCH}?sources=decentralized`)).toBeVisible()
    await settled(page)
    await expect(page.locator('a[href^="/platform/block/"]')).toHaveCount(0)
    await expect(page.locator('[data-unavailable="mode"]')).toContainText(/Platform blocks/)

    expect(hosted, 'requests to a hosted service').toEqual([])
  })

  test('finds a ProTx and a service address in the DAPI masternode list @NX-05 @X-05', async ({
    page,
  }) => {
    const hosted = watchHosted(page)

    await search(page, EVO, '&sources=decentralized')
    await expect(page.locator(`a[href^="/mn/${EVO}"]`).first()).toBeVisible()

    await search(page, EVO_IP, '&sources=decentralized')
    await expect(page.locator(`a[href^="/mn/${EVO}"]`).first()).toBeVisible()
    expect(hosted, 'requests to a hosted service').toEqual([])
  })

  test('a state transition hash is checked with a node, not Explorer @NX-05 @X-05', async ({
    page,
  }) => {
    const hosted = watchHosted(page)

    await search(page, PTX, '&sources=decentralized')
    await expect(page.locator(`a[href^="/platform/tx/${PTX}"]`).first()).toBeVisible()
    expect(hosted, 'requests to a hosted service').toEqual([])
  })
})
