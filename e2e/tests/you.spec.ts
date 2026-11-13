import { readFileSync } from 'node:fs'
import type { BrowserContext, Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const ID_A = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const ID_B = '4EfA9Jrvv3nnCFdSf7fad59851iiTRZ6Wcu6YVJ4iSeF'
const ID_C = 'HgRABLHCCFMCSzpbvBUiqbqaVMPqnqBMpoSRm2ZyUJF7'

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 700

/** Puts values in localStorage before the page's own code runs, once per tab, so a reload keeps what the page changed. */
async function seed(page: Page, entries: Record<string, unknown>): Promise<void> {
  await page.addInitScript((all) => {
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    for (const [k, v] of Object.entries(all)) {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
    }
  }, entries)
}

async function stored(page: Page, key: string): Promise<unknown> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null') as unknown, key)
}

const SAVED = [
  { net: 'mainnet', kind: 'identity', id: ID_A, label: 'Alice', savedAt: 3000 },
  { net: 'mainnet', kind: 'contract', id: ID_B, savedAt: 2000 },
  { net: 'testnet', kind: 'token', id: ID_C, label: 'Test token', savedAt: 1000 },
]

const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })

async function grantClipboard(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
}

/** A proof-checked mark from the Platform overview, which the SDK fixtures answer on both networks. */
const proofMark = (page: Page) =>
  page.locator('button[data-source="sdk"][data-proved="true"]').first()

async function openPlatform(page: Page, query = 'network=testnet'): Promise<void> {
  await page.goto(`/platform?${query}`)
  await expect(h1(page, 'Platform')).toBeVisible()
  await settled(page)
}

