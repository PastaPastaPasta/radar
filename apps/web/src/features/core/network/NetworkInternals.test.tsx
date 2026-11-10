import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAt } from '../hy-shared/test-utils'

describe('Network internals', () => {
  it('shows chain state, mempool pressure, velocity, versions, masternode counts and peers @HY-12', async () => {
    renderAt('/charts?tab=internals')
    expect(await screen.findByRole('heading', { level: 1, name: 'Charts' })).toBeInTheDocument()
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

  it('has a tab to reach it from the charts @HY-12', async () => {
    renderAt('/charts')
    const tabs = await screen.findByRole('navigation', { name: 'Sections' })
    expect(within(tabs).getByRole('link', { name: 'Network internals' })).toHaveAttribute(
      'href',
      expect.stringContaining('tab=internals'),
    )
  })

  it('works on testnet @HY-19', async () => {
    renderAt('/charts?tab=internals&network=testnet')
    await waitFor(() =>
      expect(document.querySelector('[data-internals-masternodes]')).toHaveTextContent('321'),
    )
  })
})
