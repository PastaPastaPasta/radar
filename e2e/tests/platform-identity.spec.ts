import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const M = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const T = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'
const ABSENT = '7fTiLgNCANR7Wf4D7ZuHBje9nrbrgnZpTDXuRdVdv5Ds'
const FUNDED = {
  mainnet: {
    id: 'H8RvjxqyPq6EgYWYQsyQvRCtVRyRxbt2P4iZNBrqis1G',
    tx: '9c89e86162ad4732ba655d770f37443e338ec6a40722e5e8c2d97e3e3b5dd46f',
  },
  testnet: {
    id: '2u4CpSo8r6JdzUvbHfdCD4ocwekDrm82ktznVrydr6x4',
    tx: '255066440757a7e267038497237c98c9eb469d2061e24f768560acf68adf83b8',
  },
} as const
const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const MAINNET_PKH = '6da227047f83e9fd7c38792f4422fea3bcd2b824'
const TESTNET_PKH = '7dc0c939f8dcc2775a4069776774c1b623eb1498'
const TESTNET_GROUP_CONTRACT = '49PJEnNx7ReCitzkLdkDNr4s6RScGsnNexcdSZJ1ph5N'
const EXTRA_TOKEN = {
  mainnet: '9YxdbQUjJmQsmVPen95HjAU3Esj7tVkWSY2EQWT84ZQP',
  testnet: 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB',
}

const DATA = {
  keys: '#identity-keys tbody tr:not(.rx-skelrow) >> nth=0',
  names: '#identity-names a[href*="/name/"] >> nth=0',
  groups: '#identity-groups',
  votes: '#identity-votes',
  advanced: '#identity-advanced >> text=Contract nonce',
} as const

const MODE = '[data-unavailable="mode"]'
const TABS = [
  'overview',
  'keys',
  'names',
  'tokens',
  'groups',
  'votes',
  'advanced',
  'transactions',
  'contracts',
  'documents',
  'transfers',
] as const

function hexOfBase58(id: string): string {
  let n = 0n
  for (const ch of id) n = n * 58n + BigInt(ALPHABET.indexOf(ch))
  return n.toString(16).padStart(64, '0')
}

const identityUrl = (
  id: string,
  query: Record<string, string> = {},
  net: 'mainnet' | 'testnet' = 'mainnet',
) => {
  const params = new URLSearchParams({
    ...(net === 'testnet' ? { network: 'testnet' } : {}),
    ...query,
  })
  const q = params.toString()
  return `/identity/${id}${q ? `?${q}` : ''}`
}

const openIdentity = async (
  page: Page,
  id: string,
  query: Record<string, string> = {},
  net: 'mainnet' | 'testnet' = 'mainnet',
) => {
  await page.goto(identityUrl(id, query, net))
  await expect(page.getByRole('heading', { level: 1, name: 'Identity' })).toBeVisible()
  await settled(page)
}

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key)