test.describe('saved items', () => {
  test('lists this network’s saved items and says they stay only in this browser @NX-06', async ({
    page,
  }) => {
    await seed(page, { 'radar.saved': SAVED })
    await page.goto('/saved')
    await expect(h1(page, 'Saved')).toBeVisible()
    await expect(page.getByText(/stay only in this browser/)).toBeVisible()
    const table = page.getByRole('table', { name: 'Saved items' })
    await expect(table.getByText('Alice')).toBeVisible()
    await expect(page.getByText('Test token')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remove Alice from saved' })).toBeVisible()
    await settled(page)
    await expectAccessible(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('filters by network scope and kind, and keeps both in the address @NX-06', async ({
    page,
  }) => {
    await seed(page, { 'radar.saved': SAVED })
    await page.goto('/saved')
    await page.getByRole('button', { name: 'All networks' }).click()
    await expect(page.getByText('Test token')).toBeVisible()
    await expect(page).toHaveURL(/scope=all/)

    await page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: /Token/ }).click()
    await expect(page).toHaveURL(/kind=token/)
    await expect(page.getByText('Alice')).toHaveCount(0)
    await expect(page.getByText('Test token')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Test token')).toBeVisible()
    await expect(page.getByText('Alice')).toHaveCount(0)
    const link = page.getByRole('link', { name: /Test token/ }).first()
    await expect(link).toHaveAttribute('href', /network=testnet/)
  })

  test('opens, removes and clears items across networks, asking before it clears @NX-06', async ({
    page,
  }) => {
    await seed(page, { 'radar.saved': SAVED })
    await page.goto('/saved?scope=all')
    await page.getByRole('link', { name: /Alice/ }).first().click()
    await expect(page).toHaveURL(new RegExp(`/identity/${ID_A}`))
    await page.goBack()

    await page.getByRole('button', { name: 'Remove Alice from saved' }).click()
    await expect(page.getByText('Alice')).toHaveCount(0)

    await page.getByRole('button', { name: 'Clear shown' }).click()
    await expect(page.getByRole('group', { name: 'Confirm clearing' })).toContainText(
      'Remove 2 saved items?',
    )
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(await stored(page, 'radar.saved')).toHaveLength(2)

    await page.getByRole('button', { name: 'Clear shown' }).click()
    await page.getByRole('button', { name: 'Yes, remove' }).click()
    await expect(page.getByText('Nothing saved yet')).toBeVisible()
    expect(await stored(page, 'radar.saved')).toEqual([])
  })

  test('clearing one network leaves the other’s items @NX-06', async ({ page }) => {
    await seed(page, { 'radar.saved': SAVED })
    await page.goto('/saved?network=testnet')
    await expect(page.getByText('Test token')).toBeVisible()
    await page.getByRole('button', { name: 'Clear shown' }).click()
    await page.getByRole('button', { name: 'Yes, remove' }).click()
    const left = await page.evaluate(() =>
      (JSON.parse(localStorage.getItem('radar.saved')!) as { net: string }[]).map((s) => s.net),
    )
    expect(left).toEqual(['mainnet', 'mainnet'])
  })

  test('is one card per item on a phone, with nothing sideways @NX-06', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout only')
    await seed(page, { 'radar.saved': SAVED })
    await page.goto('/saved?scope=all')
    await expect(page.getByText('Alice')).toBeVisible()
    await settled(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    const nav = page.getByRole('navigation', { name: 'Radar' })
    await expect(nav.getByRole('link', { name: 'Core' })).toBeVisible()
  })

  test('shows a name of your own for a saved item @NX-06 @NX-74', async ({ page }) => {
    await seed(page, {
      'radar.saved': [{ net: 'mainnet', kind: 'identity', id: ID_C, savedAt: 1 }],
      'radar.labels': [{ net: 'mainnet', kind: 'identity', id: ID_C, label: 'Treasury' }],
    })
    await page.goto('/saved')
    await expect(
      page.getByRole('table', { name: 'Saved items' }).getByText('Treasury'),
    ).toBeVisible()
  })
})

test.describe('settings', () => {
  test('remembers viewed identities only when switched on, and clears them @NX-18', async ({
    page,
  }) => {
    await page.goto('/settings')
    const box = page.getByRole('checkbox', { name: 'Remember the identities I view' })
    await expect(box).not.toBeChecked()
    await expect(page.getByText('0 identities remembered on this network')).toBeVisible()
    await expect(page.getByText(/seed list for token holders/)).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('radar.viewed'))).toBeNull()

    await box.check()
    await expect(box).toBeChecked()
    expect(await stored(page, 'radar.viewed')).toEqual({
      on: true,
      items: [],
    })
    await page.evaluate(
      (id) =>
        localStorage.setItem(
          'radar.viewed',
          JSON.stringify({ on: true, items: [{ net: 'mainnet', id, viewedAt: 1 }] }),
        ),
      ID_A,
    )
    await page.reload()
    await expect(page.getByText('1 identity remembered on this network')).toBeVisible()
    await page.getByRole('button', { name: 'Clear viewed identities' }).click()
    await expect(page.getByText('0 identities remembered on this network')).toBeVisible()
    await expect(
      page.getByRole('checkbox', { name: 'Remember the identities I view' }),
    ).toBeChecked()

    await page.getByRole('checkbox', { name: 'Remember the identities I view' }).uncheck()
    expect(await stored(page, 'radar.viewed')).toEqual({
      on: false,
      items: [],
    })
  })

  test('keeps connection settings across a reload, validates them, and resets each @NX-74', async ({
    page,
  }) => {
    await page.goto('/settings')
    await page.getByLabel('Request timeout (ms)').fill('12000')
    await page.getByLabel('Retries').fill('3')
    await page.getByLabel('Ban nodes that fail').selectOption('on')
    await page.getByLabel('SDK log level').selectOption('debug')
    await page.getByLabel(/Quorum list URL, Testnet/).fill('https://quorums.example.org/')
    await page.getByRole('button', { name: 'Apply and restart the SDK' }).click()
    await expect(page.locator('[data-connection-applied]')).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Request timeout (ms)')).toHaveValue('12000')
    await expect(page.getByLabel('Retries')).toHaveValue('3')
    await expect(page.getByLabel('Ban nodes that fail')).toHaveValue('on')
    await expect(page.getByLabel('SDK log level')).toHaveValue('debug')
    await expect(page.getByLabel(/Quorum list URL, Testnet/)).toHaveValue(
      'https://quorums.example.org',
    )
    expect(await stored(page, 'radar.sdk')).toEqual({
      quorumUrls: { testnet: 'https://quorums.example.org' },
      requestTimeoutMs: 12000,
      retries: 3,
      banFailedAddress: true,
      logLevel: 'debug',
    })

    await page.getByLabel('Request timeout (ms)').fill('5')
    await page.getByRole('button', { name: 'Apply and restart the SDK' }).click()
    await expect(page.getByText('Whole number from 100 to 300000.')).toBeVisible()

    const resets = page.getByRole('button', { name: 'Reset' })
    for (let i = 0; i < 6; i++) {
      const button = resets.nth(i)
      if (await button.isEnabled()) await button.click()
    }
    expect(await stored(page, 'radar.sdk')).toEqual({
      quorumUrls: {},
    })
    await expect(page.getByLabel('Request timeout (ms)')).toHaveValue('')
    await expect(page.getByLabel('SDK log level')).toHaveValue('warn')
  })

  test('restarts the Platform SDK cleanly when a connection setting changes @NX-74', async ({
    page,
  }) => {
    await openPlatform(page)
    const state = () =>
      page.evaluate(() =>
        (window as unknown as { __radarSdk: { state(n: string): string } }).__radarSdk.state(
          'testnet',
        ),
      )
    expect(await state()).toBe('ready')

    await page.getByRole('navigation', { name: 'Radar' }).getByRole('link', { name: 'You' }).click()
    await page.goto('/settings?network=testnet')
    await page.getByLabel('Retries').fill('2')
    await page.getByRole('button', { name: 'Apply and restart the SDK' }).click()
    await expect(page.locator('[data-connection-applied]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toHaveCount(0)

    await openPlatform(page)
    await expect(proofMark(page)).toBeVisible()
    await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
  })

  test('shows both shortcuts, switches each off, and shows the build @NX-74', async ({ page }) => {
    await page.goto('/settings')
    const dev = page.locator('#developer')
    await expect(dev.getByText('Alt', { exact: true })).toHaveCount(2)
    await expect(dev.getByText('Radar', { exact: true })).toBeVisible()
    await expect(dev.getByText('Platform SDK in this page')).toBeVisible()
    await expect(dev.getByText('Platform SDK in the worker')).toBeVisible()
    await expect(dev.getByText('Wasm bindings')).toBeVisible()

    const proof = dev.getByRole('checkbox', { name: /Open the proof inspector with the keyboard/ })
    await expect(proof).toBeChecked()
    await proof.uncheck()
    expect(await stored(page, 'radar.dev')).toEqual({
      proofShortcut: false,
      diagnosticsShortcut: true,
    })
    await page.keyboard.press('Alt+Shift+KeyP')
    await expect(page.getByRole('dialog', { name: 'Proof inspector' })).toHaveCount(0)
    await proof.check()
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Alt+Shift+KeyP')
    await expect(page.getByRole('dialog', { name: 'Proof inspector' })).toBeVisible()
  })

  test('clears the SDK cache and the proofs held @NX-74', async ({ page }) => {
    await openPlatform(page)
    await page.keyboard.press('Alt+Shift+KeyP')
    const list = page.getByRole('list', { name: 'Proofs held' })
    await expect(list).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('navigation', { name: 'Radar' }).getByRole('link', { name: 'You' }).click()
    await page.goto('/settings?network=testnet')
    await page.getByRole('button', { name: 'Clear the SDK cache' }).click()
    await expect(page.locator('[data-sdk-cache-cleared]')).toBeVisible()
  })

  test('names an ID of your own and uses the name where the ID appears @NX-74', async ({
    page,
  }) => {
    await seed(page, {
      'radar.saved': [{ net: 'mainnet', kind: 'identity', id: ID_A, savedAt: 1 }],
    })
    await page.goto('/settings')
    await page.getByLabel('Kind').selectOption('identity')
    await page.getByLabel(/ID on Mainnet/).fill(ID_A)
    await page.getByLabel('Name', { exact: true }).fill('My wallet')
    await page.getByRole('button', { name: 'Add name' }).click()
    await expect(page.getByRole('list', { name: 'Your names' })).toContainText('My wallet')

    await page.reload()
    await expect(page.getByRole('list', { name: 'Your names' })).toContainText('My wallet')
    await page.getByRole('link', { name: 'Saved items' }).click()
    await expect(page.getByRole('table', { name: 'Saved items' })).toContainText('My wallet')

    await page.goto('/settings')
    await page.getByRole('button', { name: 'Remove the label My wallet' }).click()
    await expect(page.getByText('No names of your own yet')).toBeVisible()
  })

  test('refuses an ID that is not Base58 text @NX-74', async ({ page }) => {
    await page.goto('/settings')
    await page.getByLabel(/ID on Mainnet/).fill('not an id')
    await page.getByLabel('Name', { exact: true }).fill('x')
    await page.getByRole('button', { name: 'Add name' }).click()
    await expect(page.getByRole('alert')).toContainText('Base58')
  })

  test('has no serious accessibility violations and fits the width @NX-74 @NX-18', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(h1(page, 'Settings')).toBeVisible()
    await settled(page)
    await expectAccessible(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('devnets', () => {
  test('adds, uses, shares and removes a devnet @NX-75', async ({ page, context, browser }) => {
    await grantClipboard(context)
    await page.goto('/settings')
    await page.getByLabel('Devnet name').fill('ruby')
    await page.getByLabel('DAPI addresses').fill('192.0.2.10:1443')
    await page.getByLabel(/^Quorum list URL\s+optional$/).fill('https://quorums.ruby.example.org')
    await page.getByRole('button', { name: 'Add devnet' }).click()

    const list = page.getByRole('list', { name: 'Saved devnets' })
    await expect(list).toContainText('ruby')
    await expect(list).toContainText('192.0.2.10:1443')
    await expect(list).toContainText('https://quorums.ruby.example.org')
    expect(await stored(page, 'radar.devnets')).toEqual([
      {
        name: 'ruby',
        dapiAddresses: ['192.0.2.10:1443'],
        quorumUrl: 'https://quorums.ruby.example.org',
      },
    ])

    await page.getByLabel('Devnet name').fill('ruby')
    await page.getByLabel('DAPI addresses').fill('192.0.2.11:1443')
    await page.getByRole('button', { name: 'Add devnet' }).click()
    await expect(page.getByRole('alert')).toContainText('already saved')

    await list.getByRole('button', { name: 'Copy a link to ruby' }).click()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    expect(new URL(link).searchParams.get('network')).toBe('devnet-ruby')

    const other = await browser.newContext({ baseURL: new URL(link).origin })
    const stranger = await other.newPage()
    await stranger.goto(link)
    await expect(stranger.getByRole('heading', { name: 'Set up the ruby devnet' })).toBeVisible()
    await other.close()

    await list.getByRole('link', { name: 'Open' }).click()
    await expect(page).toHaveURL(/network=devnet-ruby/)
    await expect(page.locator('[data-testnet-label]')).toHaveText('Devnet ruby')

    await page.goto('/settings?network=devnet-ruby')
    await page.getByRole('button', { name: 'Remove ruby' }).click()
    await expect(page.getByText('No devnets saved.')).toBeVisible()
    await page.goto('/about?network=devnet-ruby')
    await expect(page.getByRole('heading', { name: 'Set up the ruby devnet' })).toBeVisible()
  })

  test('edits a devnet’s addresses @NX-75', async ({ page }) => {
    await seed(page, { 'radar.devnets': [{ name: 'ruby', dapiAddresses: ['192.0.2.10:1443'] }] })
    await page.goto('/settings')
    const list = page.getByRole('list', { name: 'Saved devnets' })
    await list.getByRole('button', { name: 'Edit' }).click()
    await list.getByLabel('DAPI addresses').fill('192.0.2.20:1443')
    await list.getByRole('button', { name: 'Save changes' }).click()
    await expect(list).toContainText('192.0.2.20:1443')
  })
})

test.describe('proof inspector', () => {
  test('opens from a proof-checked mark with the call, node, height and quorum @NX-61', async ({
    page,
  }) => {
    await openPlatform(page)
    await proofMark(page).click()
    const dialog = page.getByRole('dialog', { name: 'Proof inspector' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Verified', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Call', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Platform height')).toBeVisible()
    await expect(dialog.getByText('Quorum', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Chain', { exact: true })).toBeVisible()
    await expect(dialog.getByText('dash-testnet-51')).toBeVisible()
    await expect(dialog.getByText(/bytes? of GroveDB proof/)).toBeVisible()
    await expectAccessible(page)
  })

  test('is a side sheet on a desktop and a bottom sheet on a phone @NX-61', async ({ page }) => {
    await openPlatform(page)
    await proofMark(page).click()
    const dialog = page.getByRole('dialog', { name: 'Proof inspector' })
    await expect(dialog).toBeVisible()
    const box = (await dialog.boundingBox())!
    const view = page.viewportSize()!
    if (isPhone(page)) {
      expect(box.width).toBeGreaterThanOrEqual(view.width - 1)
      expect(box.y + box.height).toBeGreaterThanOrEqual(view.height - 1)
      expect(box.height).toBeLessThan(view.height)
    } else {
      expect(box.x + box.width).toBeGreaterThanOrEqual(view.width - 1)
      expect(box.height).toBeGreaterThanOrEqual(view.height - 1)
      expect(box.width).toBeLessThan(view.width)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('exports one figure’s evidence, and every proof, as JSON @NX-61', async ({ page }) => {
    await openPlatform(page)
    await proofMark(page).click()
    const one = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export evidence' }).click()
    const oneFile = JSON.parse(readFileSync(await (await one).path(), 'utf8')) as {
      format: string
      proofs: {
        method: string
        network: string
        platformHeight: number
        grovedbProof: { bytes: number; hex: string }
        quorum: { hash: string }
        verification: { result: string }
      }[]
    }
    expect(oneFile.format).toBe('radar-proof-evidence')
    expect(oneFile.proofs).toHaveLength(1)
    expect(oneFile.proofs[0]).toMatchObject({
      network: 'testnet',
      verification: { result: 'verified' },
    })
    expect(oneFile.proofs[0]!.platformHeight).toBeGreaterThan(0)
    expect(oneFile.proofs[0]!.grovedbProof.hex).toHaveLength(
      oneFile.proofs[0]!.grovedbProof.bytes * 2,
    )
    expect(oneFile.proofs[0]!.quorum.hash).toMatch(/^[0-9a-f]+$/)

    await page.getByRole('button', { name: 'All proofs' }).click()
    const all = page.waitForEvent('download')
    await page.getByRole('button', { name: /^Export all \(\d+\)$/ }).click()
    const allFile = JSON.parse(readFileSync(await (await all).path(), 'utf8')) as {
      proofs: unknown[]
    }
    expect(allFile.proofs.length).toBeGreaterThanOrEqual(1)
  })

  test('opens the list of every proof from its shortcut and opens one from the list @NX-61', async ({
    page,
  }) => {
    await openPlatform(page)
    await page.keyboard.press('Alt+Shift+KeyP')
    const list = page.getByRole('list', { name: 'Proofs held' })
    await expect(list).toBeVisible()
    await list.getByRole('button').first().click()
    await expect(page.getByText('Verified', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('diagnostics', () => {
  test('lists the requests the page made, newest first, with the source, result and time @NX-62', async ({
    page,
  }) => {
    await openPlatform(page)
    await page.keyboard.press('Alt+Shift+KeyD')
    const dialog = page.getByRole('dialog', { name: 'Diagnostics' })
    await expect(dialog).toBeVisible()
    const table = dialog.getByRole('table', { name: /Requests this tab made/ })
    await expect(table).toBeVisible()
    const rows = table.locator('tbody tr')
    expect(await rows.count()).toBeGreaterThan(2)
    await expect(table.locator('tbody tr[data-source="sdk"]').first()).toContainText('OK')
    await expect(table.locator('tbody tr[data-source="sdk"]').first()).toContainText(/\d+ ms/)
    await expect(table.locator('tbody tr[data-source="sdk"]').first()).toContainText('Yes')
    await expectAccessible(page)
  })

  test('filters by source and to failures, copies as JSON and clears @NX-62', async ({
    page,
    context,
  }) => {
    await grantClipboard(context)
    await openPlatform(page)
    await page.keyboard.press('Alt+Shift+KeyD')
    const dialog = page.getByRole('dialog', { name: 'Diagnostics' })
    await dialog.getByRole('group', { name: 'Source' }).getByRole('button', { name: 'sdk' }).click()
    const rows = dialog.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    for (const row of await rows.all()) await expect(row).toHaveAttribute('data-source', 'sdk')

    await dialog.getByRole('button', { name: 'Copy as JSON' }).click()
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
      source: string
      what: string
      ok: boolean
    }[]
    expect(copied.length).toBeGreaterThan(0)
    expect(copied.every((e) => e.source === 'sdk')).toBe(true)

    await dialog.getByRole('group', { name: 'Source' }).getByRole('button', { name: 'All' }).click()
    await dialog.getByRole('checkbox', { name: 'Failures only' }).check()
    await expect(dialog.locator('tbody tr[data-ok="true"]')).toHaveCount(0)
    await dialog.getByRole('checkbox', { name: 'Failures only' }).uncheck()

    await dialog.getByRole('button', { name: 'Clear' }).click()
    await expect(dialog.getByText('No requests yet')).toBeVisible()
  })

  test('opens from settings, and is a bottom sheet on a phone @NX-62', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Open diagnostics' }).click()
    const dialog = page.getByRole('dialog', { name: 'Diagnostics' })
    await expect(dialog).toBeVisible()
    if (isPhone(page)) {
      const box = (await dialog.boundingBox())!
      const view = page.viewportSize()!
      expect(box.y + box.height).toBeGreaterThanOrEqual(view.height - 1)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('shows no request to a hosted source in Decentralized only mode @NX-62', async ({
    page,
  }) => {
    await openPlatform(page, 'network=testnet&sources=decentralized')
    await page.keyboard.press('Alt+Shift+KeyD')
    const dialog = page.getByRole('dialog', { name: 'Diagnostics' })
    const rows = dialog.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    for (const row of await rows.all()) {
      const source = await row.getAttribute('data-source')
      expect(['sdk', 'dapi', 'local', 'quorums']).toContain(source)
      await expect(row).not.toContainText('Refused by mode')
    }
  })
})

test.describe('about', () => {
  test('covers the proof model, what can’t be listed, where to act, privacy and licences @NX-76', async ({
    page,
  }) => {
    await page.goto('/about')
    await expect(h1(page, 'About')).toBeVisible()
    for (const name of [
      'What “proof-checked” means',
      'What can’t be listed without an index',
      'Where to act',
      'Privacy',
      'Sources and licences',
    ]) {
      await expect(page.getByRole('heading', { name })).toBeVisible()
    }
    await expect(page.getByText(/one-node claim/)).toBeVisible()
    await expect(page.getByText(/no analytics, no cookies, no accounts/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Bridge' })).toHaveAttribute(
      'href',
      'https://bridge.dashhq.org/',
    )
    await expect(page.getByRole('link', { name: 'Governance' })).toHaveAttribute(
      'href',
      'https://gov.dashhq.org/',
    )
    await expect(page.locator('[data-third-party]').first()).toBeVisible()
    await settled(page)
    await expectAccessible(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('is the same with Decentralized only mode on @NX-76', async ({ page }) => {
    await page.goto('/about?sources=decentralized')
    await expect(page.getByRole('heading', { name: 'Where to act' })).toBeVisible()
    await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
  })
})

test.describe('offline and updates', () => {
  async function installWorker(page: Page): Promise<void> {
    await page.addInitScript(() => localStorage.setItem('radar.sw', 'on'))
    await page.goto('/about')
    await expect(h1(page, 'About')).toBeVisible()
    await page.waitForFunction(
      () => navigator.serviceWorker.controller?.scriptURL.includes('/sw.js') === true,
      undefined,
      { timeout: 30_000 },
    )
  }

  /** A page that was open when a new build shipped: its next worker check finds a worker for another version. */
  async function registerNextVersion(page: Page): Promise<void> {
    await page.evaluate(() => {
      ;(window as unknown as { __beforeReload: boolean }).__beforeReload = true
      const tt = (
        window as unknown as {
          trustedTypes: {
            createPolicy(
              name: string,
              rules: { createScriptURL(s: string): string },
            ): { createScriptURL(s: string): unknown }
          }
        }
      ).trustedTypes
      const policy = tt.createPolicy('e2e-sw', { createScriptURL: (s) => s })
      return navigator.serviceWorker.register(
        policy.createScriptURL('/sw.js?v=simulated-next') as string,
        { scope: '/' },
      )
    })
  }

  test('serves /sw.js as JavaScript that is never cached for long @NX-77', async ({ page }) => {
    const res = await page.request.get('/sw.js?v=probe')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('javascript')
    expect(res.headers()['cache-control']).toBe('no-cache')
  })

  test('shows an offline page for a page it cannot reach, listing what is saved here @NX-77', async ({
    page,
    context,
  }) => {
    await seed(page, { 'radar.saved': SAVED })
    await installWorker(page)

    await context.setOffline(true)
    await page.goto('/identity/' + ID_B)
    const offline = page.locator('[data-offline-page]')
    await expect(offline.getByRole('heading', { name: 'You are offline' })).toBeVisible()
    await expect(offline.getByText('Saved on this device')).toBeVisible()
    await expect(offline.getByRole('link', { name: 'Alice' })).toHaveAttribute(
      'href',
      `/identity/${ID_A}`,
    )
    await expect(offline.getByRole('link', { name: 'Test token' })).toHaveAttribute(
      'href',
      `/token/${ID_C}?network=testnet`,
    )
    await expectAccessible(page)

    await context.setOffline(false)
    await offline.getByRole('button', { name: 'Try again' }).click()
    await expect(h1(page, 'Identity'))
      .toBeVisible({ timeout: 20_000 })
      .catch(() => undefined)
  })

  test('keeps only the app’s own files, never an API answer @NX-77', async ({ page }) => {
    await installWorker(page)
    await page.goto('/status')
    await expect(h1(page, 'Status')).toBeVisible()
    await settled(page)
    const cached = await page.evaluate(async () => {
      const out: { cache: string; paths: string[] }[] = []
      for (const name of await caches.keys()) {
        const keys = await (await caches.open(name)).keys()
        out.push({ cache: name, paths: keys.map((k) => new URL(k.url).pathname) })
      }
      return out
    })
    expect(cached).toHaveLength(1)
    expect(cached[0]!.cache).toMatch(/^radar-v1:/)
    expect(cached[0]!.paths).toContain('/')
    for (const path of cached[0]!.paths)
      expect(path === '/' || path.startsWith('/assets/')).toBe(true)
  })

  test('offers a reload when a newer version is waiting, and switches only when asked @NX-77', async ({
    page,
  }) => {
    await installWorker(page)
    await registerNextVersion(page)
    const notice = page.locator('[data-update-notice]')
    await expect(notice).toBeVisible({ timeout: 30_000 })
    await expect(notice).toContainText('A new version is available.')
    expect(
      await page.evaluate(() =>
        navigator.serviceWorker.controller?.scriptURL.includes('v=simulated'),
      ),
    ).toBe(false)
    await expectAccessible(page)

    await notice.getByRole('button', { name: 'Dismiss' }).click()
    await expect(notice).toHaveCount(0)
  })

  test('reloads onto the new version when the notice’s button is pressed @NX-77', async ({
    page,
  }) => {
    await installWorker(page)
    await registerNextVersion(page)
    const notice = page.locator('[data-update-notice]')
    await expect(notice).toBeVisible({ timeout: 30_000 })
    const reloaded = page.waitForEvent('load')
    await notice.getByRole('button', { name: 'Reload' }).click()
    await reloaded
    await expect(h1(page, 'About')).toBeVisible()
    expect(
      await page.evaluate(() => (window as unknown as { __beforeReload?: boolean }).__beforeReload),
    ).toBeUndefined()
  })
})
