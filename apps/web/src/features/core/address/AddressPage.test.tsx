import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HyStreamEvent, HyTxDetail } from '@/data/hyphen/schemas'
import { renderAt } from '../hy-shared/test-utils'

const events: { push(e: HyStreamEvent): void; stop(): void } = {
  push: () => undefined,
  stop: () => undefined,
}

const arrivals = new Map<string, HyTxDetail>()

type PagedCall = (q: { limit?: number; cursor?: string }) => Promise<unknown>
let addressTxsOverride: PagedCall | undefined

vi.mock('@/data/hyphen/client', async (original) => {
  const actual = await original<{
    hyphen: {
      tx(net: string, txid: string, signal?: AbortSignal): Promise<unknown>
      addressTxs(net: string, a: string, q: object, signal?: AbortSignal): Promise<unknown>
    }
  }>()
  return {
    ...actual,
    hyphen: {
      ...actual.hyphen,
      addressTxs: (
        net: string,
        a: string,
        q: { limit?: number; cursor?: string },
        signal?: AbortSignal,
      ) =>
        addressTxsOverride ? addressTxsOverride(q) : actual.hyphen.addressTxs(net, a, q, signal),
      tx: (net: string, txid: string, signal?: AbortSignal) => {
        const arrived = arrivals.get(txid)
        if (!arrived) return actual.hyphen.tx(net, txid, signal)
        return Promise.resolve({
          source: 'hyphen' as const,
          asOf: Date.now(),
          fetchedAt: Date.now(),
          proved: false,
          data: arrived,
        })
      },
    },
  }
})

vi.mock('@/data/hyphen/live', () => ({
  openAddressEvents: () =>
    Promise.resolve(
      (async function* () {
        const queue: HyStreamEvent[] = []
        let wake: () => void = () => undefined
        let done = false
        events.push = (e) => {
          queue.push(e)
          wake()
        }
        events.stop = () => {
          done = true
          wake()
        }
        while (!done) {
          const next = queue.shift()
          if (next) yield next
          else await new Promise<void>((r) => (wake = r))
        }
      })(),
    ),
}))

vi.mock('./qr-image', () => ({
  qrPng: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
}))

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const TESTNET_ADDRESS = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'

afterEach(() => {
  addressTxsOverride = undefined
  events.stop()
  vi.restoreAllMocks()
})