test.describe('Identity page', () => {
  test('shows balance in DASH and credits, revision, nonce and names, each proof-checked @NX-10', async ({
    page,
  }) => {
    await openIdentity(page, M)
    const summary = page.locator('#identity-summary')
    await expect(summary.locator('[data-field="balance"]')).toContainText('DASH')
    await expect(summary).toContainText('1,013,248,617,912 credits')
    await expect(summary.getByText('Revision', { exact: true })).toBeVisible()
    await expect(summary.getByText('Nonce', { exact: true })).toBeVisible()
    await expect(summary.getByRole('link', { name: 'pshenmic.dash' }).first()).toBeVisible()
    await expect(summary.getByText('Proof-checked')).toHaveCount(4)
    await expect(page.getByRole('heading', { level: 1, name: 'Identity' })).toBeVisible()
    await expectAccessible(page)
  })

  test('saves the identity, remembers it across a reload, and copies the link @NX-10', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
    await openIdentity(page, M)
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toHaveAttribute('aria-pressed', 'false')
    await save.click()
    await expect(save).toHaveAttribute('aria-pressed', 'true')
    expect(await stored(page, 'radar.saved')).toContain(M)
    await page.reload()
    await settled(page)
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: 'Copy link', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeAttached()
  })

  test('offers the Bridge for managing the identity, as a link out @NX-10', async ({ page }) => {
    await openIdentity(page, M)
    const bridge = page.getByRole('link', { name: /Manage in Bridge/ })
    await expect(bridge).toHaveAttribute('href', new RegExp(M))
    await expect(bridge).toHaveAttribute('target', '_blank')
  })

  test('redirects a 64-digit hex identity to its base58 address @NX-10', async ({ page }) => {
    await page.goto(`/identity/${hexOfBase58(M)}`)
    await expect(page).toHaveURL(new RegExp(`/identity/${M}$`))
    await settled(page)
    await expect(page.locator('#identity-summary')).toBeVisible()
  })

  test('says what is wrong with a malformed identity ID, and offers the key hash search @NX-10', async ({
    page,
  }) => {
    await page.goto('/identity/not-an-identity')
    await expect(page.getByText('That isn’t an identity ID.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Find an identity by key hash' })).toBeVisible()
  })

  test('says an identity does not exist, and offers the search on the other network @NX-10', async ({
    page,
  }) => {
    await page.goto(identityUrl(ABSENT))
    await expect(page.getByText('No identity with this ID on mainnet.')).toBeVisible()
    await settled(page)
    const other = page.getByRole('link', { name: 'Search on testnet' })
    await expect(other).toHaveAttribute(
      'href',
      new RegExp(`/identity/${ABSENT}\\?.*network=testnet`),
    )
    await expect(page.locator('.rx-tabs')).toHaveCount(0)
    await expectAccessible(page)
  })

  test('records the identity as viewed only when the viewer turned that on @NX-10', async ({
    page,
  }) => {
    await openIdentity(page, M)
    expect(await stored(page, 'radar.viewed')).toBeNull()

    await page.evaluate(() => {
      localStorage.setItem('radar.viewed', JSON.stringify({ on: true, items: [] }))
    })
    await page.reload()
    await settled(page)
    await expect
      .poll(
        async () =>
          (
            JSON.parse((await stored(page, 'radar.viewed')) ?? '{}') as {
              items?: { net: string; id: string }[]
            }
          ).items,
      )
      .toEqual([expect.objectContaining({ net: 'mainnet', id: M })])
  })

  test('has no side scroll on any tab @NX-10', async ({ page }) => {
    for (const tab of TABS) {
      await openIdentity(page, M, tab === 'overview' ? {} : { tab })
      expect(await horizontalOverflow(page), tab).toBeLessThanOrEqual(0)
    }
  })

  test('switches tabs through the URL and keeps the selected one on reload @NX-10', async ({
    page,
  }) => {
    await openIdentity(page, M)
    await page.locator('.rx-tabs').getByRole('link', { name: 'Keys', exact: true }).click()
    await expect(page).toHaveURL(/tab=keys/)
    await expect(page.locator('#identity-keys')).toBeVisible()
    await page.reload()
    await expect(page.locator('.rx-tabs a[aria-current="page"]')).toHaveText('Keys')
  })
})

