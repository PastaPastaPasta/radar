import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { pinClockToFixtures } from '../helpers/clock'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const MAINNET = {
  regular: '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32',
  regularIp: '85.209.241.228',
  evo: 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff',
  /** The `mn_regular` and `mn_evo` of `review/fixtures/mainnet.json`, which the Platform and Hyphen recordings follow. */
  listed: '9c663ed039e98d055af0e1dbd30a7b702e77fce302708114915cf2ede9f85874',
  listedEvo: 'b5c4d7bba1b11f98497c419c4d81b72a525fe30ae788028c570dd4eb77255e77',
}
const TESTNET = {
  regular: '51238bb9e2b68fc822e8eb15d415e97ebc86f769a72c15e0a6e25d9ea8d38475',
  regularIp: '62.60.244.174',
  listed: '1d0adeaf787ed8f6f73fa936c6313ddfa2dd33ea693a2de22bc346c1b73a4a02',
  listedEvo: '5c6542766615387183715d958a925552472f93335fa1612880423e4bbdaef436',
}
const MISSING = '0'.repeat(64)

const MODE = 'sources=decentralized'

/** The mode's unavailable notice, however many cards would have shown it. */
const unavailable = (page: Page) =>
  page.locator('[data-source-mode="decentralized"]').locator('visible=true')

/**
 * Answers Radar's `POST …/check` from the page. The fixture build serves every Radar request from a recording and
 * has none for a probe that would reach a live node, so a spec says what the probe answers.
 */
async function stubCheck(
  page: Page,
  replies: { status: number; body: unknown; headers?: object }[],
) {
  await page.addInitScript((list) => {
    const queue = [...list]
    const original = window.fetch.bind(window)
    ;(window as unknown as { __checks: number }).__checks = 0
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase()
      if (method === 'POST' && /\/masternodes\/[0-9a-f]{64}\/check/.test(url)) {
        ;(window as unknown as { __checks: number }).__checks += 1
        const reply = queue.length > 1 ? queue.shift()! : queue[0]!
        return Promise.resolve(
          new Response(JSON.stringify(reply.body), {
            status: reply.status,
            headers: { 'content-type': 'application/json', ...reply.headers },
          }),
        )
      }
      return original(input, init)
    }
  }, replies)
}

const checksSent = (page: Page) =>
  page.evaluate(() => (window as unknown as { __checks: number }).__checks)

async function openTab(page: Page, protx: string, tab: string, extra = '') {
  await page.goto(`/mn/${protx}${tab ? `?tab=${tab}` : ''}${extra}`)
  await expect(page.locator('[data-masternode-header]')).toBeVisible()
  await settled(page)
}