describe('Address page', () => {
  it('tells the viewer when a new transaction arrives for the address @IN-06', async () => {
    const id = 'ab'.repeat(32)
    const tx: HyTxDetail = {
      txHash: id,
      txVersion: 3,
      txType: 'normal',
      txSize: 226,
      valueOut: 250_000_000n,
      inputCount: 1,
      outputCount: 1,
      vin: [
        { n: 0, sequence: 0, address: 'XmzJZQ5tib4NUwqXDH2fAg6jXUkYo4Gwmd', value: 300_000_000n },
      ],
      vout: [{ n: 0, value: 250_000_000n, scriptPubKey: { hex: '' }, address: ADDRESS }],
    }
    arrivals.set(id, tx)
    renderAt(`/address/${ADDRESS}`)
    await screen.findByText(/Watching for new transactions/)
    expect(document.querySelector('[data-new-transaction]')).toBeNull()
    events.push({ type: 'mempool_tx', ts: 1, payload: { txid: id } })
    const notice = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>('[data-new-transaction]')
        expect(el).not.toBeNull()
        return el!
      },
      { timeout: 4000 },
    )
    expect(notice).toHaveTextContent('New transaction')
    expect(notice).toHaveTextContent('2.5')
    expect(await screen.findByText(/1 new transaction since you opened this page/)).toBeVisible()
    expect(document.querySelector('[data-pending]')).toHaveTextContent('Unconfirmed')
  })

  it('shows the balance, totals and counts from Hyphen @IN-06 @HY-08', async () => {
    renderAt(`/address/${ADDRESS}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Address' })).toBeInTheDocument()
    const summary = await waitFor(() => {
      const el = document.querySelector('[data-address-summary]')
      expect(el).toHaveTextContent('992,908')
      return el as HTMLElement
    })
    expect(within(summary).getByText('189')).toBeInTheDocument()
    expect(summary).toHaveTextContent('Total received')
    expect(summary).toHaveTextContent('Total sent')
  })

  it('lists the history with direction and net value, and pages by cursor @HY-08', async () => {
    const user = userEvent.setup()
    renderAt(`/address/${ADDRESS}`)
    const table = await screen.findByRole('table', { name: /Transactions of this address/ })
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(20))
    expect(within(table).getAllByText('Received').length).toBeGreaterThan(0)
    const before = within(table).getAllByRole('row').length
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(before))
    expect(within(table).getAllByText('Sent').length).toBeGreaterThan(0)
  })

  const historyPage = (index: number, pages: number, limit: number) => {
    const items = Array.from({ length: limit }, (_, i) => {
      const n = index * limit + i
      return {
        txHash: n.toString(16).padStart(64, '0'),
        blockHeight: 2_000_000 - n,
        blockPos: 1,
        blockTime: 1_700_000_000_000 - n * 150_000,
        txType: 'normal',
        valueOut: 1_000n,
        netValue: 1_000n,
        direction: 'in' as const,
      }
    })
    return Promise.resolve({
      source: 'hyphen' as const,
      asOf: Date.now(),
      fetchedAt: Date.now(),
      proved: false,
      height: 2_000_100,
      data: {
        items,
        total: pages * limit,
        nextCursor: index + 1 < pages ? `cursor-${index + 1}` : undefined,
        asOfHeight: 2_000_100,
      },
    })
  }

  it('keeps paging through an address with more than 75 transactions @IN-06', async () => {
    const user = userEvent.setup()
    const asked: (string | undefined)[] = []
    addressTxsOverride = (q) => {
      asked.push(q.cursor)
      return historyPage(q.cursor ? Number(q.cursor.slice(7)) : 0, 4, q.limit ?? 25)
    }
    renderAt(`/address/${ADDRESS}`)
    const table = await screen.findByRole('table', { name: /Transactions of this address/ })
    for (const loaded of [25, 50, 75]) {
      await waitFor(() => expect(screen.getByText(`${loaded} loaded`)).toBeInTheDocument())
      await user.click(screen.getByRole('button', { name: 'Show more' }))
    }
    await waitFor(() => expect(screen.getByText('100 loaded')).toBeInTheDocument())
    expect(within(table).getAllByRole('row')).toHaveLength(101)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
    expect(asked).toEqual([undefined, 'cursor-1', 'cursor-2', 'cursor-3'])
  })

  it('says so and offers another try when the next transactions cannot be loaded @IN-06', async () => {
    const user = userEvent.setup()
    let fail = true
    addressTxsOverride = (q) => {
      if (q.cursor && fail) return Promise.reject(new Error('bad query'))
      return historyPage(q.cursor ? 1 : 0, 2, 25)
    }
    renderAt(`/address/${ADDRESS}`)
    await screen.findByRole('table', { name: /Transactions of this address/ })
    await waitFor(() => expect(screen.getByText('25 loaded')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The next transactions could not be loaded')
    expect(screen.getByText('25 loaded')).toBeInTheDocument()
    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('50 loaded')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('draws a QR code of the address @IN-06', async () => {
    renderAt(`/address/${ADDRESS}`)
    const img = await screen.findByRole('img', {
      name: new RegExp(`QR code of the address ${ADDRESS}`),
    })
    expect(img).toHaveAttribute('src', expect.stringMatching(/^blob:/))
  })

  it('says where the data comes from @IN-06', async () => {
    renderAt(`/address/${ADDRESS}`)
    await screen.findByRole('table', { name: /Transactions of this address/ })
    await waitFor(() => expect(document.querySelector('[data-source="hyphen"]')).not.toBeNull())
  })

  it('refuses text that is not an address @IN-06', async () => {
    renderAt('/address/not-an-address')
    expect(await screen.findByText('That isn’t a Dash address.')).toBeInTheDocument()
  })

  it('offers the other network for an address that belongs to it @IN-16', async () => {
    renderAt(`/address/${TESTNET_ADDRESS}`)
    expect(await screen.findByText('This is a testnet address.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open it on testnet' })).toHaveAttribute(
      'href',
      expect.stringContaining('network=testnet'),
    )
  })

  it('shows an address with no activity as empty, not as an error @IN-06', async () => {
    renderAt('/address/XbKzysY6LYGbsGwNG8B7K1BRoA1ffLodAT')
    expect(
      await screen.findByText('No transactions seen for this address on this network.', undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument()
    expect(document.querySelector('[data-address-summary]')).toHaveTextContent('Not seen yet')
    expect(screen.queryByText('Something went wrong')).toBeNull()
  })

  it('works on testnet @IN-16 @HY-19', async () => {
    renderAt(`/address/${TESTNET_ADDRESS}?network=testnet`)
    const summary = await waitFor(() => {
      const el = document.querySelector('[data-address-summary]')
      expect(el).toHaveTextContent('999,999')
      return el as HTMLElement
    })
    expect(summary).toHaveTextContent('tDASH')
  })
})
