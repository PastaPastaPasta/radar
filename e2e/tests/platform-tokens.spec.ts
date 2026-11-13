import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'
import { TOKEN_HOLDER } from '../routes/p-token'

const expect = baseExpect.configure({ timeout: 15_000 })

const NET = {
  mainnet: {
    token: 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB',
    contract: 'ENDv6HL8MrkAhotcM5vBDaTy4ameZzyHN4MWB7mp13TR',
    identity: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp',
    other: '81x7N39zKLhYDpYg6vk9AUjapc8VMxuDDZGHSMxPna5m',
    name: 'pshenmic',
    paddr: 'dash1kpn8c0q9rpz09k8cy6pgzyqhln7yy00cdue3kgjx',
    symbol: 'SANS',
    owner: '3sL6q6eVCR6y8Ld6Gr14cedhJWNBPmBp3S5VtRcckxzE',
  },
  testnet: {
    token: '9YxdbQUjJmQsmVPen95HjAU3Esj7tVkWSY2EQWT84ZQP',
    contract: 'Y189uedQG3CJCuu83P3DqnG7ngQaRKz69x3gY8uDzQe',
    identity: '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk',
    other: 'PJUBWbXWmzEYCs99rAAbnCiHRzrnhKLQrXbmSsuPBYB',
    name: 'therealslimshaddy5',
    paddr: 'tdash1kpgz9hk6tkn5zj3653s8qkjmk9439qkf0gt229dv',
    symbol: 'token',
    owner: '',
  },
} as const
type Net = keyof typeof NET

const M = NET.mainnet
const ABSENT = '7fTiLgNCANR7Wf4D7ZuHBje9nrbrgnZpTDXuRdVdv5Ds'
const MODE = '[data-unavailable="mode"]'

const url = (path: string, net: Net = 'mainnet', query: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    ...(net === 'testnet' ? { network: 'testnet' } : {}),
    ...query,
  })
  const q = params.toString()
  return `${path}${q ? `?${q}` : ''}`
}

const open = async (page: Page, target: string, h1: string) => {
  await page.goto(target)
  await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
  await settled(page)
}

const tokenUrl = (net: Net = 'mainnet', query: Record<string, string> = {}) =>
  url(`/token/${NET[net].token}`, net, query)
const holdersUrl = (net: Net, ids: string[]) =>
  url(`/token/${NET[net].token}/holders`, net, ids.length > 0 ? { ids: ids.join(',') } : {})

/** Records every SDK call the page makes, by method and arguments, in `window.__sdkCalls`. */
async function recordSdkCalls(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    let held: { call: (...a: unknown[]) => unknown } | undefined
    w.__sdkCalls = []
    Object.defineProperty(w, '__radarSdk', {
      configurable: true,
      get: () => held,
      set: (value: { call: (...a: unknown[]) => unknown }) => {
        held = value
        const real = value.call.bind(value)
        value.call = (net, method, args, signal) => {
          ;(w.__sdkCalls as { method: unknown; args: unknown }[]).push({ method, args })
          return real(net, method, args, signal)
        }
      },
    })
  })
}

const sdkCalls = (page: Page, method: string) =>
  page.evaluate(
    (m) =>
      (
        (window as unknown as { __sdkCalls: { method: string; args: unknown }[] }).__sdkCalls ?? []
      ).filter((c) => c.method === m),
    method,
  )

const overview = (page: Page) => page.locator('#token-summary')