test.describe('Keys tab', () => {
  test('lists each key with its purpose, type, security level, data and state @NX-11', async ({
    page,
  }, testInfo) => {
    await openIdentity(page, M, { tab: 'keys' })
    const table = page.locator('#identity-keys table')
    if (!testInfo.project.name.startsWith('phone')) {
      for (const h of ['ID', 'Purpose', 'Type', 'Security level', 'Data', 'State']) {
        await expect(table.getByRole('columnheader', { name: h })).toBeVisible()
      }
    }
    await expect(table.locator('tbody tr')).toHaveCount(6)
    await expect(table).toContainText('AUTHENTICATION')
    await expect(table).toContainText('ECDSA_SECP256K1')
    await expect(table).toContainText('MASTER')
    await expect(table.getByText('Active').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('shows the contract a key is bound to @NX-11', async ({ page }) => {
    await openIdentity(page, M, { tab: 'keys' })
    const bound = page.locator('#identity-keys tbody tr').filter({ hasText: 'ENCRYPTION' })
    await expect(bound).toContainText('DashPay')
    await expect(bound).toContainText('contactRequest')
  })
})

test.describe('Names tab', () => {
  test('lists every name the identity owns, each linking to its name page @NX-12', async ({
    page,
  }) => {
    await openIdentity(page, M, { tab: 'names' })
    const names = page.locator('#identity-names')
    for (const name of ['pshenmic.dash', 'cryptofan.dash']) {
      await expect(names.getByRole('link', { name })).toHaveAttribute(
        'href',
        new RegExp(`/name/${name.replace('.dash', '')}`),
      )
    }
    await expectAccessible(page)
  })
})

test.describe('Tokens tab', () => {
  test('shows the well-known tokens with their balance and frozen state @NX-13', async ({
    page,
  }) => {
    await openIdentity(page, M, { tab: 'tokens' })
    const table = page.locator('#identity-tokens table')
    await expect(table.locator('tbody tr')).toHaveCount(2)
    await expect(table).toContainText('SANS')
    await expect(table).toContainText('DUSD')
    await expect(table.getByText('Not frozen')).toHaveCount(2)
    await expectAccessible(page)
  })

  test('adds a token ID to the URL, shows its balance, and removes it again @NX-13', async ({
    page,
  }) => {
    await openIdentity(page, M, { tab: 'tokens' })
    await page.getByRole('textbox', { name: 'Add a token ID' }).fill(EXTRA_TOKEN.mainnet)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`tokens=${EXTRA_TOKEN.mainnet}`))
    await expect(page.locator('#identity-tokens tbody tr')).toHaveCount(3)
    await page
      .getByRole('button', { name: `Remove token ${EXTRA_TOKEN.mainnet}` })
      .click({ timeout: 5000 })
    await expect(page.locator('#identity-tokens tbody tr')).toHaveCount(2)
    await expect(page).not.toHaveURL(/tokens=/)
  })

  test('refuses something that is not a token ID, before asking Platform @NX-13', async ({
    page,
  }) => {
    await openIdentity(page, M, { tab: 'tokens' })
    await page.getByRole('textbox', { name: 'Add a token ID' }).fill('nope')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('That isn’t a token ID')
    await expect(page).not.toHaveURL(/tokens=/)
  })

  test('shows the testnet well-known token and one added there @NX-13', async ({ page }) => {
    await openIdentity(page, T, { tab: 'tokens', tokens: EXTRA_TOKEN.testnet }, 'testnet')
    await expect(page.locator('#identity-tokens tbody tr')).toHaveCount(2)
  })

  test('adds the tokens Platform Explorer has indexed, with a way to check each on chain @NX-13', async ({
    page,
  }) => {
    await openIdentity(page, M, { tab: 'tokens' })
    const indexed = page.locator('#identity-indexed-tokens')
    await expect(indexed).toContainText('Indexed by Platform Explorer')
    await expect(indexed.getByRole('button', { name: 'Check on-chain' }).first()).toBeVisible()
  })
})

test.describe('Groups tab', () => {
  test('lists the groups in the contract named, with position, role and power @NX-14', async ({
    page,
  }) => {
    await openIdentity(page, T, { tab: 'groups', contract: TESTNET_GROUP_CONTRACT }, 'testnet')
    const row = page.locator('#identity-groups tbody tr').first()
    await expect(row).toContainText('Group 0')
    await expect(row).toContainText('member')
    await expect(row.getByRole('link').last()).toHaveAttribute(
      'href',
      new RegExp(TESTNET_GROUP_CONTRACT),
    )
    await expectAccessible(page)
  })

  test('puts the contract a viewer names into the URL @NX-14', async ({ page }) => {
    await openIdentity(page, T, { tab: 'groups' }, 'testnet')
    await page.getByRole('textbox', { name: 'Contract ID' }).fill(TESTNET_GROUP_CONTRACT)
    await page.getByRole('button', { name: 'Check' }).click()
    await expect(page).toHaveURL(new RegExp(`contract=${TESTNET_GROUP_CONTRACT}`))
    await expect(page.locator('#identity-groups tbody tr').first()).toContainText('Group 0')
  })

  test('says so when the identity is in no group of the contracts asked about @NX-14', async ({
    page,
  }) => {
    await openIdentity(page, M, { tab: 'groups' })
    await expect(
      page.getByText('This identity is not a member of any group in those contracts.'),
    ).toBeVisible()
  })

  test('refuses a contract ID that is not one @NX-14', async ({ page }) => {
    await openIdentity(page, M, { tab: 'groups' })
    await page.getByRole('textbox', { name: 'Contract ID' }).fill('xyz')
    await page.getByRole('button', { name: 'Check' }).click()
    await expect(page.getByRole('alert')).toContainText('That isn’t a contract ID')
  })
})

test.describe('Votes tab', () => {
  test('says plainly that an identity has cast no contested-resource votes @NX-15', async ({
    page,
  }) => {
    await openIdentity(page, M, { tab: 'votes' })
    await expect(page.getByText('This identity has no votes on record.')).toBeVisible()
    await expect(page.locator('#identity-votes')).toContainText('Contested-resource votes')
    await expectAccessible(page)
  })
})

test.describe('Advanced tab', () => {
  test('asks for a contract before it shows anything @NX-16', async ({ page }) => {
    await openIdentity(page, M, { tab: 'advanced' })
    await expect(page.getByText('Enter a contract ID to see its nonce and keys.')).toBeVisible()
  })

  test('shows the contract nonce and the keys bound to the contract named @NX-16', async ({
    page,
  }) => {
    await openIdentity(page, M, { tab: 'advanced', contract: DPNS })
    const details = page.locator('#identity-advanced')
    await expect(details).toContainText('Contract nonce')
    await expect(details).toContainText('7')
    await expect(details.getByText('Keys bound to the contract').first()).toBeVisible()
    await expect(details.getByText('Proof-checked').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('puts the contract a viewer names into the URL @NX-16', async ({ page }) => {
    await openIdentity(page, M, { tab: 'advanced' })
    await page.getByRole('textbox', { name: 'Contract ID' }).fill(DPNS)
    await page.getByRole('button', { name: 'Check' }).click()
    await expect(page).toHaveURL(new RegExp(`contract=${DPNS}`))
    await expect(page.locator('#identity-advanced')).toContainText('Contract nonce')
  })
})

test.describe('History tabs', () => {
  test('lists the identity’s transitions, paged @PE-15', async ({ page }) => {
    await openIdentity(page, M, { tab: 'transactions' })
    const table = page.locator('#identity-transactions table')
    await expect(table.locator('tbody tr')).toHaveCount(10)
    await expect(table.getByText('Document create').first()).toBeVisible()
    await page.locator('#identity-transactions').getByRole('link', { name: 'Next' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.locator('#identity-transactions tbody tr').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('lists the contracts the identity created @PE-15', async ({ page }) => {
    await openIdentity(page, M, { tab: 'contracts' })
    const row = page.locator('#identity-contracts tbody tr')
    await expect(row).toHaveCount(1)
    await expect(row.getByRole('link').first()).toHaveAttribute(
      'href',
      /\/contract\/6z7zekYM1HPCn1PJu2P9dmKM5nxA7YvTyzr5LuxB2bpr/,
    )
  })

  test('lists documents and narrows them to one document type @PE-15', async ({ page }) => {
    await openIdentity(page, M, { tab: 'documents' })
    const table = page.locator('#identity-documents table')
    await expect(table.locator('tbody tr').first()).toBeVisible()
    await page.getByLabel('Document type').fill('domain')
    await page.getByRole('button', { name: 'Filter' }).click()
    await expect(page).toHaveURL(/type=domain/)
    await expect(table.locator('tbody tr').first()).toContainText('domain')
    const types = await table.locator('tbody tr td:nth-child(2)').allInnerTexts()
    expect(types.length).toBeGreaterThan(0)
    expect(new Set(types.map((x) => x.trim()))).toEqual(new Set(['domain']))
  })

  test('lists the credit transfers with their USD estimate @PE-15 @PE-37', async ({ page }) => {
    await openIdentity(page, M, { tab: 'transfers' })
    const rows = page.locator('#identity-transfers tbody tr')
    await expect(rows.first()).toBeVisible()
    await expect(rows.first().locator('.rx-fiat')).toContainText(/\$\d/)
    await expect(rows.first().getByRole('link').first()).toBeVisible()
  })

  for (const net of ['mainnet', 'testnet'] as const) {
    test(`links the funding Core transaction to Radar’s transaction page, on ${net} @PE-15`, async ({
      page,
    }) => {
      await openIdentity(page, FUNDED[net].id, {}, net)
      const link = page
        .locator('#identity-summary')
        .getByRole('link', { name: new RegExp(FUNDED[net].tx.slice(0, 6)) })
      await expect(link).toHaveAttribute('href', new RegExp(`/tx/${FUNDED[net].tx}`))
    })
  }

  test('says an identity with no funding transaction on record is not indexed @PE-15', async ({
    page,
  }) => {
    await openIdentity(page, M)
    await expect(page.locator('#identity-summary')).toContainText('Not indexed')
  })
})

test.describe('Fiat estimates', () => {
  test('shows a USD estimate beside a mainnet identity’s balance, to three significant figures @PE-37', async ({
    page,
  }) => {
    await openIdentity(page, M)
    const fiat = page.locator('#identity-summary [data-field="balance"] .rx-fiat')
    await expect(fiat).toHaveText(/≈\s*\$4[67]\d\b/)
  })

  test('shows no USD estimate on testnet, where the DASH has no price @PE-37', async ({ page }) => {
    await openIdentity(page, T, {}, 'testnet')
    await expect(page.locator('#identity-summary [data-field="balance"]')).toContainText('tDASH')
    await expect(page.locator('.rx-fiat')).toHaveCount(0)
  })

  test('shows a USD estimate on every row of the identity list @PE-37', async ({ page }) => {
    await page.goto('/identities')
    await settled(page)
    await expect(page.locator('#identities-list tbody tr')).toHaveCount(25)
    await expect(page.locator('#identities-list tbody .rx-fiat')).toHaveCount(25)
  })
})

test.describe('Identity lookup by key hash', () => {
  test('opens the unique identity that holds the key hash @NX-17', async ({ page }) => {
    await page.goto(`/identity/lookup?pkh=${MAINNET_PKH}`)
    await expect(page).toHaveURL(new RegExp(`/identity/${M}$`))
    await settled(page)
    await expect(page.locator('#identity-summary')).toBeVisible()
  })

  test('lists the identities that share a key hash, and loads more without losing the first page @NX-17', async ({
    page,
  }) => {
    await page.goto(`/identity/lookup?network=testnet&pkh=${TESTNET_PKH}`)
    await settled(page)
    const matches = page.locator('[data-matches] li')
    await expect(matches).toHaveCount(1)
    const first = await matches.first().innerText()
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(matches).toHaveCount(2)
    await expect(matches.first()).toContainText(first.split('\n')[0] ?? '')
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(page.getByText('That is every match.')).toBeVisible()
    await expect(matches).toHaveCount(2)
    await expect(matches.first()).toContainText(first.split('\n')[0] ?? '')
    await expectAccessible(page)
  })

  test('says no identity holds a key hash nobody uses @NX-17', async ({ page }) => {
    await page.goto(`/identity/lookup?pkh=${'1'.repeat(40)}`)
    await expect(page.getByText('No identity holds this key hash.')).toBeVisible()
  })

  test('explains a malformed key hash before it asks Platform anything @NX-17', async ({
    page,
  }) => {
    await page.goto('/identity/lookup')
    await page.getByLabel('Public key hash').fill('abc')
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page.getByRole('alert')).toContainText('exactly 40 hexadecimal characters')
    await page.getByLabel('Public key hash').fill('z'.repeat(40))
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page.getByRole('alert')).toContainText('only the characters 0–9 and a–f')
    await page.getByLabel('Public key hash').fill('')
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page.getByRole('alert')).toContainText('Enter a public key hash')
    await expect(page).not.toHaveURL(/pkh=/)
  })

  test('opens the empty form, and asks nothing, for a malformed key hash in the link @NX-17', async ({
    page,
  }) => {
    await page.goto('/identity/lookup?pkh=zz')
    await settled(page)
    await expect(page.getByLabel('Public key hash')).toHaveValue('')
    await expect(page.locator('[data-matches]')).toHaveCount(0)
  })

  test('takes a key hash typed into the form to the identity @NX-17', async ({ page }) => {
    await page.goto('/identity/lookup')
    await page.getByLabel('Public key hash').fill(MAINNET_PKH.toUpperCase())
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page).toHaveURL(new RegExp(`/identity/${M}$`))
  })
})

test.describe('Identity list', () => {
  test('lists identities with type, balance, transitions, documents, contracts and creation time @PE-14', async ({
    page,
  }, testInfo) => {
    await page.goto('/identities')
    await settled(page)
    const table = page.locator('#identities-list table')
    if (!testInfo.project.name.startsWith('phone')) {
      for (const h of [
        'Identity',
        'Type',
        'Balance',
        'Transitions',
        'Documents',
        'Contracts',
        'Created',
      ]) {
        await expect(table.getByRole('columnheader', { name: h })).toBeVisible()
      }
    }
    await expect(table.locator('tbody tr')).toHaveCount(25)
    await expect(table.locator('tbody tr').first().getByRole('link').first()).toHaveAttribute(
      'href',
      /\/identity\//,
    )
    await expectAccessible(page)
  })

  test('sorts by balance, ascending then descending, and keeps the sort in the URL @PE-14', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith('phone'),
      'the header row is hidden in the card layout',
    )
    await page.goto('/identities')
    await settled(page)
    const header = page.locator('#identities-list').getByRole('button', { name: 'Balance' })
    await header.click()
    await expect(page).toHaveURL(/sort=/)
    await expect(page.getByRole('columnheader', { name: 'Balance' })).toHaveAttribute(
      'aria-sort',
      /ascending|descending/,
    )
  })

  test('opens sorted by balance when the link says so @PE-14', async ({ page }) => {
    await page.goto('/identities?sort=-balance')
    await settled(page)
    await expect(page.locator('#identities-list tbody tr').first()).toBeVisible()
    await expect(page.locator('#identities-list table')).toHaveAccessibleName(/sorted by Balance/)
  })

  test('narrows the list to one identity type, and clears the filter @PE-14', async ({ page }) => {
    await page.goto('/identities')
    await settled(page)
    await page
      .getByRole('group', { name: 'Identity type' })
      .getByRole('button', { name: 'Masternode' })
      .click()
    await expect(page).toHaveURL(/type=masternode/)
    const types = page.locator('#identities-list tbody tr td:nth-child(2)')
    await expect(types.first()).toHaveText('Masternode')
    expect(new Set((await types.allInnerTexts()).map((x) => x.trim()))).toEqual(
      new Set(['Masternode']),
    )
    await page.getByRole('button', { name: /Clear/ }).first().click()
    await expect(page).not.toHaveURL(/type=/)
  })

  test('narrows the list to a balance range @PE-14', async ({ page }) => {
    await page.goto('/identities')
    await settled(page)
    const min = page.getByRole('textbox', { name: 'Balance (DASH) minimum' })
    await min.fill('10')
    await min.press('Enter')
    await expect(page).toHaveURL(/bal=10\.\./)
    await expect(page.getByText('Balance 10.. DASH')).toBeVisible()
    await expect(page.locator('#identities-list tbody tr').first()).toBeVisible()
  })

  test('switches between pages and scrolling, and remembers the choice @PE-14', async ({
    page,
  }) => {
    await page.goto('/identities')
    await settled(page)
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible()
    await page
      .getByRole('group', { name: 'List view' })
      .getByRole('button', { name: 'Scroll' })
      .click()
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0)
    expect(JSON.parse((await stored(page, 'radar.list.identities')) ?? '{}')).toMatchObject({
      mode: 'scroll',
    })
    await expect(page.getByText('25 loaded')).toBeVisible()
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect(page.getByText('50 loaded')).toBeVisible()
    await page.reload()
    await settled(page)
    await expect(
      page.getByRole('group', { name: 'List view' }).getByRole('button', { name: 'Scroll' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('has no side scroll @PE-14', async ({ page }) => {
    await page.goto('/identities')
    await settled(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('lists testnet identities with tDASH balances @PE-14', async ({ page }) => {
    await page.goto('/identities?network=testnet')
    await settled(page)
    await expect(page.locator('#identities-list tbody tr').first()).toContainText('tDASH')
  })
})

test.describe('Decentralized only mode', () => {
  const only = (path: string) => `${path}${path.includes('?') ? '&' : '?'}sources=decentralized`

  for (const tab of ['keys', 'names', 'groups', 'votes', 'advanced'] as const) {
    test(`keeps the ${tab} tab’s data, with nothing unavailable @NX-10 @PE-14`, async ({
      page,
    }) => {
      await page.goto(only(identityUrl(M, tab === 'advanced' ? { tab, contract: DPNS } : { tab })))
      await settled(page)
      await expect(page.locator('.rx-tabs a[aria-current="page"]')).toBeVisible()
      await expect(page.locator(MODE)).toHaveCount(0)
      await expect(page.locator(DATA[tab])).toBeVisible()
    })
  }

  test('keeps the token balances and says the indexed tokens need an indexer @NX-13', async ({
    page,
  }) => {
    await page.goto(only(identityUrl(M, { tab: 'tokens' })))
    await settled(page)
    await expect(page.locator('#identity-tokens tbody tr')).toHaveCount(2)
    await expect(page.locator(MODE)).toHaveCount(1)
  })

  test('keeps the SDK facts on the overview and says the funding transaction needs an indexer @NX-10 @PE-15', async ({
    page,
  }) => {
    await page.goto(only(identityUrl(M)))
    await settled(page)
    await expect(page.locator('#identity-summary [data-field="balance"]')).toBeVisible()
    await expect(page.locator('#identity-summary')).toContainText('1,013,248,617,912 credits')
    await expect(page.locator(MODE)).toHaveCount(1)
  })

  for (const tab of ['transactions', 'contracts', 'documents', 'transfers'] as const) {
    test(`covers the ${tab} tab with one notice instead of a list @PE-15`, async ({ page }) => {
      await page.goto(only(identityUrl(M, { tab })))
      await settled(page)
      await expect(page.locator(MODE)).toHaveCount(1)
      await expect(page.locator('tbody tr')).toHaveCount(0)
    })
  }

  test('looks an identity up by key hash without an indexer @NX-17', async ({ page }) => {
    await page.goto(only(`/identity/lookup?network=testnet&pkh=${TESTNET_PKH}`))
    await settled(page)
    await expect(page.locator('[data-matches] li').first()).toBeVisible()
    await expect(page.locator(MODE)).toHaveCount(0)
  })

  test('says Platform keeps no list of identities and offers a search by ID or name @PE-14', async ({
    page,
  }) => {
    await page.goto(only('/identities'))
    await settled(page)
    await expect(page.locator(MODE)).toHaveCount(1)
    await expect(page.getByLabel('Identity ID or name')).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(0)
  })

  test('opens an identity typed into the search by its ID @PE-14', async ({ page }) => {
    await page.goto(only('/identities'))
    await settled(page)
    await page.getByLabel('Identity ID or name').fill(M)
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/identity/${M}`))
  })
})
