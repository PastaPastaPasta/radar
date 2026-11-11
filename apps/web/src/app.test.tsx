import { createMemoryHistory } from '@tanstack/react-router'
import { act, configure, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from './data/core/client'
import { App } from './app'
import { DEVNET_STORAGE_KEY } from './app/devnets'
import { getActiveNetwork } from './data/active-network'
import { SITE_MAP } from './features/entity'

configure({ asyncUtilTimeout: 5000 })

vi.mock('./data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('./test/core-client')
  return { ...actual, core: fixtureCore().core }
})

function renderAt(url: string) {
  const history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} />)
  return history
}

afterEach(() => {
  localStorage.removeItem(DEVNET_STORAGE_KEY)
})

describe('App', () => {
  it('renders the index route', async () => {
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: /Radar/ })).toBeInTheDocument()
  })

  it('accepts the network search param', async () => {
    renderAt('/?network=testnet')

    expect(await screen.findByRole('heading', { name: /Radar/ })).toBeInTheDocument()
    expect(document.documentElement.dataset.networkKind).toBe('test')
  })
})

describe('active network', () => {
  it('follows the route, including the legacy parameter', async () => {
    const history = renderAt('/status?network=testnet')
    await screen.findByRole('heading', { level: 1 })
    expect(getActiveNetwork()).toBe('testnet')

    act(() => history.push('/status'))
    await waitFor(() => expect(getActiveNetwork()).toBe('mainnet'))

    act(() => history.push('/status?net=testnet'))
    await waitFor(() => expect(getActiveNetwork()).toBe('testnet'))
  })
})

describe('network param', () => {
  it('rewrites a legacy ?net= to ?network=', async () => {
    const history = renderAt('/masternodes?net=testnet')

    await waitFor(() => expect(history.location.search).toBe('?network=testnet'))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Masternodes' }),
    ).toBeInTheDocument()
  })

  it('reads an explicit mainnet as mainnet and leaves it off links', async () => {
    renderAt('/status?network=mainnet')

    const link = await screen.findByRole('link', { name: 'Data sources' })
    expect(link).toHaveAttribute('href', '/sources')
    expect(document.documentElement.dataset.networkKind).toBe('main')
  })

  it('treats a bad value as mainnet', async () => {
    const history = renderAt('/status?network=nope')

    await waitFor(() => expect(history.location.search).toBe(''))
  })

  it('keeps network on links', async () => {
    renderAt('/status?network=testnet')

    const link = await screen.findByRole('link', { name: 'Data sources' })
    expect(link).toHaveAttribute('href', '/sources?network=testnet')
  })

  it('asks for the devnet details before showing a page', async () => {
    renderAt('/status?network=devnet-paloma')

    expect(
      await screen.findByRole('heading', { name: 'Set up the paloma devnet' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Status' })).not.toBeInTheDocument()
  })

  it('shows the page for a saved devnet', async () => {
    localStorage.setItem(
      DEVNET_STORAGE_KEY,
      JSON.stringify([{ name: 'paloma', dapiAddresses: ['192.0.2.10:1443'] }]),
    )
    renderAt('/platform?network=devnet-paloma')

    expect(await screen.findByRole('heading', { level: 1, name: 'Platform' })).toBeInTheDocument()
  })
})

describe('legacy and alias paths', () => {
  it('sends /validators to the evonode list', async () => {
    const history = renderAt('/validators?network=testnet')

    await waitFor(() => expect(history.location.pathname).toBe('/masternodes'))
    expect(history.location.search).toBe('?network=testnet&type=evo&view=platform')
  })

  it.each([
    ['/platform#epochs', '/epochs'],
    ['/platform#upgrade', '/protocol'],
    ['/platform#all', '/validators'],
  ])('moves the old Radar anchor %s to %s', async (from, to) => {
    const history = renderAt(from)

    await waitFor(() => expect(history.location.pathname).not.toBe('/platform'))
    expect([to, '/masternodes']).toContain(history.location.pathname)
  })

  it('opens Insight-style block paths', async () => {
    const hash = 'a'.repeat(64)
    const byHeight = renderAt('/block-index/2569992')
    await waitFor(() => expect(byHeight.location.pathname).toBe('/block/2569992'))
    const byHash = renderAt(`/insight/block/${hash}`)
    await waitFor(() => expect(byHash.location.pathname).toBe(`/block/${hash}`))
  })

  it('keeps the day when it opens an Insight blocks list', async () => {
    const history = renderAt('/insight/blocks?blockDate=2026-10-01')
    await waitFor(() => expect(history.location.pathname).toBe('/blocks'))
    expect(history.location.search).toContain('date=2026-10-01')
    expect(history.location.search).not.toContain('blockDate')
  })
})

describe('routes', () => {
  const SAMPLE: Record<string, string> = {
    $id: '2569992',
    $txid: 'e0028eb9648db56b1ac77cf090b99048a8007e2bb64b74b4a4cb7c4d8d6e6e47',
    $address: 'XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc',
    $hash: '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6',
    $protx: '5'.repeat(64),
    $n: '12',
    $label: 'alice',
    $type: 'domain',
    $contract: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    $pos: '0',
    $addr: 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs',
    $decoder: 'tx',
  }
  const pages = SITE_MAP.filter((p) => p.path !== '/validators')

  it.each(pages.map((p) => [p.path, p.title.message ?? p.path] as const))(
    '%s has a heading and says where its data comes from',
    async (path, title) => {
      const url = path.replace(/\$\w+/g, (m) => encodeURIComponent(SAMPLE[m] ?? 'x'))
      renderAt(url)

      await waitFor(
        () =>
          expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
            path === '/' ? 'Radar' : title,
          ),
        { timeout: 12_000 },
      )
    },
    15_000,
  )

  it('shows a designed not-found page', async () => {
    renderAt('/no/such/page')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(screen.getByText('There is no page at /no/such/page')).toBeInTheDocument()
  })
})
