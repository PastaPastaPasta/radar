import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '@/app'
import { writeSourceMode } from '@/lib/source-mode'
import { server } from '@/test/server'

let history: ReturnType<typeof createMemoryHistory>

function renderAt(url: string) {
  history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} />)
}

const search = () => new URLSearchParams(history.location.search)
const h1 = () => screen.getByRole('heading', { level: 1 })
const cities = () => screen.getByRole('list', { name: 'Cities, largest first' })
const rows = () => within(cities()).getAllByRole('button')

afterEach(() => {
  writeSourceMode('all')
})

const BANNED = 'a8355582b280be9452f939d34637ab82226ba2c97e1aac15eaf6db878fec0130'
const protxOf = (i: number) => i.toString(16).padStart(64, '0')

/** One of Radar's masternode records, enabled and answering in Falkenstein unless told otherwise. */
function mn(i: number, over: Record<string, unknown> = {}) {
  return {
    protx: protxOf(i),
    type: 'Regular',
    status: 'enabled',
    service: `10.0.0.${String(i % 250)}:9999`,
    payout_address: 'XpayoutAddressXXXXXXXXXXXXXXXXXXX',
    registered_height: 1,
    last_paid_height: 1,
    pose_penalty: 0,
    pose_ban_height: -1,
    operator_reward: 0,
    platform_node_id: null,
    reachable: true,
    version: '24.0.0',
    user_agent: '/Dash Core:24.0.0/',
    protocol: 70238,
    latency_ms: 10,
    start_height: 1,
    uptime_7d: 1,
    uptime_30d: 1,
    last_seen: 1_795_000_000,
    last_error: null,
    network: 'ipv4',
    country: 'DE',
    continent: 'EU',
    city: 'Falkenstein',
    lat: 50.48,
    lon: 12.37,
    asn: 24940,
    as_org: 'Hetzner Online GmbH',
    dkg_readiness: null,
    platform: null,
    ...over,
  }
}

/** Radar answers with this crawl for mainnet's masternodes. */
function crawlOf(masternodes: ReturnType<typeof mn>[]) {
  server.use(
    http.get('*/mainnet/masternodes', () =>
      HttpResponse.json({ crawl_id: 1, tip: 100, masternodes }),
    ),
  )
}

const MESA = { city: 'Mesa', country: 'US', lat: 33.42, lon: -111.83, as_org: 'Amazon', asn: 16509 }

