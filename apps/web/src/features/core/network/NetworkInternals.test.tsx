import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/app'
import { pagesInSection } from '@/features/entity'
import { describe, expect, it, vi } from 'vitest'
import { renderAt } from '../hy-shared/test-utils'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))

describe('Network internals', () => {
  it('shows chain state, mempool pressure, velocity, versions, masternode counts and peers @HY-12', async () => {
    renderAt('/internals')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Network internals' }),
    ).toBeInTheDocument()
    expect(document.title).toContain('Network internals')
    await waitFor(() =>
      expect(document.querySelector('[data-internals-chain]')).toHaveTextContent('Chain size'),
    )
    const chain = document.querySelector('[data-internals-chain]')
    expect(chain).toHaveTextContent('Spendable outputs')
    expect(chain).toHaveTextContent('Hash rate')
    expect(await screen.findByText('Mempool pressure')).toBeInTheDocument()
    expect(await screen.findByText('Transaction velocity')).toBeInTheDocument()
    await waitFor(() =>
      expect(document.querySelector('[data-internals-masternodes]')).toHaveTextContent('2,626'),
    )
    expect(document.querySelector('[data-internals-masternodes]')).toHaveTextContent('371')
    await waitFor(() =>
      expect(document.querySelector('[data-internals-versions]')).toHaveTextContent('23.1.8'),
    )
    const peers = await screen.findByRole('table', {
      name: /Peers of the node Hyphen indexes from/,
    })
    await waitFor(() => expect(within(peers).getAllByRole('row')).toHaveLength(11))
  })

  it('draws each history metric as a chart that fills its column, with units and every value @HY-12', async () => {
    renderAt('/internals')
    const plot = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-internals-plot="hashrate"]')
      expect(el?.querySelector('tbody tr') ?? null).not.toBeNull()
      return el!
    })
    expect(
      within(plot).getByRole('img', { name: 'Hash rate over the last 144 blocks' }),
    ).toBeVisible()
    expect(plot.querySelector('tbody td')).toHaveTextContent(/[\d.,]+ [kMGTPE]?H\/s/)
    expect(within(plot).getByRole('columnheader', { name: 'Block height' })).toBeInTheDocument()
    expect(plot.querySelector('.rx-sparkbox'), 'no fixed-width sparkline').toBeNull()
    for (const id of ['difficulty', 'utxos', 'transactions']) {
      expect(
        document.querySelector(`[data-internals-plot="${id}"] .rx-chart tbody tr`),
        id,
      ).not.toBeNull()
    }
  })

  it('shows versions and masternode statuses as one bar split by share, each part keyed @HY-12', async () => {
    renderAt('/internals')
    const versions = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-internals-versions] [data-share-bar]')
      expect(el).not.toBeNull()
      return el!
    })
    const bar = within(versions).getByRole('img')
    expect(bar).toHaveAccessibleName(/24\.0\.0: 5 of 10 peers, 23\.1\.[08]: 2 of 10 peers/)
    const segments = [...bar.querySelectorAll('i')]
    expect(segments).toHaveLength(4)
    expect(segments.map((i) => i.style.background)).toEqual([
      'var(--rx-series-1)',
      'var(--rx-series-2)',
      'var(--rx-series-3)',
      'var(--rx-series-4)',
    ])
    expect(versions.querySelector('[data-part="24.0.0"]')).toHaveTextContent('5 of 10 peers')
    const status = document.querySelector<HTMLElement>(
      '[data-internals-masternodes] [data-share-bar]',
    )!
    const parts = [...status.querySelectorAll('.rx-stack i')] as HTMLElement[]
    expect(parts.map((i) => i.style.background)).toEqual(['var(--dh-good)', 'var(--dh-bad)'])
    expect(status.querySelector('[data-part="banned"]')).toHaveTextContent('782')
  })

  it('redirects the old charts tab link, keeping the other parameters @HY-12', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/charts?tab=internals&network=testnet'],
    })
    render(<App history={history} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Network internals' }),
    ).toBeInTheDocument()
    expect(history.location.pathname).toBe('/internals')
    expect(history.location.search).toContain('network=testnet')
    expect(history.location.search).not.toContain('tab=')
  })

  it('is in the Core section rail of every Core page and the page list @HY-12', async () => {
    renderAt('/charts')
    expect(await screen.findByRole('heading', { level: 1, name: 'Charts' })).toBeInTheDocument()
    const rail = document.querySelector<HTMLElement>('nav[data-section-nav="core"]')!
    expect(within(rail).getByRole('link', { name: 'Network internals' })).toHaveAttribute(
      'href',
      '/internals',
    )
    expect(pagesInSection('core').some((p) => p.path === '/internals')).toBe(true)
  })

  it('works on testnet @HY-19', async () => {
    renderAt('/internals?network=testnet')
    await waitFor(() =>
      expect(document.querySelector('[data-internals-masternodes]')).toHaveTextContent('321'),
    )
  })
})
