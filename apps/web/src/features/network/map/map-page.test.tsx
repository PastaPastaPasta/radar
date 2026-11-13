import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { writeSourceMode } from '@/lib/source-mode'
import type { MapViewProps } from './MapView'

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

const views: MapViewProps[] = []

vi.mock('./MapView', () => ({
  default: (props: MapViewProps) => {
    views.push(props)
    return (
      <div
        data-fake-map
        data-layer={props.layer}
        data-points={props.points.length}
        data-geo={props.geo.length}
        data-selected={props.selected ?? ''}
      >
        {props.popup}
      </div>
    )
  },
}))

const last = () => views[views.length - 1]!
const mapPage = () => document.querySelector<HTMLElement>('[data-page="/map"]')!
const headline = () => screen.getByText(/answered the latest crawl/)

beforeEach(() => {
  views.length = 0
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  writeSourceMode('all')
})

describe('the Map page', () => {
  it('draws the masternodes, colours them by reachability and counts them in the headline @RA-50 @RA-51', async () => {
    renderAt('/map')
    await screen.findByRole('heading', { level: 1, name: 'Map' })
    await waitFor(() => expect(headline()).toHaveTextContent(/134 of 150 masternodes answered/))
    expect(headline()).toHaveTextContent('130 enabled')
    expect(headline()).toHaveTextContent('PoSe-banned')
    await waitFor(() => expect(last().points.length).toBeGreaterThan(100))
    expect(last().layer).toBe('mn')
    expect(new Set(last().points.map((p) => p.tone))).toEqual(new Set(['good', 'critical']))
    const chips = within(screen.getByRole('group', { name: 'Show or hide categories' }))
    expect(chips.getByRole('button', { name: /Reachable/ })).toHaveTextContent('134')
    expect(chips.getByRole('button', { name: /Unreachable/ })).toHaveTextContent('10')
    expect(chips.getByRole('button', { name: /Not checked/ })).toHaveTextContent('6')
  })

  it('hides a category from the chips and keeps it in the address @RA-51 @RA-52', async () => {
    const user = userEvent.setup()
    renderAt('/map')
    const chips = await screen.findByRole('group', { name: 'Show or hide categories' })
    await waitFor(() => expect(last().points.length).toBeGreaterThan(100))
    const before = last().points.length
    await user.click(within(chips).getByRole('button', { name: /Unreachable/ }))
    await waitFor(() => expect(last().points.length).toBeLessThan(before))
    expect(within(chips).getByRole('button', { name: /Unreachable/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(headline()).toHaveTextContent(/134 of 140 masternodes answered/)
  })

  it('colours by version, with the five commonest versions named and the rest folded @RA-50', async () => {
    renderAt('/map?color=version')
    const chips = await screen.findByRole('group', { name: 'Show or hide categories' })
    await waitFor(() =>
      expect(within(chips).getByRole('button', { name: /24\.0\.0/ })).toBeInTheDocument(),
    )
    expect(within(chips).getByRole('button', { name: /Unknown version/ })).toHaveTextContent('16')
    expect(screen.getByRole('button', { name: 'Version' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('narrows the map with the type, version, country, hosting and search filters @RA-51', async () => {
    const user = userEvent.setup()
    renderAt('/map')
    await waitFor(() => expect(last().points.length).toBeGreaterThan(100))
    const all = last().points.length
    const country = screen.getByLabelText('Country')
    expect(within(country).getByRole('option', { name: /Germany \(DE\) · 78/ })).toBeInTheDocument()
    await user.selectOptions(country, 'DE')
    await waitFor(() => expect(last().points.length).toBe(78))
    expect(last().points.length).toBeLessThan(all)
    const hosting = screen.getByLabelText('Hosting')
    expect(
      within(hosting).getByRole('option', { name: /^Hetzner Online GmbH/ }),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Type'), 'evo')
    await waitFor(() => expect(last().points.length).toBeLessThan(78))
    await user.type(screen.getByRole('searchbox', { name: 'Search masternodes' }), 'zzzz-no-such')
    await waitFor(() => expect(last().points.length).toBe(0))
  })

  it('opens these masternodes as a list with the same filter fields @RA-51', async () => {
    renderAt('/map?country=DE&type=evo&host=24940&hide=unchecked,unreachable')
    const link = await screen.findByRole('link', { name: 'Open these as a list' })
    await waitFor(() => expect(link.getAttribute('href')).toContain('/masternodes?'))
    const href = new URL(link.getAttribute('href')!, 'http://x')
    expect(href.pathname).toBe('/masternodes')
    expect(href.searchParams.get('country')).toBe('DE')
    expect(href.searchParams.get('type')).toBe('evo')
    expect(href.searchParams.get('host')).toBe('24940')
    expect(href.searchParams.get('reach')).toBe('reachable')
    expect(href.searchParams.has('hide')).toBe(false)
  })

  it('says how many masternodes are not on the map @RA-51', async () => {
    renderAt('/map')
    await waitFor(() => expect(screen.getByText(/not on the map/)).toBeInTheDocument())
    expect(screen.getByText(/not on the map/)).toHaveTextContent(
      /^\d+ masternodes are not on the map/,
    )
  })

  it('switches to the all-nodes layer, per city, from the geo document @RA-50', async () => {
    const user = userEvent.setup()
    renderAt('/map')
    await waitFor(() => expect(last().points.length).toBeGreaterThan(100))
    await user.click(await screen.findByRole('button', { name: 'All nodes' }))
    await waitFor(() => expect(last().layer).toBe('nodes'))
    expect(last().geo).toHaveLength(198)
    await waitFor(() =>
      expect(screen.getByText(/reachable nodes in 198 places/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/have no location, so they are not drawn/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Country')).toBeNull()
  })

  it('opens a masternode popup from the address, focused on its protx, with a link to it @RA-52', async () => {
    const protx = '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32'
    renderAt(`/map?protx=${protx}`)
    const card = await waitFor(() => {
      const el = document.querySelector(`[data-fake-map] [data-map-card="${protx}"]`)
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(last().selected).toBe(protx)
    expect(last().selectedAt).toHaveLength(2)
    expect(within(card).getByRole('link', { name: 'Open masternode' })).toHaveAttribute(
      'href',
      `/mn/${protx}`,
    )
    expect(card).toHaveTextContent('Address')
    expect(card).toHaveTextContent('Uptime, 7 days')
    expect(card).toHaveTextContent('Last paid')
  })

  it('drops a protx that is not on the map without opening anything @RA-52', async () => {
    renderAt(`/map?protx=${'0'.repeat(64)}`)
    await waitFor(() => expect(last().points.length).toBeGreaterThan(100))
    expect(last().selected).toBeUndefined()
    expect(document.querySelector('[data-map-card]')).toBeNull()
  })

  it('lists the masternodes of a cluster that cannot split any further @RA-50', async () => {
    renderAt('/map')
    await waitFor(() => expect(last().points.length).toBeGreaterThan(100))
    const protxs = last()
      .points.slice(0, 3)
      .map((p) => p.protx)
    act(() => {
      last().onGroup(protxs)
    })
    const group = await waitFor(() => {
      const el = document.querySelector('[data-map-group]')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(within(group).getAllByRole('button').length).toBeGreaterThanOrEqual(3)
    act(() => {
      last().onSelect(protxs[0])
    })
    await waitFor(() => expect(last().selected).toBe(protxs[0]))
  })

  it('says once that the crawl is needed in Decentralized only mode, and draws the land with no data @RA-50 @X-05', async () => {
    writeSourceMode('decentralized')
    renderAt('/map')
    await screen.findByRole('heading', { level: 1, name: 'Map' })
    expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1)
    await waitFor(() => expect(views.length).toBeGreaterThan(0))
    expect(last().points).toHaveLength(0)
    expect(last().geo).toHaveLength(0)
    expect(mapPage().querySelector('[data-map-panel]')).toBeNull()
  })
})
