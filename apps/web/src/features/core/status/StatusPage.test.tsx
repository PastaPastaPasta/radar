import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import type { CoreClient } from '@/data/core/types'
import { SourceError } from '@/data/errors'
import { healthRegistry } from '@/data/health'

const mocked = vi.hoisted(() => ({ client: undefined as CoreClient | undefined }))
vi.mock('@/data/core/client', () => ({
  core: new Proxy({}, { get: (_t, key) => Reflect.get(mocked.client ?? {}, key) as unknown }),
}))
const setCoreClient = (client: CoreClient | undefined): void => {
  mocked.client = client
}

const NOW = Date.now()
const stamp = { source: 'dapi' as const, asOf: NOW, fetchedAt: NOW, proved: false }

function core(overrides: Partial<CoreClient> = {}): CoreClient {
  const never = () => Promise.reject(new Error('unused'))
  return {
    tip: () =>
      Promise.resolve({ ...stamp, data: { height: 2_570_010, hash: 'ab'.repeat(32), time: NOW } }),
    chainLock: () =>
      Promise.resolve({ ...stamp, data: { height: 2_570_008, hash: 'cd'.repeat(32) } }),
    status: () =>
      Promise.resolve({
        ...stamp,
        data: {
          chain: 'main',
          blocks: 2_570_010,
          headers: 2_570_010,
          bestBlockHash: 'ab'.repeat(32),
          difficulty: 1,
          medianTime: NOW,
          chainWork: '0',
          syncProgress: 1,
          isSynced: true,
        },
      }),
    block: never,
    tx: never,
    prevouts: never,
    headers: never,
    blockRows: never,
    heightAtTime: never,
    nodeSelfStatus: never,
    masternodeList: never,
    ...overrides,
  }
}

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

afterEach(() => setCoreClient(undefined))

