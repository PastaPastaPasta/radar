import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { renderAt, saveDevnet } from '../hy-shared/test-utils'

const SECOND_PAGE = {
  totalCount: 71,
  value: Array.from({ length: 5 }, (_, i) => ({
    txHash: (i + 1).toString(16).padStart(64, 'a'),
    txType: 'normal',
    txSize: 250,
    valueOut: 100_000_000 * (i + 1),
    firstSeenAt: '2026-11-10T15:20:00Z',
    lastSeenAt: '2026-11-10T15:20:00Z',
    tags: { mined: false, coinbase: false },
  })),
}

describe('Mempool page', () => {
  it('summarises the mempool: count, size and memory use @HY-06', async () => {
    renderAt('/mempool')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mempool' })).toBeInTheDocument()
    const summary = await waitFor(() => {
      const el = document.querySelector('[data-mempool-summary]')
      expect(el).toHaveTextContent('71')
      return el as HTMLElement
    })
    expect(summary).toHaveTextContent('Transactions')
    expect(summary).toHaveTextContent('Size')
    expect(summary).toHaveTextContent('Memory in use')
  })

  it('lists pending transactions with type, size, value and first seen, and pages @HY-06', async () => {
    server.use(
      http.get('*/x/hy/mainnet/mempool/txs', ({ request }) =>
        new URL(request.url).searchParams.has('cursor')
          ? HttpResponse.json(SECOND_PAGE)
          : undefined,
      ),
    )
    const user = userEvent.setup()
    renderAt('/mempool')
    const table = await screen.findByRole('table', { name: /Pending transactions/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(21))
    for (const head of ['Type', 'Size', 'Value', 'First seen']) {
      expect(within(table).getByRole('columnheader', { name: head })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
  })

  it('reads from Hyphen @HY-06', async () => {
    renderAt('/mempool')
    await screen.findByRole('table', { name: /Pending transactions/ })
    await waitFor(() => expect(document.querySelector('[data-source="hyphen"]')).not.toBeNull())
  })

  it('works on testnet @HY-19', async () => {
    renderAt('/mempool?network=testnet')
    await waitFor(() =>
      expect(document.querySelector('[data-mempool-summary]')).toHaveTextContent('485'),
    )
  })

  it('does not look live while the index trails the chain @HY-19', async () => {
    renderAt('/mempool?network=testnet')
    const status = await screen.findByText(/not a live view/)
    expect(status).toHaveTextContent('Checked every 15 seconds')
    expect(status.closest('p')?.querySelector('[data-live-dot]')).toHaveAttribute(
      'data-live-dot',
      'stale',
    )
    expect(screen.queryByText(/Refreshes every/)).toBeNull()
    expect(screen.queryByText('Live')).toBeNull()
    expect(screen.getByText('Checked')).toBeInTheDocument()
    expect(document.querySelector('[data-stale-index]')).toHaveTextContent('not live')
  })

  it('says it refreshes while the index is current @HY-19', async () => {
    renderAt('/mempool')
    expect(await screen.findByText('Refreshes every 15 seconds.')).toBeInTheDocument()
    expect(screen.getByText('Updated')).toBeInTheDocument()
    expect(document.querySelector('[data-stale-index]')).toBeNull()
  })

  it('explains that devnets are not indexed @HY-19', async () => {
    saveDevnet()
    renderAt('/mempool?network=devnet-ruby')
    expect(await screen.findByText('Hyphen doesn’t index devnets.')).toBeInTheDocument()
    localStorage.clear()
  })
})
