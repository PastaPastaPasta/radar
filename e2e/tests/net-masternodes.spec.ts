import { readFileSync } from 'node:fs'
import type { Page, Request, TestInfo } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const EVO = {
  protx: 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff',
  identity: 'FDw9Af3wQTiSUTPpXFywJNry65GyZdWgBNsDq4Zk38nJ',
  ip: '114.132.172.215',
  payout: 'XtjXTsWwpqGX37SYrmdjbw2euoGXHFY9h9',
  city: 'Guangzhou',
  asn: '45090',
  nodeId: 'bb0f7022648eaaad15650a0c1a0114125b1b5b28',
}
/** DAPI lists the evonode as enabled while Radar's crawl has it PoSe-banned. */
const DIFFERS = '3e596421618da23ec6700771c2f4cf819fd9ddec753f7889c96f7d1ecb6f9c40'
const MAINNET = { total: 2990, evo: 371, regular: 2619, germany: 78, unreachable: 10 }
const TESTNET = { total: 401 }

const isPhone = (info: TestInfo) => info.project.name.startsWith('phone')
const table = (page: Page, name = 'Masternodes') => page.getByRole('table', { name })
const rows = (page: Page, name?: string) => table(page, name).locator('tbody tr[data-index]')
const matches = (page: Page) => page.locator('.rx-activef').first()
const typeGroup = (page: Page) => page.getByRole('group', { name: 'Type' })
const header = (page: Page, name: string | RegExp) =>
  table(page).locator('thead th').filter({ hasText: name })

async function open(page: Page, path: string, name?: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()
  await expect(rows(page, name).first()).toBeVisible()
  await settled(page)
}

const toggle = async (page: Page, name: string) => {
  await page
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .locator('visible=true')
    .first()
    .click()
}

function hostedRequests(page: Page): Request[] {
  const seen: Request[] = []
  page.on('request', (r) => {
    if (/radar\.dashhq\.org|platform-explorer|hyphen|insight|kw\.vg/.test(r.url())) seen.push(r)
  })
  return seen
}

