import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import type * as ClientModule from '@/data/core/client'
import { coreLive } from '@/data/core/live'
import { SOURCE_MODE_KEY, writeSourceMode } from '@/lib/source-mode'
import { server } from '@/test/server'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const HOSTED = /\/x\/hy\/|insight|pe\.dashhq\.org|radar\.dashhq\.org\/api/

function renderAt(url: string) {
  const history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} />)
  return history
}

/** Requests to a hosted backend since the call. */
function hostedRequests(): string[] {
  const seen: string[] = []
  server.events.on('request:start', ({ request }) => {
    if (HOSTED.test(request.url)) seen.push(request.url)
  })
  return seen
}

const mark = () => document.querySelector('[data-source-mode="decentralized"]')
const unavailable = () => document.querySelectorAll('[data-unavailable="mode"]')
const page = (path: string) =>
  waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[data-page="${path}"]`)
    expect(el).not.toBeNull()
    return el!
  })
/** Long enough for anything the page starts on mount to have reached the network layer. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 150)))

beforeEach(() => {
  vi.spyOn(coreLive, 'transactions').mockReturnValue(() => undefined)
  vi.spyOn(coreLive, 'txStatus').mockReturnValue({ state: 'live', fallbackHint: false })
})
afterEach(() => {
  server.events.removeAllListeners()
  localStorage.clear()
  writeSourceMode('all')
  vi.restoreAllMocks()
})

describe('Decentralized only mode: the switch @X-05 @X-09 @PE-28', () => {
  it('is off until chosen: no header mark, and hosted sources are read', async () => {
    const requests = hostedRequests()
    renderAt('/mempool')
    await page('/mempool')
    await waitFor(() =>
      expect(requests.some((u) => u.includes('/x/hy/mainnet/mempool'))).toBe(true),
    )
    expect(mark()).toBeNull()
    expect(unavailable()).toHaveLength(0)
  })

  it('turns on from Settings without a reload, is remembered, and shows the header mark that links to Sources', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    const group = await screen.findByRole('group', { name: 'Sources' })
    expect(within(group).getByRole('button', { name: 'All sources' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(group).getByRole('button', { name: 'Decentralized only' }))
    expect(localStorage.getItem(SOURCE_MODE_KEY)).toBe('decentralized')
    expect(within(group).getByRole('button', { name: 'Decentralized only' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => expect(mark()).not.toBeNull())
    expect(mark()).toHaveAttribute('href', expect.stringContaining('/sources'))
    expect(mark()).toHaveAttribute(
      'title',
      expect.stringContaining('DAPI nodes and the Platform SDK'),
    )

    await user.click(within(group).getByRole('button', { name: 'All sources' }))
    expect(localStorage.getItem(SOURCE_MODE_KEY)).toBeNull()
    await waitFor(() => expect(mark()).toBeNull())
  })

  it('is on when remembered, with nothing in the address', async () => {
    writeSourceMode('decentralized')
    const requests = hostedRequests()
    const history = renderAt('/rich-list')
    await page('/rich-list')
    await waitFor(() => expect(unavailable()).toHaveLength(1))
    await settle()
    expect(requests).toEqual([])
    expect(history.location.search).toBe('')
  })

  it('is on for a visit whose address says so, without being remembered, and in-app links keep it', async () => {
    const requests = hostedRequests()
    renderAt('/rich-list?sources=decentralized')
    await page('/rich-list')
    await waitFor(() => expect(mark()).not.toBeNull())
    expect(localStorage.getItem(SOURCE_MODE_KEY)).toBeNull()
    const charts = screen.getAllByRole('link', { name: 'Charts' })[0]!
    expect(charts).toHaveAttribute('href', expect.stringContaining('sources=decentralized'))
    await settle()
    expect(requests).toEqual([])
  })

  it('keeps the mode and the network together across a link', async () => {
    renderAt('/rich-list?network=testnet&sources=decentralized')
    await page('/rich-list')
    const href = screen.getAllByRole('link', { name: 'Charts' })[0]!.getAttribute('href')
    expect(href).toContain('network=testnet')
    expect(href).toContain('sources=decentralized')
  })

  it('drops any other value of the parameter', async () => {
    const history = renderAt('/settings?sources=everything')
    await page('/settings')
    await waitFor(() => expect(history.location.search).toBe(''))
    expect(mark()).toBeNull()
  })

  it('switches off from an unavailable state: the address drops the parameter and the page reads its sources again', async () => {
    const user = userEvent.setup()
    const requests = hostedRequests()
    const history = renderAt('/rich-list?sources=decentralized')
    await page('/rich-list')
    const state = await waitFor(() => {
      expect(unavailable()).toHaveLength(1)
      return unavailable()[0] as HTMLElement
    })
    expect(state).toHaveTextContent('The rich list needs an indexer')
    expect(state).toHaveTextContent(
      'Decentralized only mode reads only DAPI nodes and the Platform SDK.',
    )
    expect(within(state).getByRole('link', { name: 'About sources' })).toHaveAttribute(
      'href',
      expect.stringContaining('/sources'),
    )
    expect(requests).toEqual([])

    await user.click(within(state).getByRole('button', { name: 'Use all sources' }))
    await waitFor(() => expect(history.location.search).toBe(''))
    await waitFor(() => expect(unavailable()).toHaveLength(0))
    expect(mark()).toBeNull()
    await waitFor(() => expect(requests.some((u) => u.includes('/x/hy/mainnet/'))).toBe(true))
  })

  it('forgets what a hosted source said the moment it is switched on mid-session', async () => {
    const user = userEvent.setup()
    localStorage.setItem('radar.unit', 'USD')
    renderAt('/settings')
    await waitFor(() => expect(document.querySelector('#units [data-rate-note]')).not.toBeNull())
    expect(document.querySelector('#units [data-source="rate"]')).not.toBeNull()

    const group = await screen.findByRole('group', { name: 'Sources' })
    await user.click(within(group).getByRole('button', { name: 'Decentralized only' }))
    await waitFor(() => expect(document.querySelector('[data-rate-note]')).toBeNull())
    expect(document.querySelector('[data-source="rate"]')).toBeNull()
    const units = screen.getByRole('group', { name: 'Unit for amounts' })
    expect(within(units).getByRole('button', { name: 'USD' })).toBeDisabled()
    expect(within(units).getByRole('button', { name: 'DASH' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(document.querySelector('#units [data-unavailable="mode"]')).toHaveTextContent(
      'USD prices need a price feed',
    )
  })
})

const MAINNET_TX = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const TESTNET_TX = '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6'
const PROPOSAL = '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c'
const PROTX = '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32'

interface Visit {
  url: string
  path: string
  /** How many unavailable states the page shows: one for a page that is all index, none where DAPI answers everything. */
  unavailable: number | 'some'
  /** Text that proves the page still shows what DAPI or the SDK can answer. */
  shows?: RegExp
}

const VISITS: Visit[] = [
  { url: '/', path: '/', unavailable: 'some', shows: /Core blocks/ },
  { url: '/?network=testnet', path: '/', unavailable: 'some', shows: /Core blocks/ },
  { url: '/blocks', path: '/blocks', unavailable: 0, shows: /2,570,/ },
  { url: '/blocks?date=2026-11-03', path: '/blocks', unavailable: 0, shows: /2,566,380/ },
  { url: '/block/2570002', path: '/block/$id', unavailable: 0, shows: /2,570,002/ },
  { url: '/block/1589232?network=testnet', path: '/block/$id', unavailable: 0, shows: /1,589,232/ },
  { url: `/tx/${MAINNET_TX}`, path: '/tx/$txid', unavailable: 1, shows: /Inputs and outputs/ },
  {
    url: `/tx/${TESTNET_TX}?network=testnet`,
    path: '/tx/$txid',
    unavailable: 1,
    shows: /Inputs and outputs/,
  },
  {
    url: '/address/XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14',
    path: '/address/$address',
    unavailable: 1,
    shows: /Watching DAPI's live feed/,
  },
  {
    url: '/address/yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa?network=testnet',
    path: '/address/$address',
    unavailable: 1,
    shows: /Watching DAPI's live feed/,
  },
  { url: '/mempool', path: '/mempool', unavailable: 1, shows: /From DAPI's live feed/ },
  {
    url: '/mempool?network=testnet',
    path: '/mempool',
    unavailable: 1,
    shows: /From DAPI's live feed/,
  },
  { url: '/rich-list', path: '/rich-list', unavailable: 1 },
  { url: '/rich-list?network=testnet', path: '/rich-list', unavailable: 1 },
  { url: '/charts', path: '/charts', unavailable: 1 },
  { url: '/charts?network=testnet', path: '/charts', unavailable: 1 },
  { url: '/internals', path: '/internals', unavailable: 1 },
  { url: '/governance', path: '/governance', unavailable: 1 },
  { url: '/governance?network=testnet', path: '/governance', unavailable: 1 },
  { url: `/governance/${PROPOSAL}`, path: '/governance/$hash', unavailable: 1 },
  { url: `/mn/${PROTX}`, path: '/mn/$protx', unavailable: 1 },
  { url: '/status', path: '/status', unavailable: 0, shows: /Off in this mode/ },
  { url: '/status?network=testnet', path: '/status', unavailable: 0, shows: /Off in this mode/ },
  { url: '/settings', path: '/settings', unavailable: 1, shows: /Decentralized only/ },
  { url: '/sources', path: '/sources', unavailable: 0, shows: /Off in this mode/ },
  { url: '/sources?network=testnet', path: '/sources', unavailable: 0, shows: /Off in this mode/ },
]

describe('Decentralized only mode: every built page @X-05 @X-09', () => {
  it.each(VISITS)(
    '$url asks no hosted source and shows data or the unavailable state',
    async (visit) => {
      const requests = hostedRequests()
      const joiner = visit.url.includes('?') ? '&' : '?'
      renderAt(`${visit.url}${joiner}sources=decentralized`)
      const el = await page(visit.path)
      await waitFor(() => expect(mark()).not.toBeNull())
      if (visit.shows) await waitFor(() => expect(el).toHaveTextContent(visit.shows!))
      if (visit.unavailable === 'some') {
        await waitFor(() => expect(unavailable().length).toBeGreaterThan(0))
      } else {
        const count = visit.unavailable
        await waitFor(() => expect(unavailable()).toHaveLength(count))
      }
      await settle()
      expect(requests).toEqual([])
      expect(el.querySelector('[role="alert"]')).toBeNull()
      expect(el.querySelector('.rx-empty--error')).toBeNull()
      for (const source of ['hyphen', 'insight', 'pe', 'radar', 'rate']) {
        expect(el.querySelector(`[data-source="${source}"]`)).toBeNull()
      }
    },
  )
})

describe('Decentralized only mode: what each page says @X-05 @X-09', () => {
  it('names the node list and this site as hosts that stay in use, and the rest as off @PE-28', async () => {
    renderAt('/sources?sources=decentralized')
    const el = await page('/sources')
    const row = (id: string) => el.querySelector<HTMLElement>(`[data-backend="${id}"]`)!
    await waitFor(() => expect(row('dapi')).not.toBeNull())
    for (const id of ['dapi', 'sdk', 'quorums', 'site']) {
      expect(row(id)).toHaveAttribute('data-state', 'in-use')
    }
    for (const id of ['hyphen', 'insight', 'pe', 'rate', 'radar']) {
      expect(row(id)).toHaveAttribute('data-state', 'off')
      expect(row(id)).toHaveAttribute('data-hosted', 'true')
    }
    expect(row('dapi')).toHaveAttribute('data-hosted', 'false')
    expect(row('quorums')).toHaveAttribute('data-hosted', 'true')
    expect(row('quorums')).toHaveTextContent('quorums.mainnet.networks.dash.org')
    expect(row('hyphen')).toHaveTextContent('/x/hy/mainnet')
    expect(row('hyphen')).toHaveTextContent('hy.kw.vg')
    expect(row('insight')).toHaveTextContent('insight.dash.org')
    expect(row('pe')).toHaveTextContent('api.pe.dashhq.org')
    expect(row('radar')).toHaveTextContent('radar.dashhq.org/api/v1')
    expect(within(row('pe')).getByRole('link', { name: /API documentation/ })).toHaveAttribute(
      'href',
      expect.stringContaining('platform-explorer'),
    )
  })

  it('lists every backend as in use with all sources, and the price feed as not on testnet @PE-28', async () => {
    renderAt('/sources?network=testnet')
    const el = await page('/sources')
    const row = (id: string) => el.querySelector<HTMLElement>(`[data-backend="${id}"]`)!
    await waitFor(() => expect(row('dapi')).not.toBeNull())
    for (const id of ['dapi', 'sdk', 'quorums', 'hyphen', 'insight', 'pe', 'radar', 'site']) {
      expect(row(id)).toHaveAttribute('data-state', 'in-use')
    }
    expect(row('rate')).toHaveAttribute('data-state', 'not-offered')
    expect(row('quorums')).toHaveTextContent('quorums.testnet.networks.dash.org')
    expect(row('hyphen')).toHaveTextContent('ts.kw.vg')
  })

  it('has the same switch on the Sources page as on Settings', async () => {
    const user = userEvent.setup()
    renderAt('/sources')
    const group = await screen.findByRole('group', { name: 'Sources' })
    await user.click(within(group).getByRole('button', { name: 'Decentralized only' }))
    expect(localStorage.getItem(SOURCE_MODE_KEY)).toBe('decentralized')
    await waitFor(() =>
      expect(document.querySelector('[data-backend="hyphen"]')).toHaveAttribute(
        'data-state',
        'off',
      ),
    )
  })

  it('reports only DAPI and the SDK on the status page, with the hosted rows marked off and not probed', async () => {
    renderAt('/status?sources=decentralized')
    const el = await page('/status')
    await waitFor(() =>
      expect(el.querySelector('[data-source-row="hyphen"]')).toHaveAttribute('data-state', 'off'),
    )
    for (const source of ['radar', 'pe', 'hyphen', 'insight', 'rate']) {
      expect(el.querySelector(`[data-source-row="${source}"]`)).toHaveAttribute('data-state', 'off')
    }
    expect(el.querySelector('[data-source-row="dapi"]')).not.toHaveAttribute('data-state', 'off')
    await waitFor(() =>
      expect(el.querySelector('[data-overall]')).toHaveTextContent(
        'Hosted sources are off in Decentralized only mode',
      ),
    )
  })

  it('shows the transaction itself from DAPI and says once that spend state needs an indexer', async () => {
    renderAt(`/tx/${MAINNET_TX}?sources=decentralized`)
    const el = await page('/tx/$txid')
    await waitFor(() => expect(unavailable()).toHaveLength(1))
    expect(unavailable()[0]).toHaveTextContent('needs an indexer')
    expect(unavailable()[0]).toHaveAttribute('data-compact', '1')
    expect(el.querySelector('#io [data-spend="spent"]')).toBeNull()
    expect(el.querySelector('#io [data-spend="unspent"]')).toBeNull()
    expect(el.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('skips index lookups in search and says so, while what DAPI and the device can answer still shows', async () => {
    const requests = hostedRequests()
    renderAt('/search?q=XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14&sources=decentralized')
    const el = await page('/search')
    await waitFor(() => expect(unavailable()).toHaveLength(1))
    expect(unavailable()[0]).toHaveTextContent('Lookups in an index were skipped')
    expect(within(el).getAllByRole('link', { name: /XnT33zjr/ }).length).toBeGreaterThan(0)
    await settle()
    expect(requests).toEqual([])
  })
})
