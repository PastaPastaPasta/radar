import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '@/app'
import { writeSourceMode } from '@/lib/source-mode'

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
      expect.stringMatching(/Map of the world with a disc for each city/),
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
      screen.getByText(/reachable nodes are on Tor or I2P and have no place/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('turns an old map link into the filter it meant @RA-52', async () => {
    renderAt('/map?color=pose&hide=enabled')
    await waitFor(() => expect(search().get('status')).toBe('pose-banned'))
    expect(search().has('hide')).toBe(false)
    expect(search().has('color')).toBe(false)
    await waitFor(() => expect(h1()).toHaveTextContent(/these 20 masternodes/))
  })

  it('opens a masternode from the address and says how many share its city @RA-52', async () => {
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
    expect(document.querySelector('[data-map-node]')).toHaveTextContent(
      /It shares|It is the only|not among/,
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