test.describe('masternode page', () => {
  test('shows state at a glance and the registration from Radar’s crawl @RA-30 @RA-31', async ({
    page,
  }) => {
    await page.goto(`/mn/${MAINNET.regular}`)
    const header = page.locator('[data-masternode-header]')
    await expect(header).toBeVisible()
    await settled(page)

    await expect(header).toContainText('Regular masternode')
    await expect(header).toContainText('85.209.241.228')
    await expect(header).toContainText('Enabled, no PoSe penalty')
    await expect(header).toContainText('24.0.0')
    const kpis = page.locator('[data-masternode-kpis]')
    for (const label of [
      'Uptime, 30 days',
      'Last paid',
      'Earned on Core, 90 days',
      'PoSe penalty',
    ]) {
      await expect(kpis).toContainText(label)
    }

    const registration = page.locator('#registration')
    for (const label of ['Payout', 'Owner', 'Voting', 'Operator key', 'Collateral', 'PoSe']) {
      await expect(registration).toContainText(label)
    }
    await expect(
      registration.locator('a[href="/address/Xt77nU5qc5wquYng2om1fRSHsnmUB3WL1Z"]'),
    ).toBeVisible()
    for (const id of ['uptime', 'registration']) {
      await expect(page.locator(`#${id} [data-source="radar"]`).first()).toBeVisible()
    }
    await expect(page.getByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      'https://gov.dashhq.org/masternodes',
    )
    await expect(page.getByRole('tab', { name: 'Platform' })).toHaveCount(0)
  })

  test('draws the uptime strip with no error @RA-30', async ({ page }) => {
    await page.goto(`/mn/${MAINNET.regular}`)
    await settled(page)

    await expect(page.locator('[data-uptime-strip] i').first()).toBeVisible()
    await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
  })

  test('has a tab for each part and keeps the open one in the address @RA-30', async ({ page }) => {
    await page.goto(`/mn/${MAINNET.regular}`)
    await settled(page)
    const tabs = page
      .getByRole('navigation')
      .filter({ has: page.getByRole('link', { name: 'History' }) })

    await tabs.getByRole('link', { name: 'Network' }).first().click()
    await expect(page).toHaveURL(/[?&]tab=network/)
    await expect(page.locator('#port-check')).toBeVisible()

    await tabs.getByRole('link', { name: 'Overview' }).first().click()
    await expect(page).not.toHaveURL(/tab=/)
    await expect(page.locator('#registration')).toBeVisible()
  })

  test('shows the DKG checks with a fix and a link to the rule @RA-36', async ({ page }) => {
    await page.goto(`/mn/${MAINNET.evo}`)
    await settled(page)

    const readiness = page.locator('#readiness')
    await expect(readiness.getByRole('list', { name: 'Quorum readiness checks' })).toBeVisible()
    await expect(readiness.locator('[data-check]').first()).toBeVisible()
    expect(await readiness.locator('[data-check]').count()).toBeGreaterThanOrEqual(4)
    await expect(readiness.locator('[data-state]').first()).toBeVisible()
    await expect(readiness.locator('a[data-rule]').first()).toHaveAttribute(
      'href',
      /dkgsession\.cpp/,
    )
  })

  test('shows the port check, location and speed test on the network tab @RA-32 @RA-33 @RA-37', async ({
    page,
  }) => {
    await pinClockToFixtures(page)
    await openTab(page, MAINNET.regular, 'network')

    const check = page.locator('#port-check')
    for (const label of ['User agent', 'Protocol', 'Services', 'Height it reported', 'Latency']) {
      await expect(check).toContainText(label)
    }
    await expect(check.locator('[data-source="radar"]').first()).toBeVisible()

    const location = page.locator('#location')
    await expect(location.locator('[data-show-on-map]')).toHaveAttribute(
      'href',
      `/map?protx=${MAINNET.regular}`,
    )
    await expect(location.locator('[data-host-filter]')).toHaveAttribute(
      'href',
      '/masternodes?host=205581',
    )
    await expect(location.locator('[data-host-filter]')).toHaveText('CVD Sp. z o.o. Sp.k.')

    const speed = page.locator('#speed-test')
    await expect(speed.locator('[data-grade]')).toBeVisible()
    await expect(
      speed.locator('[data-bench-dims] [role="meter"], [data-bench-dims] meter').first(),
    ).toBeVisible()
    await expect(speed.getByRole('table')).toBeVisible()
  })

  test('opens the map on the node and the masternode list on its host @RA-33', async ({ page }) => {
    await openTab(page, MAINNET.regular, 'network')

    await page.locator('[data-show-on-map]').click()
    await expect(page).toHaveURL(new RegExp(`/map\\?protx=${MAINNET.regular}`))

    await page.goBack()
    await settled(page)
    await page.locator('[data-host-filter]').click()
    await expect(page).toHaveURL(/\/masternodes\?host=205581/)
  })

  test('runs a check now and says what came back, politely @RA-32', async ({ page }) => {
    await stubCheck(page, [
      {
        status: 200,
        body: {
          ok: true,
          connect_ms: 41,
          handshake_ms: 60,
          user_agent: '/Dash Core:24.0.0/',
          protocol: 70244,
          height: 2571530,
          from: 'fra',
          cached: false,
        },
      },
    ])
    await openTab(page, MAINNET.regular, 'network')

    const result = page.locator('[data-check-result]')
    await expect(result).toHaveAttribute('role', 'status')
    await expect(result).toHaveAttribute('aria-live', 'polite')
    await page.getByRole('button', { name: 'Check now' }).click()

    await expect(result).toContainText('Answered in 101 ms')
    await expect(result).toContainText('/Dash Core:24.0.0/')
    expect(await checksSent(page)).toBe(1)
  })

  test('says to wait when Radar limits the checks @RA-32', async ({ page }) => {
    await stubCheck(page, [
      {
        status: 429,
        body: { error: 'rate limited' },
        headers: { 'retry-after': '42' },
      },
    ])
    await openTab(page, MAINNET.regular, 'network')

    await page.getByRole('button', { name: 'Check now' }).click()

    await expect(page.locator('[data-check-result]')).toContainText(
      'Too many checks: Radar allows 5 a minute',
    )
    await expect(page.locator('[data-check-result]')).toContainText('Try again in 42 s')
    await expect(page.getByRole('button', { name: 'Check now' })).toBeEnabled()
  })

  test('pages through the payments, keeping the place in the address @RA-35', async ({ page }) => {
    await openTab(page, MAINNET.regular, 'payments')
    const table = page.getByRole('table', { name: 'Recent payments to this masternode' })
    await expect(table).toBeVisible()
    const first = await table.getByRole('row').count()
    expect(first).toBeGreaterThan(5)
    await expect(page.locator('[data-payments-pager]')).toContainText('25 of 454 shown')

    await page.getByRole('button', { name: 'Show more' }).click()

    await expect(page).toHaveURL(/before=2517727/)
    await expect.poll(() => table.getByRole('row').count()).toBeGreaterThan(first)
    await expect(page.locator('[data-payments-pager]')).toContainText('of 454 shown')
    await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
  })

  test('opens the payments from an address that already holds the place @RA-35', async ({
    page,
  }) => {
    await openTab(page, MAINNET.regular, 'payments', '&before=2517727')

    await expect(page.locator('[data-payments-pager]')).toContainText('50 of 454 shown')
  })

  test('lists the version and registration history and Hyphen’s special transactions @RA-34 @HY-11', async ({
    page,
  }) => {
    await openTab(page, MAINNET.listed, 'history')

    await expect(page.locator('#versions')).toBeVisible()
    await expect(page.locator('#changes')).toBeVisible()
    const special = page.locator('#special-txs')
    await expect(special).toBeVisible()
    await expect(
      special.getByRole('table', { name: 'Special transactions of this masternode' }),
    ).toBeVisible()
    await expect(special.locator('[data-source="hyphen"]').first()).toBeVisible()
    await expect(special.locator(`a[href^="/tx/"]`).first()).toBeVisible()
  })

  test('says Hyphen’s index is behind on testnet and asks it nothing @HY-11', async ({ page }) => {
    const hyphen: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/x/hy/')) hyphen.push(r.url())
    })
    await page.goto(`/mn/${TESTNET.listed}?tab=history&network=testnet`)
    await expect(page.locator('[data-masternode-header]')).toBeVisible()
    await settled(page)

    const special = page.locator('#special-txs')
    await expect(special.getByText('Hyphen’s index is behind the chain')).toHaveCount(1)
    await expect(special.locator('[data-registration-tx]')).toContainText('ProRegTx')
    await expect(special.locator('[data-registration-tx] a[href*="/tx/"]')).toHaveAttribute(
      'href',
      new RegExp(TESTNET.listed),
    )
    expect(hyphen.filter((u) => u.includes('/validators/') && u.includes(TESTNET.listed))).toEqual(
      [],
    )
  })

  test('shows an evonode’s Platform endpoint health on the network tab @RA-40', async ({
    page,
  }) => {
    await openTab(page, MAINNET.evo, 'network')
    const card = page.locator('#platform')
    await expect(card).toBeVisible()

    for (const text of ['TLS certificate', 'Platform height', 'DAPI 5.0.3', 'Daily health']) {
      await expect(card).toContainText(text)
    }
    await expect(page.locator('[data-masternode-header]')).toContainText('Evonode')
  })

  test('has a Platform tab only for an evonode @RA-38', async ({ page }) => {
    await openTab(page, MAINNET.listedEvo, 'platform')
    await expect(page.getByRole('link', { name: 'Platform', exact: true }).first()).toBeVisible()

    await page.goto(`/mn/${MAINNET.listed}?tab=platform`)
    await expect(page.locator('[data-masternode-header]')).toContainText('Regular masternode')
    await settled(page)
    await expect(page.locator('#platform-rewards')).toHaveCount(0)
    await expect(page.locator('#registration')).toBeVisible()
  })

  test('shows an evonode’s Platform rewards, rank and every-epoch chart @RA-38', async ({
    page,
  }) => {
    await openTab(page, MAINNET.listedEvo, 'platform')

    const rewards = page.locator('#platform-rewards')
    await expect(rewards).toBeVisible()
    await expect(rewards.locator('[data-reward-tiles]')).toBeVisible()
    await expect(rewards.locator('[data-rank-strip]')).toBeVisible()
    await expect(rewards.locator('[data-source="radar"]').first()).toBeVisible()
    await expect(rewards.getByRole('table').first()).toBeAttached()
  })

  test('reads the evonode’s balance, blocks and withdrawals from Platform with proofs @RA-39', async ({
    page,
  }) => {
    await openTab(page, MAINNET.listedEvo, 'platform')

    const live = page.locator('#platform-live')
    await expect(live).toBeVisible()
    await expect(live.locator('[data-source="sdk"][data-proved="true"]').first()).toBeVisible()
    await expect(live.locator('[data-combined]')).toContainText('Combined from')
    await expect(live.locator('[data-epoch-comparison]')).toBeVisible()
    await expect(live.locator('[data-withdrawals]')).toBeVisible()
    await expect(live.locator('[data-withdrawals]')).not.toContainText('Unknown')
  })

  test('picks an epoch and turns a base58 ProTx into hex @NX-53', async ({ page }) => {
    await openTab(page, MAINNET.listedEvo, 'platform')
    const record = page.locator('#epoch-record')
    await expect(record).toBeVisible()
    await expect(record).toContainText(MAINNET.listedEvo)

    const links = record.locator('[data-epoch-select] a')
    await expect.poll(() => links.count()).toBeGreaterThan(1)
    await links.nth(1).click()
    await expect(page).toHaveURL(/epoch=\d+/)
    await expect(record).toBeVisible()
  })

  test('opens a base58 ProTx at its hex address @NX-53', async ({ page }) => {
    const base58 = (hex: string) => {
      const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
      let n = BigInt(`0x${hex}`)
      let out = ''
      while (n > 0n) {
        out = A[Number(n % 58n)]! + out
        n /= 58n
      }
      return out
    }
    await page.goto(`/mn/${base58(MAINNET.listedEvo)}`)

    await expect(page).toHaveURL(new RegExp(`/mn/${MAINNET.listedEvo}$`))
    await expect(page.locator('[data-masternode-header]')).toContainText('Evonode')
  })

  test('shows Platform Explorer’s validator record @PE-23', async ({ page }) => {
    await openTab(page, MAINNET.listedEvo, 'platform')

    const record = page.locator('#validator-record')
    await expect(record).toBeVisible()
    await expect(record.locator('[data-reachability]')).toBeVisible()
    await expect(record.locator('[data-source="pe"]').first()).toBeVisible()
    await expect(record.getByRole('group', { name: 'Chart range' })).toBeVisible()
  })

  test('works on testnet, with testnet Governance @HY-19', async ({ page }) => {
    await page.goto(`/mn/${TESTNET.regular}?network=testnet`)
    await expect(page.locator('[data-masternode-header]')).toContainText('Regular masternode')
    await settled(page)

    await expect(page.getByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      'https://gov.dashhq.org/masternodes?network=testnet',
    )
  })

  test('takes a testnet ProTx opened on mainnet to testnet @RA-41', async ({ page }) => {
    await page.goto(`/mn/${TESTNET.regular}`)
    await expect(page.getByText('This masternode is on testnet.')).toBeVisible()

    await page.getByRole('link', { name: 'Open it on testnet' }).click()

    await expect(page).toHaveURL(new RegExp(`/mn/${TESTNET.regular}\\?network=testnet$`))
    await expect(page.locator('[data-masternode-header]')).toContainText('Regular masternode')
  })

  test('offers search for a ProTx nobody lists @RA-41', async ({ page }) => {
    await page.goto(`/mn/${MISSING}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Masternode' })).toBeVisible()
    await expect(page.getByText('No masternode with this ProTx on mainnet.')).toBeVisible()

    await page.locator('[data-search-offer]').click()

    await expect(page).toHaveURL(/\/search/)
  })
})

test.describe('masternode page, in Decentralized only mode', () => {
  for (const tab of ['', 'network', 'history', 'payments']) {
    test(`says once that ${tab || 'overview'} needs an indexer and asks no hosted backend @RA-30 @RA-31`, async ({
      page,
    }) => {
      const hosted: string[] = []
      page.on('request', (r) => {
        const u = new URL(r.url())
        if (
          u.hostname === 'radar.dashhq.org' ||
          u.hostname.endsWith('pe.dashhq.org') ||
          u.pathname.startsWith('/x/hy/') ||
          u.hostname.startsWith('insight.')
        ) {
          hosted.push(`${r.method()} ${r.url()}`)
        }
      })
      await page.goto(`/mn/${MAINNET.listed}?${tab ? `tab=${tab}&` : ''}${MODE}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settled(page)

      await expect(unavailable(page)).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Check now' })).toHaveCount(0)
      expect(hosted).toEqual([])
    })
  }

  test('keeps the Platform tab’s SDK figures and says the rest needs an indexer @RA-39', async ({
    page,
  }) => {
    await page.goto(`/mn/${MAINNET.listedEvo}?tab=platform&${MODE}`)
    const noRecord = page.getByText('Masternode records need an indexer')
    await expect(noRecord.or(page.locator('[data-masternode-header]'))).toBeVisible()
    await settled(page)
    test.skip(
      await noRecord.isVisible(),
      'needs NET-B’s recording of the DAPI masternode list: until it lands the mode has no record to show',
    )

    await expect(page.locator('#platform-live')).toBeVisible()
    await expect(page.locator('#platform-live [data-source="sdk"]').first()).toBeVisible()
    await expect(unavailable(page)).toHaveCount(1)
  })
})