test.describe('masternode list', () => {
  test('lists every masternode with its crawl columns, a count and the status bar @RA-20 @HY-10', async ({
    page,
  }, info) => {
    await open(page, '/masternodes')
    await expect(matches(page)).toContainText(`${MAINNET.total.toLocaleString('en-US')} match`)
    await expect(page.locator('[data-status-bar]')).toContainText('PoSe-banned')
    await expect(page.locator('[data-status-bar]')).toContainText('Enabled, answering')
    const first = rows(page).first()
    await expect(first.locator('a[href^="/mn/"]').first()).toBeVisible()
    await expect(first).toContainText(/\d+\.\d+\.\d+\.\d+/)
    await expect(first).toContainText(/Answering|No answer|Enabled|PoSe-banned/)
    expect(await rows(page).count(), 'a page of rows is virtualised').toBeLessThan(250)
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText(
      '1–250 of 2,990',
    )
    await expect(page.locator('[data-source="dapi"]').first()).toBeVisible()
    await expect(page.locator('[data-source="radar"]').first()).toBeVisible()
    if (!isPhone(info)) {
      for (const name of [
        'ProTx',
        'Address',
        'Country',
        'Hosting',
        'Version',
        'Protocol',
        'Status',
        'Uptime, 7 days',
        'Uptime, 30 days',
        'Last paid',
        'Registered',
        'PoSe penalty',
        'Platform, 30 days',
        'Next block',
      ]) {
        await expect(header(page, name), name).toHaveCount(1)
      }
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await expectAccessible(page)
  })

  test('shows a phone card per masternode, with last paid, status and address @RA-20 @HY-10', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'phone only')
    await open(page, '/masternodes')
    const card = rows(page).first()
    await expect(card).toContainText(/\d+\.\d+\.\d+\.\d+/)
    await expect(table(page).locator('thead')).toBeHidden()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('works on testnet with its own list @RA-20', async ({ page }) => {
    await open(page, '/masternodes?network=testnet')
    await expect(matches(page)).toContainText(`${TESTNET.total} match`)
    await expect(page.locator('[data-source="dapi"]').first()).toBeVisible()
  })

  test('finds a masternode by ProTx, IP, payout, hosting, user agent, node ID and city @RA-21', async ({
    page,
  }) => {
    for (const q of [
      EVO.protx.slice(0, 12),
      EVO.ip,
      EVO.payout,
      'tencent',
      `as${EVO.asn}`,
      EVO.city,
      EVO.nodeId,
      'user_agent_is_not_matched_here',
    ]) {
      await page.goto(`/masternodes?q=${q}`)
      await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()
      await settled(page)
      if (q.startsWith('user_agent')) {
        await expect(matches(page)).toContainText('0 match')
      } else {
        await expect(matches(page), q).not.toContainText('0 match')
        await expect(table(page)).toContainText(EVO.ip)
      }
    }
    await page.goto('/masternodes?q=Dash%20Core%3A24.0.0')
    await settled(page)
    await expect(matches(page)).not.toContainText('0 match')
  })

  test('writes the search to the address after a pause, and clears it again @RA-21', async ({
    page,
  }) => {
    await open(page, '/masternodes')
    const box = page.getByRole('searchbox', { name: 'Search masternodes' })
    await box.fill(EVO.ip)
    await expect(page).toHaveURL(new RegExp(`q=${EVO.ip.replaceAll('.', '\\.')}`))
    await expect(rows(page)).toHaveCount(1)
    await box.fill('')
    await expect(page).not.toHaveURL(/q=/)
    await expect(matches(page)).toContainText('2,990 match')
  })

  test('filters by type, country, hosting and more, with counts, tokens and a clear button @RA-22', async ({
    page,
  }, info) => {
    await open(page, '/masternodes')
    await typeGroup(page)
      .getByRole('button', { name: /^Evonodes/ })
      .click()
    await expect(page).toHaveURL(/type=evo/)
    await expect(matches(page)).toContainText(`${MAINNET.evo} match`)
    await typeGroup(page).getByRole('button', { name: /^All/ }).click()
    await expect(page).not.toHaveURL(/type=/)

    const phone = isPhone(info)
    await toggle(page, phone ? 'Filters' : 'Country')
    const panel = page.locator('[data-filter-panel]')
    const germany = panel.getByRole('checkbox', { name: `DE ${MAINNET.germany}` })
    await expect(germany).toBeVisible()
    await germany.click()
    await expect(page).toHaveURL(/country=DE/)
    await expect(matches(page)).toContainText(`${MAINNET.germany} match`)
    await expect(matches(page)).toContainText('Country: DE')
    await toggle(page, phone ? 'Filters' : 'Reachability')
    await panel.getByRole('radio', { name: /^No answer/ }).click()
    await expect(page).toHaveURL(/reach=unreachable/)
    await expect(matches(page)).not.toContainText(`${MAINNET.germany} match`)
    await page.getByRole('button', { name: 'Remove filter Country: DE' }).click()
    await expect(page).not.toHaveURL(/country=/)
    await expect(matches(page)).toContainText(`${MAINNET.unreachable} match`)
    await matches(page).getByRole('button', { name: 'Clear' }).click()
    await expect(matches(page)).toContainText('2,990 match')
    await expect(page).not.toHaveURL(/reach=/)
    await expectAccessible(page)
  })

  test('filters by hosting through its autonomous system number @RA-22', async ({ page }) => {
    await open(page, `/masternodes?host=${EVO.asn}`)
    await expect(matches(page)).toContainText('Hosting: Shenzhen Tencent')
    await expect(table(page)).toContainText(EVO.ip)
    await expect(rows(page)).toHaveCount(1)
  })

  test('applies a filter when a country, version or status cell is clicked, replacing history @RA-22', async ({
    page,
  }, info) => {
    test.skip(isPhone(info), 'cards have no clickable cells')
    await open(page, '/masternodes')
    const before = await page.evaluate(() => history.length)
    const cell = (n: number) => rows(page).first().locator(`td:nth-child(${n}) button.rx-cellbtn`)
    await cell(4).click()
    await expect(page).toHaveURL(/country=[A-Z]{2}/)
    expect(await page.evaluate(() => history.length)).toBe(before)
    await expect(matches(page)).toContainText('Country:')
    await cell(6).click()
    await expect(page).toHaveURL(/version=/)
    await cell(2).click()
    await expect(page).toHaveURL(/type=(evo|regular)/)
    await cell(5).click()
    await expect(page).toHaveURL(/host=\d+/)
    await expect(matches(page)).toContainText('Hosting:')
  })

  test('sorts every column by mouse and keyboard and announces the order @RA-23', async ({
    page,
  }, info) => {
    test.skip(isPhone(info), 'phones use the sort select')
    await open(page, '/masternodes?country=DE')
    const version = header(page, 'Version')
    await expect(header(page, 'Status')).toHaveAttribute('aria-sort', 'descending')
    await version.getByRole('button').click()
    await expect(version).toHaveAttribute('aria-sort', 'ascending')
    await expect(page).toHaveURL(/sort=version/)
    await version.getByRole('button').focus()
    await page.keyboard.press('Enter')
    await expect(version).toHaveAttribute('aria-sort', 'descending')
    await expect(page).toHaveURL(/sort=-version/)
    await header(page, 'Last paid').getByRole('button').click()
    await expect(header(page, 'Last paid')).toHaveAttribute('aria-sort', /ascending|descending/)
    const paid = await rows(page).evaluateAll((trs) =>
      trs
        .slice(0, 8)
        .map((tr) => Number((tr.querySelectorAll('td')[9]?.textContent ?? '').replaceAll(',', ''))),
    )
    expect(paid.length).toBeGreaterThan(1)
  })

  test('puts a sort select and a Filters button where the table header was @RA-23', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'phone only')
    await open(page, '/masternodes')
    const select = page.locator('[data-sort-select]')
    await expect(select).toBeVisible()
    await select.selectOption('version')
    await expect(page).toHaveURL(/sort=-?version/)
    await page.getByRole('button', { name: /^Ascending|^Descending/ }).click()
    await expect(page).toHaveURL(/sort=/)
    await expect(page.getByRole('button', { name: /^Filters/ })).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('keeps filters, search, sort and page in the address through reload, back and forward @RA-24', async ({
    page,
  }) => {
    await open(page, '/masternodes?sort=protx')
    await page.getByRole('link', { name: 'Next' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(matches(page)).toContainText('2,990 match')
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('251–500')
    const url = page.url()
    await page.reload()
    await expect(rows(page).first()).toBeVisible()
    expect(page.url()).toBe(url)
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('251–500')

    await page.goBack()
    await expect(page).not.toHaveURL(/page=2/)
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('1–250')
    await page.goForward()
    await expect(page).toHaveURL(/page=2/)

    await page.goto('/masternodes?type=evo&country=DE&sort=-version&q=a')
    await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()
    await expect(matches(page)).toContainText('Type: Evonode')
    await expect(matches(page)).toContainText('Country: DE')
    await expect(page.getByRole('searchbox', { name: 'Search masternodes' })).toHaveValue('a')
  })

  test('comes back to where the list was scrolled after opening a masternode @RA-24', async ({
    page,
  }) => {
    await open(page, '/masternodes')
    await page.evaluate(() => window.scrollTo(0, 1400))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    await page.getByRole('link', { name: 'Epochs', exact: true }).first().click()
    await expect(page).toHaveURL(/\/epochs/)
    await page.goBack()
    await expect(rows(page).first()).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
  })

  test('downloads the filtered rows as a CSV named by network @RA-25', async ({ page }) => {
    await open(page, '/masternodes?country=DE')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('masternodes-mainnet.csv')
    const text = readFileSync(await download.path(), 'utf8')
    const lines = text.trimEnd().split('\r\n')
    expect(lines).toHaveLength(MAINNET.germany + 1)
    const head = lines[0]!.split(',')
    for (const column of [
      'protx',
      'type',
      'status',
      'address',
      'operator_key',
      'voting_address',
      'reachable',
      'country',
      'hosting',
      'version',
      'uptime_30d',
      'last_paid_height',
      'payout_address',
    ]) {
      expect(head, column).toContain(column)
    }
    expect(lines.slice(1).every((l) => l.includes(',DE,'))).toBe(true)
  })

  test('names a testnet export for testnet @RA-25', async ({ page }) => {
    await open(page, '/masternodes?network=testnet')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('masternodes-testnet.csv')
    const text = readFileSync(await download.path(), 'utf8')
    expect(text.trimEnd().split('\r\n')).toHaveLength(TESTNET.total + 1)
  })

  test('links to the map with the same filters @RA-26', async ({ page }) => {
    await open(page, '/masternodes?country=DE&type=regular&reach=reachable&q=hetzner')
    const link = page.getByRole('link', { name: 'View on map' })
    await expect(link).toBeVisible()
    const href = new URL((await link.getAttribute('href'))!, 'http://x')
    expect(href.pathname).toBe('/map')
    expect(Object.fromEntries(href.searchParams)).toMatchObject({
      country: 'DE',
      type: 'regular',
      reach: 'reachable',
      q: 'hetzner',
    })
    expect(href.searchParams.has('sort')).toBe(false)
  })

  test('says when Radar’s crawl differs from DAPI’s list, and shows DAPI’s @RA-20', async ({
    page,
  }) => {
    await open(page, `/masternodes?q=${DIFFERS.slice(0, 12)}`)
    const row = rows(page).first()
    await expect(row.locator('[data-crawl-differs]')).toContainText('Radar differs')
    await expect(row).toContainText('Answering')
    await expect(row).not.toContainText('PoSe-banned')
  })
})

test.describe('evonodes on Platform', () => {
  const path = '/masternodes?type=evo&view=platform'

  test('lists the evonodes with Radar, the SDK’s block counts and Platform Explorer’s validator set @RA-64 @PE-22', async ({
    page,
  }, info) => {
    await open(page, path, 'Evonodes')
    await expect(matches(page)).toContainText(`${MAINNET.evo} match`)
    await expect(page.locator('[data-source="dapi"]').first()).toBeVisible()
    await expect(page.locator('[data-source="radar"]').first()).toBeVisible()
    await expect(page.locator('[data-source="pe"]').first()).toBeVisible()
    await expect(page.locator('[data-source="sdk"][data-proved="true"]').first()).toBeVisible()
    await expect(rows(page, 'Evonodes').first()).toContainText('5.0.3')
    await expect(table(page, 'Evonodes')).toContainText(/Active|Queued/)
    if (!isPhone(info)) {
      for (const name of [
        'Evonode',
        'Drive',
        'Validator set',
        'Blocks this epoch',
        'Blocks proposed',
        'Last block',
        'Last epoch',
        '30 days',
        'A month (est.)',
        'Claimable',
        'Next block',
        'Vote this epoch',
      ]) {
        await expect(
          table(page, 'Evonodes').locator('thead th').filter({ hasText: name }).first(),
          name,
        ).toBeVisible()
      }
    }
    await expectAccessible(page)
  })

  test('sorts by estimated monthly earnings first and pages through the evonodes @RA-64', async ({
    page,
  }) => {
    await open(page, path, 'Evonodes')
    await expect(rows(page, 'Evonodes').first()).toContainText('26b8c4')
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('1–50 of 371')
    await page.getByRole('link', { name: 'Next' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('51–100')
  })

  test('filters by those that proposed this epoch and those outside a validator set @RA-64 @PE-22', async ({
    page,
  }) => {
    await open(page, path, 'Evonodes')
    await page.getByRole('button', { name: /^Proposed this epoch/ }).click()
    await expect(page).toHaveURL(/pf=proposed/)
    await expect(matches(page)).toContainText('Proposed this epoch')
    await expect(rows(page, 'Evonodes').first()).toBeVisible()
    await page.getByRole('button', { name: /^Not in a validator set/ }).click()
    await expect(page).toHaveURL(/pf=not-in-set/)
    await expect(table(page, 'Evonodes')).toContainText('Queued')
    await expect(table(page, 'Evonodes')).not.toContainText('Active')
    await matches(page).getByRole('button', { name: 'Clear' }).click()
    await expect(page).not.toHaveURL(/pf=/)
  })

  test('finds an evonode by its identity as well as its ProTx @RA-64', async ({ page }) => {
    await open(page, `${path}&q=${EVO.identity}`, 'Evonodes')
    await expect(rows(page, 'Evonodes')).toHaveCount(1)
    await expect(rows(page, 'Evonodes').first()).toContainText('d353cd')
    await page.goto(`${path}&q=${EVO.protx}`)
    await expect(rows(page, 'Evonodes')).toHaveCount(1)
    await page.goto(`${path}&q=${EVO.ip}`)
    await expect(rows(page, 'Evonodes')).toHaveCount(1)
  })

  test('is where /validators leads @PE-22', async ({ page }) => {
    await page.goto('/validators')
    await expect(page).toHaveURL(/\/masternodes\?.*view=platform/)
    await expect(page).toHaveURL(/type=evo/)
    await expect(page.getByRole('heading', { level: 1, name: 'Masternodes' })).toBeVisible()
    await expect(rows(page, 'Evonodes').first()).toBeVisible()
  })

  test('opens from the view switch and goes back to the list @RA-64', async ({ page }) => {
    await open(page, '/masternodes')
    await page.getByRole('button', { name: 'Evonodes on Platform' }).click()
    await expect(page).toHaveURL(/view=platform/)
    await expect(table(page, 'Evonodes')).toBeVisible()
    await page.getByRole('button', { name: 'Masternodes', exact: true }).first().click()
    await expect(page).not.toHaveURL(/view=platform/)
  })
})

test.describe('Decentralized only mode', () => {
  const mode = (path: string) => `${path}${path.includes('?') ? '&' : '?'}sources=decentralized`

  test('shows DAPI’s own columns, one notice for what needs Radar’s crawl, and asks no hosted source @RA-20 @RA-22', async ({
    page,
  }, info) => {
    const hosted = hostedRequests(page)
    await open(page, mode('/masternodes'))
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(page.locator('[data-unavailable="mode"]')).toContainText('Radar’s crawl')
    await expect(matches(page)).toContainText('2,990 match')
    if (!isPhone(info)) {
      const heads = await table(page).locator('thead th').allInnerTexts()
      expect(heads.map((h) => h.replace(/\s+/g, ' ').trim())).toEqual([
        'ProTx',
        'Type',
        'Address',
        'Status',
      ])
    }
    for (const gone of ['Country', 'Hosting', 'Version', 'Reachability', 'DKG readiness']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${gone}`) })).toHaveCount(0)
    }
    await expect(page.getByRole('link', { name: 'View on map' })).toHaveCount(0)
    await expect(page.locator('[data-source="radar"]')).toHaveCount(0)
    await expect(page.locator('[data-source="dapi"]').first()).toBeVisible()
    await expect(page.getByText('Download CSV')).toBeVisible()
    expect(hosted.map((r) => r.url())).toEqual([])
    await expectAccessible(page)
  })

  test('filters by type and status, and searches ProTx and IP @RA-21 @RA-22', async ({ page }) => {
    await open(page, mode('/masternodes?type=evo&status=pose-banned'))
    const count = await matches(page).innerText()
    expect(count).toMatch(/\d+ match/)
    await expect(matches(page)).toContainText('Type: Evonode')
    await expect(matches(page)).toContainText('Status: PoSe-banned')
    await page.goto(mode('/masternodes?q=89.125.209.234'))
    await expect(rows(page)).toHaveCount(1)
  })

  test('exports only DAPI’s columns @RA-25', async ({ page }) => {
    await open(page, mode('/masternodes?type=evo'))
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).click(),
    ])
    const text = readFileSync(await download.path(), 'utf8')
    const lines = text.trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'protx,type,status,address,operator_key,voting_address,confirmed_hash,platform_node_id,platform_http_port,platform_p2p_port',
    )
    expect(lines).toHaveLength(MAINNET.evo + 1)
  })

  test('shows the DAPI evonodes with the SDK’s block counts and one notice @RA-64 @PE-22', async ({
    page,
  }) => {
    const hosted = hostedRequests(page)
    await open(page, mode('/masternodes?type=evo&view=platform'), 'Evonodes')
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(table(page, 'Evonodes')).toContainText('Blocks this epoch')
    await expect(table(page, 'Evonodes')).toContainText('Platform node ID')
    await expect(table(page, 'Evonodes')).not.toContainText('Drive')
    await expect(page.locator('[data-source="sdk"][data-proved="true"]').first()).toBeVisible()
    await expect(page.locator('[data-source="radar"], [data-source="pe"]')).toHaveCount(0)
    expect(hosted.map((r) => r.url())).toEqual([])
    await expectAccessible(page)
  })

  test('works on testnet @RA-20', async ({ page }) => {
    await open(page, mode('/masternodes?network=testnet'))
    await expect(matches(page)).toContainText(`${TESTNET.total} match`)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
  })

  test('brings the crawl back, without a reload, when all sources are switched on @X-05', async ({
    page,
  }) => {
    await open(page, mode('/masternodes'))
    await page.getByRole('button', { name: 'Use all sources' }).click()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(0)
    await expect(
      page
        .getByRole('button', { name: /^(Country|Filters)/ })
        .locator('visible=true')
        .first(),
    ).toBeVisible()
    await expect(page.locator('[data-source="radar"]').first()).toBeVisible()
  })
})
