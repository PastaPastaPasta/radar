import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/app'
import { pagesInSection } from '@/features/entity'
import { describe, expect, it } from 'vitest'
import { renderAt } from '../hy-shared/test-utils'

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