test.describe('masternode page, layout and accessibility', () => {
  for (const [name, path] of [
    ['overview', `/mn/${MAINNET.regular}`],
    ['network', `/mn/${MAINNET.regular}?tab=network`],
    ['history', `/mn/${MAINNET.listed}?tab=history`],
    ['payments', `/mn/${MAINNET.regular}?tab=payments`],
    ['platform', `/mn/${MAINNET.listedEvo}?tab=platform`],
  ] as const) {
    test(`fits the width and has no serious accessibility violations on ${name} @RA-30 @X-08`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.locator('[data-masternode-header]')).toBeVisible()
      await settled(page)

      expect(await horizontalOverflow(page), 'sideways overflow in px').toBeLessThanOrEqual(0)
      await expectAccessible(page)
    })
  }
})

test.describe('search leads somewhere real', () => {
  async function openPalette(page: Page, path = '/') {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.keyboard.press('/')
    const dialog = page.getByRole('dialog', { name: 'Search Radar' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('a masternode suggestion opens its page, by keyboard @HY-14', async ({ page }) => {
    const dialog = await openPalette(page)

    await dialog.getByRole('combobox').fill(MAINNET.regularIp)
    await expect(
      dialog.getByRole('option', { name: /Masternode 85\.209\.241\.228:9999/ }),
    ).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/mn/${MAINNET.regular}$`))
    await expect(page.locator('[data-masternode-header]')).toContainText('85.209.241.228')
    await expect(page.getByText('This page is on its way')).toHaveCount(0)
  })

  test('a testnet masternode suggestion opens its page on testnet @HY-14 @HY-19', async ({
    page,
  }) => {
    const dialog = await openPalette(page, '/status?network=testnet')

    await dialog.getByRole('combobox').fill(TESTNET.regularIp)
    await dialog.getByRole('option', { name: /Masternode 62\.60\.244\.174/ }).click()

    await expect(page).toHaveURL(new RegExp(`/mn/[0-9a-f]{64}\\?network=testnet$`))
    await expect(page.locator('[data-masternode-header]')).toBeVisible()
  })

  test('an address no masternode uses suggests nothing rather than a list page @HY-14', async ({
    page,
  }) => {
    const dialog = await openPalette(page)

    await dialog.getByRole('combobox').fill('203.0.113.9')

    await expect(dialog.getByText(/Looks like an IP address/)).toBeVisible()
    await expect(dialog.getByRole('option', { name: /Masternode/ })).toHaveCount(0)
  })

  /** The routes search still withholds, read from `offered.ts` so this test follows each merge. */
  const unfinished = new Set(
    [
      ...readFileSync(
        new URL('../../apps/web/src/features/search/offered.ts', import.meta.url),
        'utf8',
      )
        .split('UNFINISHED_ROUTES')[1]!
        .split('])')[0]!
        .matchAll(/'([^']+)'/g),
    ].map((m) => m[1]),
  )

  test('the palette lists only pages that are built @HY-14', async ({ page }) => {
    const dialog = await openPalette(page)

    await expect(dialog.getByRole('option', { name: /Blocks/ })).toBeVisible()
    const pages: [RegExp, string][] = [
      [/^Masternodes/, '/masternodes'],
      [/^Platform(?! blocks| transitions| address)/, '/platform'],
      [/^Nodes/, '/nodes'],
    ]
    for (const [name, path] of pages) {
      const option = dialog.getByRole('option', { name })
      if (unfinished.has(path)) await expect(option, path).toHaveCount(0)
      else await expect(option.first(), path).toBeVisible()
    }
  })
})