describe('the Map page', () => {
  it('claims how few cities hold half of the enabled masternodes, and says the rest by country and provider @RA-50', async () => {
    renderAt('/map')
    await waitFor(() =>
      expect(h1()).toHaveTextContent('Half of the 130 masternodes run in 2 cities'),
    )
    expect(screen.getByText(/60% of them run in one country, Germany\./)).toBeInTheDocument()
    expect(screen.getByText(/Half run with 3 hosting providers\./)).toBeInTheDocument()
    expect(rows()[0]).toHaveTextContent(/Falkenstein.*49/)
    // "Frankfurt am Main (Innenstadt I)" is Frankfurt am Main
    expect(rows()[1]).toHaveTextContent(/Frankfurt am Main.*27/)
    expect(document.querySelectorAll('[data-half-line]')).toHaveLength(1)
    expect(screen.getByText(/20 PoSe-banned masternodes are not counted/)).toBeInTheDocument()
    expect(document.querySelector('[data-map-figure] svg')).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/^World\. Map with a disc for each city/),
    )
  })

  it('picks a city from the list, rings it and keeps it in the address @RA-50 @RA-52', async () => {
    const user = userEvent.setup()
    renderAt('/map')
    await waitFor(() => expect(rows().length).toBeGreaterThan(3))
    await user.click(rows()[0]!)
    await waitFor(() => expect(search().get('place')).toBe('DE:Falkenstein'))
    const card = document.querySelector<HTMLElement>('[data-place-card]')!
    expect(card).toHaveTextContent('49 masternodes')
    expect(card).toHaveTextContent('Hetzner Online GmbH')
    const list = within(card).getByRole('link', { name: 'Open them in the masternode list' })
    const href = new URL(list.getAttribute('href')!, 'http://x')
    expect(href.pathname).toBe('/masternodes')
    expect(href.searchParams.get('country')).toBe('DE')
    expect(href.searchParams.get('q')).toBe('Falkenstein')
    expect(document.querySelector('[data-selected]')).not.toBeNull()
    await user.click(within(card).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(search().has('place')).toBe(false))
  })

  it('narrows to a country or a provider from its share bar @RA-51', async () => {
    const user = userEvent.setup()
    renderAt('/map')
    const bars = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-map-bars]')
      expect(el).not.toBeNull()
      return el!
    })
    await user.click(within(bars).getByRole('button', { name: /Germany/ }))
    await waitFor(() => expect(search().get('country')).toBe('DE'))
    await waitFor(() =>
      expect(h1()).toHaveTextContent(
        /^63% of these 78 masternodes run in one city, Falkenstein, Germany$/,
      ),
    )
    const chip = screen.getByRole('button', { name: 'Remove the filter Country: Germany' })
    await user.click(chip)
    await waitFor(() => expect(search().has('country')).toBe(false))
    await user.click(within(bars).getByRole('button', { name: /Hetzner Online GmbH/ }))
    await waitFor(() => expect(search().get('host')).toMatch(/24940/))
  })

  it('switches between masternodes, evonodes and every reachable node @RA-51', async () => {
    const user = userEvent.setup()
    renderAt('/map')
    await waitFor(() => expect(h1()).toHaveTextContent(/masternodes run in/))
    await user.click(screen.getByRole('button', { name: 'Evonodes' }))
    await waitFor(() => expect(search().get('type')).toBe('evo'))
    await waitFor(() => expect(h1()).toHaveTextContent(/of the 12 evonodes run in/))
    await user.click(screen.getByRole('button', { name: 'All reachable nodes' }))
    await waitFor(() => expect(search().get('layer')).toBe('nodes'))
    await waitFor(() => expect(h1()).toHaveTextContent(/reachable nodes run in/))
    expect(search().has('type')).toBe(false)
    expect(
      screen.getByText(/reachable nodes have no place, most of them on Tor or I2P/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('keeps what an old map link hid hidden, and says so @RA-52', async () => {
    renderAt('/map?color=pose&hide=enabled')
    // the old map counted every status: hiding "Enabled" left the 20 PoSe-banned masternodes
    await waitFor(() => expect(h1()).toHaveTextContent(/of these 20 masternodes run in/))
    expect(search().get('hide')).toBe('enabled')
    expect(search().has('status')).toBe(false)
    expect(document.querySelector('[data-left-out]')?.textContent ?? '').not.toMatch(
      /PoSe-banned masternodes? (is|are) not counted/,
    )
    const chip = screen.getByRole('button', {
      name: 'Remove the filter Left out by an old map link: Enabled',
    })
    await userEvent.setup().click(chip)
    await waitFor(() => expect(search().has('hide')).toBe(false))
    expect(search().has('color')).toBe(false)
    await waitFor(() =>
      expect(h1()).toHaveTextContent('Half of the 130 masternodes run in 2 cities'),
    )
  })

  it('names what an old link hid in the old legend’s order @RA-52', async () => {
    renderAt('/map?color=reach&hide=unreachable,unchecked')
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Remove the filter Left out by an old map link: Did not answer the crawl, Not checked',
        }),
      ).toBeInTheDocument(),
    )
    await waitFor(() => expect(h1()).toHaveTextContent(/these 1\d\d masternodes/))
  })

  it('stays empty when an old link hid every row, and keeps unknown versions it did not hide @RA-52', async () => {
    crawlOf([mn(1), mn(2), mn(3, { version: null, reachable: null })])
    renderAt('/map?color=type&hide=regular')
    await waitFor(() =>
      expect(screen.getByText('No masternode matches these filters.')).toBeInTheDocument(),
    )
    expect(search().get('hide')).toBe('regular')
  })

  it('drops an old colouring that hid nothing @RA-52', async () => {
    renderAt('/map?color=version')
    await waitFor(() => expect(search().has('color')).toBe(false))
    await waitFor(() =>
      expect(h1()).toHaveTextContent('Half of the 130 masternodes run in 2 cities'),
    )
  })

  it('opens a counted masternode from the address and says how many share its city @RA-52', async () => {
    const protx = '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32'
    renderAt(`/map?protx=${protx}`)
    const card = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(`[data-map-card="${protx}"]`)
      expect(el).not.toBeNull()
      return el!
    })
    expect(within(card).getByRole('link', { name: 'Open masternode' })).toHaveAttribute(
      'href',
      `/mn/${protx}`,
    )
    const panel = document.querySelector('[data-map-node]')!
    expect(panel).toHaveAttribute('data-standing', 'counted')
    expect(panel).toHaveTextContent('It shares Wołów, Poland with 17 other counted masternodes')
    expect(document.querySelector('[data-marked]')).toHaveAttribute('data-marked', 'place')
  })

  it('says a PoSe-banned masternode in the address is not counted, rings its own spot and offers to count it @RA-52', async () => {
    const user = userEvent.setup()
    renderAt(`/map?protx=${BANNED}`)
    const panel = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-map-node]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(panel).toHaveAttribute('data-standing', 'banned')
    expect(panel).toHaveTextContent('It is PoSe-banned, so it is not counted here.')
    expect(panel).not.toHaveTextContent('It shares')
    expect(document.querySelector('[data-marked]')).toHaveAttribute('data-marked', 'spot')
    await user.click(
      within(panel).getByRole('button', { name: 'Count PoSe-banned masternodes too' }),
    )
    await waitFor(() => expect(search().get('status')).toBe('enabled,pose-banned'))
    await waitFor(() =>
      expect(document.querySelector('[data-map-node]')).toHaveAttribute('data-standing', 'counted'),
    )
    expect(document.querySelector('[data-map-node]')).toHaveTextContent('It shares Santa Clara')
  })

  it('says an enabled masternode is enabled, not PoSe-banned, in a PoSe-banned view @RA-52', async () => {
    renderAt(
      '/map?status=pose-banned&protx=219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32',
    )
    await waitFor(() =>
      expect(document.querySelector('[data-map-node]')).toHaveAttribute('data-standing', 'enabled'),
    )
    const panel = document.querySelector('[data-map-node]')!
    expect(panel).toHaveTextContent(
      'It is enabled, and this view counts PoSe-banned masternodes only.',
    )
    expect(panel).not.toHaveTextContent('It is PoSe-banned')
    expect(
      within(panel as HTMLElement).getByRole('button', { name: 'Count enabled masternodes too' }),
    ).toBeInTheDocument()
  })

  it('says a regular masternode is not counted in the evonode view @RA-52', async () => {
    renderAt('/map?type=evo&protx=219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32')
    await waitFor(() =>
      expect(document.querySelector('[data-map-node]')).toHaveAttribute('data-standing', 'type'),
    )
    expect(document.querySelector('[data-map-node]')).toHaveTextContent(
      'It is a regular masternode, and this view counts evonodes.',
    )
  })

  it('shows the masternode in the address even when nothing is counted @RA-52', async () => {
    crawlOf([mn(1, { status: 'pose_banned', reachable: false })])
    renderAt(`/map?protx=${protxOf(1)}`)
    await waitFor(() =>
      expect(document.querySelector('[data-map-node]')).toHaveAttribute('data-standing', 'banned'),
    )
    expect(screen.getByText('The crawl lists no enabled masternode.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull()
  })

  it('says the counts plainly for one masternode, a tie and a near-whole share @RA-50', async () => {
    crawlOf([mn(1, MESA)])
    renderAt('/map')
    await waitFor(() =>
      expect(h1()).toHaveTextContent('The only masternode counted runs in Mesa, United States'),
    )
  })

  it('pins an exact half on no city in a tie @RA-50', async () => {
    crawlOf([mn(1), mn(2), mn(3, MESA), mn(4, MESA)])
    renderAt('/map')
    await waitFor(() => expect(h1()).toHaveTextContent('Half of the 4 masternodes run in 1 city'))
  })

  it('never calls part of the masternodes all of them @RA-50', async () => {
    crawlOf([...Array.from({ length: 199 }, (_, i) => mn(i + 1)), mn(500, MESA)])
    renderAt('/map')
    await waitFor(() =>
      expect(h1()).toHaveTextContent(
        '99% of the 200 masternodes run in one city, Falkenstein, Germany',
      ),
    )
  })

  it('treats both types as every masternode @RA-51', async () => {
    renderAt('/map?type=evo,regular')
    await waitFor(() =>
      expect(h1()).toHaveTextContent('Half of the 130 masternodes run in 2 cities'),
    )
    expect(screen.queryByText('Regular masternodes only')).toBeNull()
  })

  it('keeps the visitor’s search in the city’s list link @RA-51', async () => {
    renderAt('/map?q=Hetzner&place=DE:Falkenstein')
    const link = await waitFor(() => {
      const el = document.querySelector('[data-place-list]')
      expect(el).not.toBeNull()
      return el!
    })
    const href = new URL(link.getAttribute('href')!, 'http://x')
    expect(href.searchParams.get('q')).toBe('Hetzner Falkenstein')
    expect(href.searchParams.get('country')).toBe('DE')
  })

  it('keeps an old link’s exclusion in the city’s list link, in the list’s own filters @RA-52', async () => {
    crawlOf([
      mn(1),
      mn(2, { status: 'pose_banned', pose_ban_height: 5 }),
      mn(3, { status: 'pose_banned', pose_ban_height: 5 }),
    ])
    renderAt('/map?color=pose&hide=enabled&place=DE:Falkenstein')
    const link = await waitFor(() => {
      const el = document.querySelector('[data-place-list]')
      expect(el).not.toBeNull()
      return el!
    })
    const href = new URL(link.getAttribute('href')!, 'http://x')
    expect(href.searchParams.get('status')).toBe('pose-banned')
    expect(href.searchParams.get('country')).toBe('DE')
    expect(href.searchParams.get('q')).toBe('Falkenstein')
  })

  it('offers no list link for an old exclusion the list’s filters can’t say @RA-52', async () => {
    crawlOf([mn(1), mn(2, { reachable: false }), mn(3, { reachable: null })])
    renderAt('/map?color=reach&hide=unchecked&place=DE:Falkenstein')
    await waitFor(() =>
      expect(document.querySelector('[data-place-list-unavailable]')).not.toBeNull(),
    )
    expect(document.querySelector('[data-place-list]')).toBeNull()
  })

  it('unpicks a picked city when its row is pressed again @RA-50', async () => {
    const user = userEvent.setup()
    renderAt('/map?place=DE:Falkenstein')
    await waitFor(() => expect(rows()[0]).toHaveAttribute('aria-pressed', 'true'))
    await user.click(rows()[0]!)
    await waitFor(() => expect(search().has('place')).toBe(false))
  })

  it('names the region in the map’s label @RA-50', async () => {
    const user = userEvent.setup()
    renderAt('/map')
    await waitFor(() => expect(rows().length).toBeGreaterThan(3))
    await user.click(screen.getByRole('button', { name: 'Europe' }))
    await waitFor(() =>
      expect(document.querySelector('[data-map-figure] svg')).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/^Europe\. Map with a disc for each city/),
      ),
    )
  })

  it('keeps every reachable node’s city map when the summary fails, with its own retry @RA-50', async () => {
    server.use(http.get('*/mainnet/summary', () => new HttpResponse(null, { status: 500 })))
    renderAt('/map?layer=nodes')
    await waitFor(() => expect(h1()).toHaveTextContent(/reachable nodes run in/))
    await waitFor(() =>
      expect(document.querySelector('[data-map-bars]')).toHaveAttribute('data-map-bars', 'error'),
    )
    expect(rows().length).toBeGreaterThan(3)
    expect(
      within(document.querySelector<HTMLElement>('[data-map-bars]')!).getByRole('button', {
        name: /Retry|Try again/,
      }),
    ).toBeInTheDocument()
  })

  it('shows the summary’s failure and retry even when no reachable node has a place @RA-50', async () => {
    server.use(
      http.get('*/mainnet/geo', () => HttpResponse.json({ crawl_id: 1, points: [], unlocated: 0 })),
      http.get('*/mainnet/summary', () => new HttpResponse(null, { status: 500 })),
    )
    renderAt('/map?layer=nodes')
    await waitFor(() =>
      expect(screen.getByText('The latest crawl placed no reachable node.')).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(document.querySelector('[data-map-bars]')).toHaveAttribute('data-map-bars', 'error'),
    )
    expect(
      within(document.querySelector<HTMLElement>('[data-map-bars]')!).getByRole('button', {
        name: /Retry|Try again/,
      }),
    ).toBeInTheDocument()
  })

  it('says the masternode filters are off while every reachable node is counted @RA-51', async () => {
    renderAt('/map?layer=nodes&country=DE&q=hetzner')
    await waitFor(() => expect(document.querySelector('[data-filters-off]')).not.toBeNull())
    expect(document.querySelector('[data-filters-off]')).toHaveTextContent('Country: Germany')
    expect(document.querySelector('[data-filters-off]')).toHaveTextContent('Search: hetzner')
    expect(screen.queryByRole('list', { name: 'Filters' })).toBeNull()
  })

  it('says the crawl placed nothing, without offering to clear filters, when no reachable node has a place @RA-50', async () => {
    server.use(
      http.get('*/mainnet/geo', () => HttpResponse.json({ crawl_id: 1, points: [], unlocated: 0 })),
    )
    renderAt('/map?layer=nodes')
    await waitFor(() =>
      expect(screen.getByText('The latest crawl placed no reachable node.')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull()
  })

  it('takes each share in the lede from its own ranking @RA-50', async () => {
    server.use(
      http.get('*/mainnet/geo', () =>
        HttpResponse.json({
          crawl_id: 1,
          unlocated: 0,
          points: [
            {
              lat: 50.48,
              lon: 12.37,
              city: 'Falkenstein',
              country: 'DE',
              nodes: 60,
              masternodes: 60,
            },
            { lat: 33.42, lon: -111.83, city: 'Mesa', country: 'US', nodes: 40, masternodes: 40 },
          ],
        }),
      ),
    )
    server.use(
      http.get('*/mainnet/summary', () =>
        HttpResponse.json({
          crawl: {
            id: 1,
            started: 1_795_000_000,
            finished: 1_795_000_100,
            tip_height: 100,
            tried: 100,
            discovered: 100,
            reachable: 80,
            mn_total: 80,
            mn_reachable: 80,
          },
          dists: {
            all: {
              country: [
                ['DE', 50],
                ['US', 30],
              ],
              asn: [
                ['AS24940 Hetzner Online GmbH', 50],
                ['AS16509 Amazon', 30],
              ],
            },
          },
          networks: [],
        }),
      ),
    )
    renderAt('/map?layer=nodes')
    // the summary counts 80 nodes and the geo document 100: Germany's 50 is 63% of its own ranking, not 50%
    await waitFor(() =>
      expect(document.querySelector('.rx-page__lede')).toHaveTextContent(
        '63% of them run in one country, Germany. 63% run with one hosting provider, Hetzner Online GmbH.',
      ),
    )
    await waitFor(() =>
      expect(document.querySelector('[data-map-bars] .rx-sharebar__pct')).toHaveTextContent(
        '62.5%',
      ),
    )
  })

  it('says when the masternode in the address is not in the list @RA-52', async () => {
    renderAt(`/map?protx=${'0'.repeat(64)}`)
    await waitFor(() => expect(document.querySelector('[data-node-missing]')).not.toBeNull())
    expect(document.querySelector('[data-map-card]')).toBeNull()
  })

  it('says once that the crawl is needed in Decentralized only mode, and draws the land with no data @RA-50 @X-05', async () => {
    writeSourceMode('decentralized')
    renderAt('/map')
    await screen.findByRole('heading', { level: 1, name: 'Map' })
    expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1)
    expect(document.querySelectorAll('.rx-pmap__disc[data-place]')).toHaveLength(0)
    expect(document.querySelector('[data-places]')).toBeNull()
  })
})
