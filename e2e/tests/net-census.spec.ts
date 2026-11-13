import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps',
  'web',
  'src',
  'test',
  'fixtures',
  'http',
  'radar',
)

/** When Radar's last recorded crawl of `net` finished, in ms. */
function crawlFinished(net: 'mainnet' | 'testnet'): number {
  const doc = JSON.parse(readFileSync(path.join(FIXTURES, net, 'summary.json'), 'utf8')) as {
    body: { crawl: { finished: number } }
  }
  return doc.body.crawl.finished * 1000
}

const MIN = 60_000
const DAY = 24 * 60 * MIN

/** Starts the page's clock `after` ms past the recorded crawl, so crawl ages and the 45-minute rule are fixed. */
async function pinAfterCrawl(page: Page, after: number, net: 'mainnet' | 'testnet' = 'mainnet') {
  await page.clock.install({ time: new Date(crawlFinished(net) + after) })
}

const census = (page: Page) => page.locator('[data-page="/nodes"]')
const figure = (page: Page, name: string | RegExp) => census(page).getByRole('link', { name })
const card = (page: Page, id: string) => census(page).locator(`section#${id}`)

async function openNodes(page: Page, query = '', after = 3 * MIN) {
  await pinAfterCrawl(page, after)
  await page.goto(`/nodes${query}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Nodes' })).toBeVisible()
  await expect(card(page, 'now')).toBeVisible()
  await settled(page)
}

test.describe('Network census', () => {
  test('shows the nodes that answered the last crawl, the change on yesterday, the Core tip and the crawl age on the census page and the home @RA-01', async ({
    page,
  }) => {
    await openNodes(page)
    const headline = card(page, 'now')
    await expect(headline.locator('[data-census-answered]')).toContainText('2,581')
    await expect(headline.locator('[data-census-delta]')).toContainText(
      '1 node fewer than a day ago',
    )
    await expect(headline).toContainText('Core tip')
    await expect(headline.getByRole('link', { name: '2,570,085' })).toBeVisible()
    await expect(headline).toContainText('crawled 3 min ago')
    await expect(headline.locator('[data-source="radar"]')).toBeVisible()
    await expectAccessible(page)

    await page.goto('/')
    const pulse = page.locator('[data-pulse="census"]')
    await expect(pulse).toContainText('2,190 of 2,207')
    await expect(pulse.locator('[data-census-nodes]')).toContainText('2,581 nodes')
    await expect(pulse.locator('[data-census-nodes]')).toContainText('−1')
    await expect(pulse).toContainText(/crawled 3 min(utes)? ago/)
    await expect(page.locator('[data-header-tip]')).toContainText('2,570,085')
  })

  test('opens the list or section behind each headline figure @RA-02', async ({ page }) => {
    await openNodes(page)
    const hrefs: [string, RegExp][] = [
      ['Reachable masternodes', /\/masternodes\?reach=reachable$/],
      ['Enabled', /\/masternodes\?status=enabled$/],
      ['PoSe-banned', /\/masternodes\?status=pose-banned$/],
      ['Countries', /\/nodes#countries$/],
      ['Hosting providers', /\/nodes#hosting$/],
      ['Addresses tried', /\/nodes#reach$/],
    ]
    for (const [name, href] of hrefs) {
      await expect(figure(page, new RegExp(`^${name}`))).toHaveAttribute('href', href)
    }
    await expect(figure(page, /^Countries/)).toContainText('44')

    const countries = Number(
      (
        await figure(page, /^Countries/)
          .locator('.rx-stat__value')
          .innerText()
      ).replace(/,/g, ''),
    )
    await figure(page, /^Countries/).click()
    await expect(page).toHaveURL(/#countries$/)
    const list = card(page, 'countries')
    await expect(list).toBeVisible()
    await list.getByRole('button', { name: /^Show all/ }).click()
    const rows = list.locator('[data-ranked] li')
    const unknown = await rows.filter({ hasText: 'Unknown' }).count()
    expect(await rows.count()).toBe(countries + unknown)

    await figure(page, /^PoSe-banned/).click()
    await expect(page).toHaveURL(/\/masternodes\?status=pose-banned$/)
  })

  test('scopes the versions, location and reach sections and keeps the scope through a reload and a copied link @RA-03', async ({
    page,
  }) => {
    await openNodes(page)
    const scope = census(page).locator('[data-census-scope]')
    await expect(scope.getByRole('button', { name: 'All nodes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const reach = card(page, 'reach')
    const allText = await reach.locator('.rx-card__sub').innerText()
    await scope.getByRole('button', { name: 'Evonodes' }).click()
    await expect(page).toHaveURL(/scope=evo/)
    await expect(card(page, 'versions').locator('.rx-card__sub')).toContainText('evonodes')
    await expect(reach.locator('.rx-card__sub')).not.toHaveText(allText)
    await expect(card(page, 'hosting').locator('.rx-card__sub')).toContainText('evonodes')

    await page.reload()
    await expect(scope.getByRole('button', { name: 'Evonodes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const copied = page.url()
    await page.goto('about:blank')
    await pinAfterCrawl(page, 3 * MIN)
    await page.goto(copied)
    await expect(
      census(page).locator('[data-census-scope]').getByRole('button', { name: 'Evonodes' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page, 'versions').locator('.rx-card__sub')).toContainText('evonodes')
  })

  test('lays out the release ladder, the latest-release share, the over-time chart with its ranges and the every-version table @RA-04', async ({
    page,
  }) => {
    await openNodes(page)
    const versions = card(page, 'versions')
    const ladder = versions.locator('[data-ladder]')
    await expect(ladder.getByRole('rowgroup').first()).toBeAttached()
    await expect(ladder).toContainText('Releases')
    await expect(ladder).toContainText("Builds that aren't releases")
    await expect(ladder.locator('[data-version-row]', { hasText: '24.0.0' })).toContainText(
      'latest release',
    )
    await expect(ladder.locator('[data-version-row]', { hasText: '24.0.0' })).toContainText('76.5%')
    await expect(versions.locator('[data-donut]')).toContainText('latest release')

    await versions.locator('summary', { hasText: 'Every version and user agent' }).click()
    const every = versions.locator('[data-every-version] table')
    await expect(every.getByRole('columnheader', { name: 'Client' })).toBeVisible()
    await expect(every.getByRole('row', { name: /24\.0\.0.*Dash Core/ }).first()).toBeVisible()

    await versions.getByRole('button', { name: 'Over time' }).click()
    await expect(page).toHaveURL(/versions=time/)
    await expect(versions.locator('[data-versions-view="time"]')).toBeVisible()
    for (const [label, days] of [
      ['24 h', '1'],
      ['7 d', '7'],
      ['30 d', '30'],
      ['90 d', '90'],
      ['1 y', '365'],
    ] as const) {
      await expect(versions.getByRole('button', { name: label })).toBeVisible()
      void days
    }
    await versions.getByRole('button', { name: '7 d' }).click()
    await expect(page).toHaveURL(/days=7/)
    await expect(versions.getByRole('img', { name: 'Version share over time' })).toBeVisible()
    await versions.getByRole('button', { name: 'Show as a table' }).click()
    await expect(versions.locator('.rx-chart__table table')).toContainText('24.0.0')
  })

  test('ranks hosting providers and countries with show-all and links each row to the filtered list for masternode scopes @RA-05', async ({
    page,
  }) => {
    await openNodes(page)
    const hosting = card(page, 'hosting')
    await expect(hosting.locator('[data-ranked] li')).toHaveCount(8)
    await expect(hosting).toContainText('Hetzner Online GmbH')
    await expect(hosting.locator('[data-ranked] a')).toHaveCount(0)
    await hosting.getByRole('button', { name: /^Show all/ }).click()
    expect(await hosting.locator('[data-ranked] li').count()).toBeGreaterThan(8)
    await hosting.getByRole('button', { name: 'Show fewer' }).click()

    await census(page)
      .locator('[data-census-scope]')
      .getByRole('button', { name: 'Masternodes' })
      .click()
    await expect(page).toHaveURL(/scope=mn/)
    await expect(hosting.getByRole('link', { name: 'Hetzner Online GmbH' })).toHaveAttribute(
      'href',
      /\/masternodes\?host=\d+/,
    )
    await expect(card(page, 'countries').locator('[data-ranked] a').first()).toHaveAttribute(
      'href',
      /\/masternodes\?country=[A-Z]{2}/,
    )

    await census(page)
      .locator('[data-census-scope]')
      .getByRole('button', { name: 'Evonodes' })
      .click()
    await expect(card(page, 'countries').locator('[data-ranked] a').first()).toHaveAttribute(
      'href',
      /type=evo/,
    )
  })

  test('shows how reachable the network is, the address networks and a network-size chart steppable with the arrow keys @RA-06', async ({
    page,
  }) => {
    await openNodes(page, '?scope=mn')
    const reach = card(page, 'reach')
    await expect(reach.locator('[data-sharebar]')).toContainText('Answered')
    await expect(reach.locator('[data-sharebar]')).toContainText("Didn't answer")
    await expect(reach.getByRole('link', { name: 'See which' })).toHaveAttribute(
      'href',
      /\/masternodes\?reach=unreachable$/,
    )
    const networks = reach.locator('[data-address-networks]')
    for (const name of ['IPv4', 'IPv6', 'Tor', 'I2P', 'CJDNS']) {
      await expect(networks.getByRole('row', { name: new RegExp(`^${name}`) })).toBeVisible()
    }
    await expect(networks.locator('[data-network="cjdns"]')).toContainText(
      'not crawled: disabled (CJDNS=false)',
    )

    const size = reach.locator('[data-size-chart]')
    await expect(size.getByRole('img', { name: 'Network size over time' })).toBeVisible()
    const readout = size.locator('[data-size-readout]')
    await size.getByRole('slider').focus()
    await expect(readout).toContainText('Reachable nodes')
    const last = await readout.innerText()
    await page.keyboard.press('ArrowLeft')
    await expect(readout).not.toHaveText(last)
    const earlier = await readout.innerText()
    await page.keyboard.press('ArrowRight')
    await expect(readout).toHaveText(last)
    await page.keyboard.press('Home')
    await expect(readout).not.toHaveText(earlier)
  })

  test('counts the masternodes ready for Core 24 quorums per check and opens the failures @RA-07', async ({
    page,
  }) => {
    await openNodes(page)
    const ready = card(page, 'readiness')
    await expect(ready).toContainText('Pass every check')
    await expect(ready.locator('[data-dkg-check="protocol"]')).toContainText('384 fail')
    await expect(ready.locator('[data-dkg-check="protocol"]').getByRole('link')).toHaveAttribute(
      'href',
      /\/masternodes\?dkg=protocol&status=enabled$/,
    )
    await expect(ready.locator('[data-dkg-check="reachable"] a')).toHaveAttribute(
      'href',
      /dkg=reachable/,
    )
    await expect(ready.locator('[data-dkg-check="relay"]')).toContainText('none fail')
  })

  test('gives the median annual yield for regular masternodes and evonodes and how it is measured @RA-08', async ({
    page,
  }) => {
    await openNodes(page)
    const yields = card(page, 'yields')
    await expect(yields).toContainText('last 90 days')
    await expect(yields).toContainText('Regular masternodes')
    await expect(yields).toContainText('7.2% a year')
    await expect(yields).toContainText('median of 1,566, on 1,000 DASH')
    await expect(yields).toContainText('Evonodes')
    await expect(yields).toContainText('8.5% a year')
    await expect(yields).toContainText('1.8% a year')
  })

  test("shows evonodes' Platform health with the Drive and Tenderdash version breakdowns @RA-09", async ({
    page,
  }) => {
    await openNodes(page)
    const platform = card(page, 'platform')
    await expect(platform).toContainText('341 of 363')
    await expect(platform).toContainText('DAPI answered')
    await expect(platform).toContainText('349')
    await expect(platform).toContainText('Tenderdash P2P open')
    await expect(platform).toContainText('351')
    await expect(platform).toContainText('468,958')
    await expect(platform.locator('[data-platform-versions="drive"]')).toContainText('5.0.3')
    await expect(platform.locator('[data-platform-versions="tenderdash"]')).toContainText('1.8.2')
  })

  test('shows the speed-test grade distribution per vantage @RA-10', async ({ page }) => {
    await openNodes(page)
    const speed = card(page, 'speed')
    await expect(speed).toBeVisible()
    await expect(speed.locator('[data-vantage]').first()).toContainText('tested this cycle')
    await expect(speed.locator('[data-sharebar]').first()).toContainText('Grade A')
  })

  test('links to the activation tracker while Core 24 is pending or active for under 30 days, on the census page and the home @RA-11', async ({
    page,
  }) => {
    await openNodes(page)
    await expect(census(page).locator('[data-v24-link]')).toBeVisible()
    await expect(census(page).locator('[data-v24-link] a')).toHaveAttribute('href', /\/v24$/)

    await page.goto('/')
    const link = page.locator('[data-pulse="census"] [data-v24-link]')
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/v24$/)

    // Testnet's Core 24 went active 14 days before the recording: still inside 30 days, then outside it.
    await page.goto('/?network=testnet')
    await expect(page.locator('[data-pulse="census"] [data-v24-link]')).toBeVisible()
  })

  test('hides the home link to the tracker once Core 24 has been active for 30 days @RA-11', async ({
    page,
  }) => {
    await pinAfterCrawl(page, 20 * DAY, 'testnet')
    await page.goto('/?network=testnet')
    await expect(page.locator('[data-pulse="census"]')).toContainText('of ')
    await settled(page)
    await expect(page.locator('[data-pulse="census"] [data-v24-link]')).toHaveCount(0)
  })

  test('warns when the crawl is older than 45 minutes and not before, and shows the tip and crawl age @RA-12', async ({
    page,
  }) => {
    await openNodes(page, '', 44 * MIN)
    await expect(census(page).locator('[data-stale-crawl]')).toHaveCount(0)
    await page.clock.fastForward(2 * MIN)
    await expect(census(page).locator('[data-stale-crawl]')).toBeVisible()
    await expect(census(page).locator('[data-stale-crawl]')).toContainText('The crawl is stale')
    await expect(census(page).locator('[data-stale-crawl]')).toContainText('46 min ago')
    await expect(page.locator('[data-header-tip]')).toContainText('2,570,085')

    await page.goto('/')
    await expect(page.locator('[data-pulse="census"]')).toContainText(/crawled 4\d min(utes)? ago/)
    await expect(page.locator('[data-header-tip]')).toContainText('2,570,085')
  })

  test('gives every section a copy-link control and scrolls to a shared section @RA-13', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
    await openNodes(page)
    const ids = [
      'now',
      'versions',
      'hosting',
      'countries',
      'reach',
      'readiness',
      'yields',
      'platform',
      'speed',
    ]
    for (const id of ids) {
      await expect(
        card(page, id).getByRole('button', { name: 'Copy link to this section' }),
      ).toHaveCount(1)
    }
    const copy = card(page, 'hosting').getByRole('button', { name: 'Copy link to this section' })
    await copy.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Link copied')).toBeAttached()

    await page.goto('/nodes#reach')
    await expect(card(page, 'reach')).toBeInViewport()
  })

  test('shows the over-time view straight from a link and a testnet census @RA-04 @RA-06', async ({
    page,
  }) => {
    await pinAfterCrawl(page, 3 * MIN, 'testnet')
    await page.goto('/nodes?versions=time&days=7&network=testnet')
    await expect(card(page, 'versions').locator('[data-versions-view="time"]')).toBeVisible()
    await expect(card(page, 'versions').getByRole('button', { name: '7 d' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await settled(page)
    await expect(card(page, 'reach').locator('[data-network="ipv4"]')).toBeVisible()
  })

  test('stacks the sections as cards on a phone with charts that fit and tables within reach @RA-13', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'phone only')
    await openNodes(page, '?versions=time')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    for (const id of ['now', 'versions', 'hosting', 'countries', 'reach']) {
      const box = await card(page, id).boundingBox()
      expect(box!.width, `${id} fits 390 px`).toBeLessThanOrEqual(390)
    }
    const reach = card(page, 'reach')
    const chart = reach.locator('.rx-chart__canvas').first()
    await chart.scrollIntoViewIfNeeded()
    expect((await chart.boundingBox())!.width).toBeLessThanOrEqual(390)
    await reach.getByRole('button', { name: 'Show as a table' }).click()
    await expect(reach.locator('.rx-chart__table table')).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await expectAccessible(page)
  })

  test('says once that the census needs Radar and shows what DAPI answers in Decentralized only mode @RA-12', async ({
    page,
  }) => {
    await page.goto('/nodes?sources=decentralized')
    await expect(page.getByRole('heading', { level: 1, name: 'Nodes' })).toBeVisible()
    await settled(page)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(census(page).locator('#tip')).toContainText('2,570,085')
    await expect(census(page).locator('#dapi-list')).toBeVisible()
    await expect(page.locator('[role="alert"], .rx-empty--error')).toHaveCount(0)
    await expect(page.locator('[data-source="radar"]')).toHaveCount(0)
  })
})
