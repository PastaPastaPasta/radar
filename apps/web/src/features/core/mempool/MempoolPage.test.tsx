import { http, HttpResponse } from 'msw'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { coreLive, type LiveTxEvent } from '@/data/core/live'
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

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const TESTNET_TX = '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6'

describe('Mempool page', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  describe('while the index trails the chain @HY-19', () => {
    const feed = () => {
      let deliver: ((e: LiveTxEvent) => void) | undefined
      vi.spyOn(coreLive, 'transactions').mockImplementation((_net, listener) => {
        deliver = listener
        return () => undefined
      })
      vi.spyOn(coreLive, 'txStatus').mockReturnValue({ state: 'live', fallbackHint: false })
      return (e: LiveTxEvent) => act(() => deliver?.(e))
    }
    const seenView = () =>
      waitFor(() => {
        const el = document.querySelector<HTMLElement>('[data-mempool-view="seen"]')
        expect(el).not.toBeNull()
        return el!
      })

    it("fills the page from DAPI's live feed, labelled as seen since the page opened @HY-19 @IN-16", async () => {
      const deliver = feed()
      renderAt('/mempool?network=testnet')
      const status = await seenView()
      expect(status).toHaveTextContent("From DAPI's live feed")
      expect(status).toHaveTextContent('not the whole mempool')
      expect(await screen.findByText('Nothing seen yet')).toBeInTheDocument()
      expect(document.querySelector('[data-mempool-summary="seen"]')).toHaveTextContent(
        'Seen and still pending0',
      )

      const tx = { ...(await core.tx('testnet', TESTNET_TX)).data!, height: undefined }
      deliver({ kind: 'tx', tx })
      const table = await screen.findByRole('table', {
        name: 'Pending transactions seen since you opened this page, newest first',
      })
      expect(within(table).getAllByRole('row')).toHaveLength(2)
      expect(within(table).getByRole('columnheader', { name: 'Seen' })).toBeInTheDocument()
      expect(document.querySelector('#pending')).toHaveTextContent(
        'Seen since you opened this page',
      )
      expect(document.querySelector('#pending [data-source="dapi"]')).not.toBeNull()
      expect(document.querySelector('[data-mempool-summary="seen"]')).toHaveTextContent(
        'Seen and still pending1',
      )

      deliver({ kind: 'block', txids: [tx.txid] })
      expect(await screen.findByText('Nothing seen yet')).toBeInTheDocument()
    })

    it('shows nothing Hyphen says about the mempool, and stops asking it @HY-19', async () => {
      feed()
      let asked = 0
      server.use(
        http.get('*/x/hy/testnet/mempool*', () => {
          asked++
          return undefined
        }),
      )
      renderAt('/mempool?network=testnet')
      await seenView()
      const before = asked
      expect(document.querySelector('[data-source="hyphen"]')).toBeNull()
      expect(screen.queryByText(/Refreshes every/)).toBeNull()
      expect(screen.queryByText('Memory in use')).toBeNull()
      await new Promise((r) => setTimeout(r, 50))
      expect(asked).toBe(before)
    })

    it('shows one compact notice for the stale index, which says what the page shows instead @IN-03 @HY-19', async () => {
      feed()
      renderAt('/mempool?network=testnet')
      await seenView()
      const notices = document.querySelectorAll('[data-stale-index]')
      expect(notices).toHaveLength(1)
      expect(notices[0]).toHaveTextContent(/Testnet index is behind the chain/)
      expect(notices[0]).toHaveTextContent("DAPI's live feed has delivered since you opened it")
      expect(notices[0]).not.toHaveTextContent('not live')
      expect(
        within(notices[0] as HTMLElement).getByRole('link', { name: 'See the sources' }),
      ).toHaveAttribute('href', expect.stringContaining('/status'))
      expect(document.querySelector('.rx-card__lag')).toBeNull()
    })
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