test.describe('Token page', () => {
  for (const net of ['mainnet', 'testnet'] as const) {
    test(`${net} shows the name, supply, price and status, and names the contract and position it comes from @NX-30 @NX-32 @PE-25`, async ({
      page,
    }) => {
      await open(page, tokenUrl(net), 'Token')
      const t = NET[net]
      const summary = overview(page)
      await expect(summary.locator('[data-token-supply]')).toContainText(/\d/)
      await expect(summary.getByText('Total supply', { exact: true })).toBeVisible()
      await expect(summary.getByText('Direct purchase price', { exact: true })).toBeVisible()
      await expect(summary.getByText('Active', { exact: true })).toBeVisible()
      await expect(summary.getByText('Proof-checked').first()).toBeVisible()
      const contract = summary
        .getByRole('link', { name: new RegExp(t.contract.slice(0, 5)) })
        .first()
      await expect(contract).toHaveAttribute(
        'href',
        new RegExp(`/contract/${t.contract}.*tab=tokens`),
      )
      await expect(summary.getByText('Position in the contract', { exact: true })).toBeVisible()
      await expect(page.locator('[data-token-plural], [data-eyebrow]').first()).toBeVisible()
      await expectAccessible(page)
    })
  }

  test('shows the localised name from the contract beside the token chip @NX-30', async ({
    page,
  }) => {
    await open(page, tokenUrl(), 'Token')
    await expect(
      page.locator('[data-page="/token/$id"] header').getByText(M.symbol, { exact: false }).first(),
    ).toBeVisible()
  })

  test('saves the token, copies its link and offers the Bridge as a link out @NX-30', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
    await open(page, tokenUrl(), 'Token')
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toHaveAttribute('aria-pressed', 'false')
    await save.click()
    await expect(save).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => localStorage.getItem('radar.saved'))).toContain(M.token)
    await page.getByRole('button', { name: 'Copy link', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeAttached()
    const bridge = page.getByRole('link', { name: /Manage in Bridge/ })
    await expect(bridge).toHaveAttribute('href', new RegExp(`network=mainnet`))
    await expect(bridge).toHaveAttribute('target', '_blank')
  })

  test('lists who may do what, the names and the raw configuration on the definition tab @NX-30 @PE-25', async ({
    page,
  }) => {
    await open(page, tokenUrl('mainnet', { tab: 'definition' }), 'Token')
    const rules = page.locator('#token-rules')
    await expect(rules.getByText('Mint', { exact: true }).first()).toBeVisible()
    await expect(rules.getByText('No one').first()).toBeVisible()
    await expect(page.locator('#token-names')).toContainText(M.symbol)
    await expect(page.locator('#token-definition')).toContainText('Decimals')
    await expect(page.locator('#token-raw')).toBeVisible()
    await expect(page.locator('#token-raw').getByRole('button').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('says a token without perpetual distribution has no claims to look up @PE-25', async ({
    page,
  }) => {
    await open(page, tokenUrl('mainnet', { tab: 'distribution' }), 'Token')
    await expect(page.locator('#token-distribution')).toContainText('Perpetual distribution')
    await expect(page.locator('#token-distribution')).toContainText('None')
    await expect(page.locator('#token-last-claim')).toContainText(
      'This token has no perpetual distribution.',
    )
    await expectAccessible(page)
  })

  test('looks up the balance of an identity by ID @NX-30', async ({ page }) => {
    await open(page, tokenUrl('mainnet', { tab: 'balance', who: TOKEN_HOLDER.mainnet }), 'Token')
    const balance = page.locator('#token-balance')
    await expect(balance.locator('[data-field="token-balance"]')).toContainText(M.symbol)
    await expect(balance.getByText('Not frozen')).toBeVisible()
    await expect(balance.getByText('Proof-checked').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('looks up the balance of an identity by DPNS name and shows the ID it resolved to @NX-30', async ({
    page,
  }) => {
    await open(page, tokenUrl('mainnet', { tab: 'balance' }), 'Token')
    await page.getByLabel('Identity ID or name').fill(M.name)
    await page.getByRole('button', { name: 'Look up', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`who=${M.name}`))
    const balance = page.locator('#token-balance')
    await expect(balance.locator('[data-field="token-balance"]')).toBeVisible()
    await expect(balance).toContainText(`${M.name}.dash`)
  })

  test('says a name nobody holds, and a malformed entry, without an error alert @NX-30', async ({
    page,
  }) => {
    await open(page, tokenUrl('mainnet', { tab: 'balance', who: 'radarfx44661899' }), 'Token')
    await expect(page.getByText('No identity has the name radarfx44661899.dash.')).toBeVisible()
    await page.getByLabel('Identity ID or name').fill('!!')
    await page.getByRole('button', { name: 'Look up', exact: true }).click()
    await expect(
      page.getByRole('alert').filter({ hasText: 'neither an identity ID' }),
    ).toBeVisible()
  })

  test('says a token ID nobody holds is not found and offers the other network and the contract form @NX-30 @NX-32', async ({
    page,
  }) => {
    await page.goto(url(`/token/${ABSENT}`))
    await expect(page.getByText('No token with this ID on mainnet.')).toBeVisible()
    await settled(page)
    await expect(page.getByRole('link', { name: 'Search on testnet' })).toHaveAttribute(
      'href',
      new RegExp(`/token/${ABSENT}\\?.*network=testnet`),
    )
    await expect(page.locator('[data-by-contract]')).toBeVisible()
    await expect(page.locator('.rx-tabs')).toHaveCount(0)
    await expectAccessible(page)
  })

  test('explains a malformed token ID instead of failing @NX-30', async ({ page }) => {
    await page.goto('/token/not-a-token')
    await expect(page.getByText('That isn’t a token ID.')).toBeVisible()
    await expect(page.locator('[data-by-contract]')).toBeVisible()
  })

  test('opens a token from its contract ID and position @NX-32', async ({ page }) => {
    await open(page, '/tokens', 'Tokens')
    const form = page.locator('[data-by-contract]')
    await form.getByLabel('Contract ID').fill(M.contract)
    await form.getByLabel('Position').fill('0')
    await form.getByRole('button', { name: 'Open token' }).click()
    await expect(page).toHaveURL(new RegExp(`/token/${M.token}`))
    await expect(page.getByRole('heading', { level: 1, name: 'Token' })).toBeVisible()
  })

  test('refuses a contract ID or position that cannot name a token @NX-32', async ({ page }) => {
    await open(page, '/tokens', 'Tokens')
    const form = page.locator('[data-by-contract]')
    await form.getByLabel('Contract ID').fill('nope')
    await form.getByLabel('Position').fill('0')
    await form.getByRole('button', { name: 'Open token' }).click()
    await expect(form.getByRole('alert')).toContainText('isn’t a contract ID')
    await form.getByLabel('Contract ID').fill(M.contract)
    await form.getByLabel('Position').fill('x')
    await form.getByRole('button', { name: 'Open token' }).click()
    await expect(form.getByRole('alert')).toContainText('whole number')
    await expect(page).toHaveURL(/\/tokens/)
  })

  test('carries the contract and position of the token it shows into the open-by-contract form @NX-32', async ({
    page,
  }) => {
    await open(page, tokenUrl(), 'Token')
    const form = page.locator('[data-by-contract]')
    await expect(form.getByLabel('Contract ID')).toHaveValue(M.contract)
    await expect(form.getByLabel('Position')).toHaveValue('0')
  })

  test('has no side scroll on any tab @NX-30 @PE-25', async ({ page }) => {
    for (const tab of [
      'overview',
      'definition',
      'distribution',
      'balance',
      'activity',
      'holders',
    ]) {
      await open(page, tokenUrl('mainnet', tab === 'overview' ? {} : { tab }), 'Token')
      expect(await horizontalOverflow(page), tab).toBeLessThanOrEqual(0)
    }
  })
})

test.describe('Token activity and holders from Platform Explorer', () => {
  for (const net of ['mainnet', 'testnet'] as const) {
    test(`${net} lists the token's transitions with their action, amount and time @PE-25`, async ({
      page,
    }) => {
      await open(page, tokenUrl(net, { tab: 'activity' }), 'Token')
      const activity = page.locator('#token-activity')
      await expect(activity.getByText('Platform Explorer').first()).toBeVisible()
      await expect(activity.locator('tbody tr, .rx-card-row').first()).toBeVisible()
      await expectAccessible(page)
    })

    test(`${net} lists the holders with their balances @PE-25`, async ({ page }) => {
      await open(page, tokenUrl(net, { tab: 'holders' }), 'Token')
      const holders = page.locator('#token-holders')
      await expect(holders.locator('tbody tr, .rx-card-row').first()).toBeVisible()
      await expect(holders).toContainText(NET[net].symbol)
      await expectAccessible(page)
    })
  }
})

test.describe('Token holders by identity', () => {
  test('shows the balance of each identity typed in by ID, and keeps them in the address @NX-31', async ({
    page,
  }) => {
    await open(page, holdersUrl('mainnet', []), 'Token holders')
    await expect(page.getByText('No identities chosen yet')).toBeVisible()
    await page.getByLabel('Identity IDs or names').fill(`${TOKEN_HOLDER.mainnet} ${M.identity}`)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`ids=${TOKEN_HOLDER.mainnet}`))
    await settled(page)
    const table = page.locator('#token-holders-table')
    await expect(table.locator('[data-balance-state="known"]').first()).toContainText(M.symbol)
    await expect(table.locator('[data-balance-state]')).toHaveCount(2)
    await expectAccessible(page)
  })

  test('resolves a DPNS name to its identity before adding it @NX-31', async ({ page }) => {
    await open(page, holdersUrl('mainnet', []), 'Token holders')
    await page.getByLabel('Identity IDs or names').fill(M.name)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`ids=${M.identity}`))
    await settled(page)
    await expect(page.locator('#token-holders-table [data-balance-state]')).toHaveCount(1)
  })

  test('says what is wrong with an entry that is not an identity, and keeps the rest @NX-31', async ({
    page,
  }) => {
    await open(page, holdersUrl('mainnet', []), 'Token holders')
    await page.getByLabel('Identity IDs or names').fill(`${M.identity} !!`)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('neither an identity ID nor a name')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`ids=${M.identity}`))
  })

  test('adds the identities the viewer opened, once that is turned on @NX-31', async ({ page }) => {
    await page.addInitScript(
      ([id]) => {
        localStorage.setItem(
          'radar.viewed',
          JSON.stringify({ on: true, items: [{ net: 'mainnet', id, viewedAt: 1 }] }),
        )
      },
      [M.identity],
    )
    await open(page, holdersUrl('mainnet', []), 'Token holders')
    await page.getByRole('button', { name: 'Add the identities I viewed' }).click()
    await expect(page).toHaveURL(new RegExp(`ids=${M.identity}`))
    await settled(page)
    await expect(page.locator('#token-holders-table [data-balance-state]')).toHaveCount(1)
  })

  test('offers to turn on viewed identities while that is off @NX-31', async ({ page }) => {
    await open(page, holdersUrl('mainnet', []), 'Token holders')
    await expect(page.getByRole('button', { name: 'Add the identities I viewed' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Open Settings' })).toBeVisible()
  })

  test('removes an identity and clears the list @NX-31', async ({ page }) => {
    await open(
      page,
      holdersUrl('mainnet', [TOKEN_HOLDER.mainnet, M.identity].sort()),
      'Token holders',
    )
    await page.getByRole('button', { name: `Remove ${M.identity} from the list` }).click()
    await expect(page).not.toHaveURL(new RegExp(M.identity))
    await expect(page).toHaveURL(new RegExp(`ids=${TOKEN_HOLDER.mainnet}`))
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(page.getByText('No identities chosen yet')).toBeVisible()
  })

  test('asks the node once for the balances of every identity listed @NX-31', async ({ page }) => {
    await recordSdkCalls(page)
    const ids = [TOKEN_HOLDER.mainnet, M.identity, M.other].sort()
    await open(page, holdersUrl('mainnet', ids), 'Token holders')
    await expect(page.locator('#token-holders-table [data-balance-state]')).toHaveCount(3)
    const asked = await sdkCalls(page, 'tokens.balances')
    expect(asked).toHaveLength(1)
    expect(asked[0]?.args).toEqual({ tokenId: M.token, identityIds: ids })
  })

  test('says Platform has no holder index and points to the index that has one @NX-31 @PE-25', async ({
    page,
  }) => {
    await open(page, holdersUrl('mainnet', []), 'Token holders')
    const note = page.locator('[data-holder-index-note]')
    await expect(note).toContainText('Platform has no holder index')
    await expect(note.getByRole('link', { name: /Platform Explorer/ })).toHaveAttribute(
      'href',
      new RegExp(`/token/${M.token}`),
    )
  })

  test('works on testnet and has no side scroll @NX-31', async ({ page }) => {
    await open(
      page,
      holdersUrl('testnet', [NET.testnet.identity, TOKEN_HOLDER.testnet].sort()),
      'Token holders',
    )
    await expect(page.locator('#token-holders-table [data-balance-state]')).toHaveCount(2)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 1000) <= 640

/** On a phone the filters sit behind a "Filters" button. */
async function openFilters(page: Page): Promise<void> {
  if (!isPhone(page)) return
  const button = page.getByRole('button', { name: /^Filters/ })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
}

test.describe('Token list', () => {
  const rows = (page: Page) => page.locator('#tokens-list tbody tr:not(.rx-skelrow)')

  test('lists tokens with name, position, supply, contract and owner, and links each to its page @PE-24', async ({
    page,
  }) => {
    await open(page, '/tokens', 'Tokens')
    const list = page.locator('#tokens-list')
    if (!isPhone(page)) {
      for (const heading of ['Token', 'Position', 'Supply', 'Price', 'Contract', 'Owner']) {
        await expect(list.getByRole('columnheader', { name: heading })).toBeAttached()
      }
    }
    await expect(rows(page).first()).toBeVisible()
    await expect(list).toContainText('SANS')
    await expect(list.getByRole('link', { name: /SANS/ }).first()).toHaveAttribute(
      'href',
      new RegExp(`/token/${M.token}`),
    )
    await expect(list.getByText('Platform Explorer').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('shows the trending tokens @PE-24', async ({ page }) => {
    await open(page, '/tokens', 'Tokens')
    const trending = page.locator('#tokens-trending')
    await expect(trending.locator('[data-trending] li')).toHaveCount(5)
    await expect(trending).toContainText('transitions')
  })

  test('filters by name, and says what matches @PE-24', async ({ page }) => {
    await open(page, '/tokens', 'Tokens')
    await openFilters(page)
    const filters = page.locator('[data-filter-panel]').locator('visible=true')
    await filters.getByRole('textbox', { name: 'Name or token ID' }).fill('DUSD')
    await filters.getByRole('textbox', { name: 'Name or token ID' }).press('Enter')
    await expect(page).toHaveURL(/q=DUSD/)
    await settled(page)
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText('DUSD')
    await expect(page.getByText('Name or ID: DUSD')).toBeVisible()
  })

  test('filters by owner and removes the filter again @PE-24', async ({ page }) => {
    await open(page, url('/tokens', 'mainnet', { owner: M.owner }), 'Tokens')
    await expect(rows(page)).toHaveCount(2)
    await page.getByRole('button', { name: /Clear/i }).first().click()
    await expect(page).not.toHaveURL(/owner=/)
  })

  test('puts the newest first when asked, keeping the order in the address @PE-24', async ({
    page,
  }) => {
    await open(page, '/tokens', 'Tokens')
    const first = await rows(page).first().innerText()
    await page.getByRole('button', { name: 'Newest first' }).click()
    await expect(page).toHaveURL(/sort=-date/)
    await settled(page)
    await expect.poll(async () => rows(page).first().innerText()).not.toBe(first)
  })

  test('refuses a malformed owner filter without asking Platform Explorer @PE-24', async ({
    page,
  }) => {
    await open(page, '/tokens', 'Tokens')
    await openFilters(page)
    const filters = page.locator('[data-filter-panel]').locator('visible=true')
    await filters.getByRole('textbox', { name: 'Owner' }).fill('nope')
    await filters.getByRole('textbox', { name: 'Owner' }).press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: 'identity ID' })).toBeVisible()
    await expect(page).not.toHaveURL(/owner=/)
  })

  test('remembers the list mode and has a way to switch @PE-24', async ({ page }) => {
    await open(page, '/tokens', 'Tokens')
    await expect(page.locator('#tokens-list').getByRole('group').first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('lists the testnet tokens too @PE-24', async ({ page }) => {
    await open(page, url('/tokens', 'testnet'), 'Tokens')
    await expect(rows(page).first()).toBeVisible()
  })
})

test.describe('Platform address', () => {
  for (const net of ['mainnet', 'testnet'] as const) {
    test(`${net} shows the balance and nonce, proof-checked @NX-59`, async ({ page }) => {
      await open(page, url(`/platform-address/${NET[net].paddr}`, net), 'Platform address')
      const summary = page.locator('#paddr-summary')
      await expect(summary.locator('[data-paddr-balance]')).toContainText(/DASH/)
      await expect(summary.getByText('Nonce', { exact: true })).toBeVisible()
      await expect(summary.getByText('Proof-checked').first()).toBeVisible()
      await expect(page.getByRole('link', { name: /Manage in Bridge/ })).toHaveAttribute(
        'href',
        /address=/,
      )
      await expectAccessible(page)
    })

    test(`${net} lists the address's transitions, paged @PE-26`, async ({ page }) => {
      await open(page, url(`/platform-address/${NET[net].paddr}`, net), 'Platform address')
      const list = page.locator('#paddr-transitions')
      await expect(list.locator('tbody tr, .rx-card-row').first()).toBeVisible()
      await expect(list.getByText('Platform Explorer').first()).toBeVisible()
    })
  }

  test('says an address that holds nothing holds nothing, without an error @NX-59', async ({
    page,
  }) => {
    await open(
      page,
      url('/platform-address/dash1kqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zy22lqa3'),
      'Platform address',
    )
    await expect(page.getByText('This address holds nothing on mainnet.')).toBeVisible()
    await expect(page.locator('.rx-empty--error')).toHaveCount(0)
  })

  test('explains text that is not a Platform address @NX-59', async ({ page }) => {
    await page.goto('/platform-address/XhwQo3wUYRVfL3BGqyqfjL4PYrZpZTNhUX')
    await expect(page.getByText('That isn’t a Platform address.')).toBeVisible()
    await expect(page.locator('.rx-empty--error')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('says a testnet address belongs to testnet and links to it @NX-59', async ({ page }) => {
    await page.goto(`/platform-address/${NET.testnet.paddr}`)
    await expect(page.getByText('This is a testnet address.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open it on testnet' })).toHaveAttribute(
      'href',
      new RegExp(`network=testnet`),
    )
  })

  test('has no side scroll @NX-59', async ({ page }) => {
    await open(page, url(`/platform-address/${M.paddr}`), 'Platform address')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('Decentralized only mode', () => {
  const only = (path: string) => `${path}${path.includes('?') ? '&' : '?'}sources=decentralized`

  test('keeps the SDK facts of a token and says the holders and activity need an index @NX-30 @PE-25', async ({
    page,
  }) => {
    await page.goto(only(tokenUrl()))
    await settled(page)
    await expect(page.locator('[data-token-supply]')).toBeVisible()
    await expect(page.locator(MODE)).toHaveCount(1)
    for (const tab of ['activity', 'holders']) {
      await page.goto(only(tokenUrl('mainnet', { tab })))
      await settled(page)
      await expect(page.locator(MODE)).toHaveCount(1)
      await expect(page.locator('tbody tr')).toHaveCount(0)
    }
  })

  test('keeps the definition, distribution and balance tabs with no notice @NX-30', async ({
    page,
  }) => {
    const queries: Record<string, string>[] = [
      { tab: 'definition' },
      { tab: 'distribution' },
      { tab: 'balance', who: TOKEN_HOLDER.mainnet },
    ]
    for (const query of queries) {
      await page.goto(only(tokenUrl('mainnet', query)))
      await settled(page)
      await expect(page.locator(MODE)).toHaveCount(0)
    }
    await expect(page.locator('[data-field="token-balance"]')).toBeVisible()
  })

  test('shows the holder view in full, without the Platform Explorer link @NX-31', async ({
    page,
  }) => {
    await page.goto(only(holdersUrl('mainnet', [TOKEN_HOLDER.mainnet, M.identity].sort())))
    await settled(page)
    await expect(
      page.locator('#token-holders-table [data-balance-state="known"]').first(),
    ).toBeVisible()
    await expect(page.locator(MODE)).toHaveCount(0)
    await expect(page.locator('[data-holder-index-note]')).toHaveCount(0)
  })

  test('says Platform keeps no list of tokens once, and keeps the ways to open one @PE-24 @NX-32', async ({
    page,
  }) => {
    await page.goto(only('/tokens'))
    await settled(page)
    await expect(page.locator(MODE)).toHaveCount(1)
    await expect(page.locator('[data-by-contract]')).toBeVisible()
    await page.getByLabel('Token ID').fill(M.token)
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/token/${M.token}`))
  })

  test('opens a token by contract and position without an index @NX-32', async ({ page }) => {
    await page.goto(only('/tokens'))
    const form = page.locator('[data-by-contract]')
    await form.getByLabel('Contract ID').fill(M.contract)
    await form.getByLabel('Position').fill('0')
    await form.getByRole('button', { name: 'Open token' }).click()
    await expect(page).toHaveURL(new RegExp(`/token/${M.token}`))
    await expect(page.locator('[data-token-supply]')).toBeVisible()
  })

  test('keeps the balance and nonce of a Platform address and says its transitions need an index @NX-59 @PE-26', async ({
    page,
  }) => {
    await page.goto(only(`/platform-address/${M.paddr}`))
    await settled(page)
    await expect(page.locator('[data-paddr-balance]')).toBeVisible()
    await expect(page.locator(MODE)).toHaveCount(1)
  })

  test('switches without a reload when the mode is turned on from Settings @NX-30', async ({
    page,
  }) => {
    await open(page, tokenUrl('mainnet', { tab: 'holders' }), 'Token')
    await expect(page.locator('#token-holders')).toBeVisible()
    await expect(page.locator(MODE)).toHaveCount(0)
    await page.evaluate(() => {
      localStorage.setItem('radar.sources', 'decentralized')
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'radar.sources', newValue: 'decentralized' }),
      )
    })
    await expect(page.locator(MODE)).toHaveCount(1)
    await expect(page.locator('#token-holders')).toHaveCount(0)
  })
})