describe('Status page', () => {
  it('shows the Core tip, the best ChainLock and how far apart they are @IN-09', async () => {
    setCoreClient(core())
    renderAt('/status')
    expect(await screen.findByRole('heading', { level: 1, name: 'Status' })).toBeInTheDocument()
    await waitFor(() =>
      expect(document.querySelector('[data-status="tip"]')).toHaveTextContent('2,570,010'),
    )
    expect(document.querySelector('[data-status="chainlock"]')).toHaveTextContent(
      '2,570,008 · 2 blocks behind the tip',
    )
    expect(document.querySelector('[data-status="sync"]')).toHaveTextContent('Synced')
  })

  it('says a one-node ChainLock is one node’s word, not a lock @IN-09', async () => {
    setCoreClient(
      core({
        chainLock: () =>
          Promise.resolve({
            ...stamp,
            data: { height: 2_570_010, hash: 'cd'.repeat(32), claim: 'one-node' as const },
          }),
      }),
    )
    renderAt('/status')
    await waitFor(() =>
      expect(document.querySelector('[data-status="chainlock"]')).toHaveTextContent(
        '2,570,010 · ChainLock reported by one node',
      ),
    )
    const card = document.querySelector<HTMLElement>('#core')!
    expect(within(card).getByText('ChainLock block hash, reported by one node')).toBeInTheDocument()
    expect(within(card).queryByText('ChainLocked block hash')).toBeNull()
  })

  it('keeps the plain ChainLock wording once a second source agrees @IN-09', async () => {
    setCoreClient(core())
    renderAt('/status')
    await waitFor(() =>
      expect(document.querySelector('[data-status="chainlock"]')).toHaveTextContent('2,570,008'),
    )
    const card = document.querySelector<HTMLElement>('#core')!
    expect(card.querySelector('[data-claim]')).toBeNull()
    expect(within(card).getByText('ChainLocked block hash')).toBeInTheDocument()
  })

  it("names the Core summary's source once, not once per figure @IN-09", async () => {
    setCoreClient(core())
    renderAt('/status')
    await waitFor(() =>
      expect(document.querySelector('[data-status="tip"]')).toHaveTextContent('2,570,010'),
    )
    const card = document.querySelector<HTMLElement>('#core')!
    await waitFor(() => expect(card.querySelectorAll('[data-source]').length).toBeGreaterThan(0))
    expect(card.querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
  })

  it('links to the network internals on the charts page @HY-12', async () => {
    setCoreClient(core())
    renderAt('/status')
    const link = await screen.findByRole('link', { name: /Network internals/ })
    expect(link).toHaveAttribute('href', '/charts?tab=internals')
  })

  it('lists every source with its state and what its backend reports @IN-09', async () => {
    setCoreClient(core())
    renderAt('/status')
    const list = await screen.findByRole('list', { name: 'Sources' })
    const names = within(list)
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('data-source-row'))
    expect(names).toEqual(['dapi', 'sdk', 'radar', 'pe', 'hyphen', 'rate'])

    await waitFor(() => {
      expect(within(list).getByText(/Indexed to Platform block/)).toBeInTheDocument()
      expect(within(list).getByText(/Last crawl finished/)).toBeInTheDocument()
      expect(within(list).getByText(/Indexed to Core block/)).toBeInTheDocument()
    })
  })

  it('lists the sources on a phone as short rows with the explanation behind a disclosure @HY-12', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string): MediaQueryList =>
        ({
          matches: query === '(max-width: 640px)',
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
          onchange: null,
        }) as MediaQueryList,
    )
    try {
      setCoreClient(core())
      renderAt('/status')
      const list = await screen.findByRole('list', { name: 'Sources' })
      await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(6))
      const hyphen = list.querySelector<HTMLElement>('[data-source-row="hyphen"]')!
      expect(within(hyphen).getByText('Hyphen')).toBeInTheDocument()
      expect(hyphen.querySelectorAll('p').length).toBeLessThanOrEqual(1 + 2)
      const details = hyphen.querySelector('details')!
      expect(details.open).toBe(false)
      expect(details.querySelector('summary')).not.toBeNull()
      await waitFor(() => expect(details).toHaveTextContent(/Indexed to Core block/))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('says a source is down, since when, and that the rest still work @IN-09', async () => {
    setCoreClient(core())
    renderAt('/status')
    await screen.findByRole('list', { name: 'Sources' })
    act(() => {
      healthRegistry.report('mainnet', 'sdk', { ok: true, latencyMs: 80 })
      for (let i = 0; i < 3; i++) {
        healthRegistry.report('mainnet', 'sdk', { ok: false, kind: 'network', latencyMs: 10 })
      }
    })
    const row = document.querySelector<HTMLElement>('[data-source-row="sdk"]')!
    await waitFor(() => expect(row.getAttribute('data-state')).toBe('down'))
    expect(row).toHaveTextContent('The connection failed.')
    expect(row).toHaveTextContent(/Last good/)
    expect(screen.getByRole('status')).toHaveTextContent('The rest still work')
  })

  it('shows the Hyphen lag on testnet instead of pretending it is fine @IN-16', async () => {
    setCoreClient(core())
    renderAt('/status?network=testnet')
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-source-row="hyphen"]')!
      expect(el.getAttribute('data-state')).toBe('stale')
      return el
    })
    expect(row).toHaveTextContent(/indexed to block 1,577,999/)
    await waitFor(() => expect(row).toHaveTextContent('but its index is behind the chain'))
    expect(row).not.toHaveTextContent(/Sync: synced/)
  })

  it('shows what is missing when Core cannot be reached', async () => {
    setCoreClient(
      core({
        tip: () =>
          Promise.reject(new SourceError({ source: 'dapi', kind: 'network', message: 'down' })),
        chainLock: () =>
          Promise.reject(new SourceError({ source: 'dapi', kind: 'network', message: 'down' })),
        status: () =>
          Promise.reject(new SourceError({ source: 'dapi', kind: 'network', message: 'down' })),
      }),
    )
    renderAt('/status')
    expect(await screen.findByRole('heading', { name: 'Dash Core' })).toBeInTheDocument()
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /Retry/ }).length).toBeGreaterThan(0),
      {
        timeout: 8000,
      },
    )
    expect(screen.getByRole('list', { name: 'Sources' })).toBeInTheDocument()
  }, 15_000)

  it('marks the sources a devnet does not have', async () => {
    localStorage.setItem(
      'radar.devnets',
      JSON.stringify([{ name: 'ruby', dapiAddresses: ['192.0.2.1:1443'] }]),
    )
    setCoreClient(core())
    renderAt('/status?network=devnet-ruby')
    const list = await screen.findByRole('list', { name: 'Sources' })
    for (const source of ['radar', 'pe', 'hyphen', 'rate']) {
      const row = list.querySelector(`[data-source-row="${source}"]`)
      expect(row).toHaveTextContent('Not offered')
    }
    expect(list.querySelector('[data-source-row="dapi"]')).not.toHaveTextContent('Not offered')
    localStorage.clear()
  })
})
