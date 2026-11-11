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

vi.mock('@/data/hyphen/client', async (original) => {
  const actual = await original<{
    hyphen: { tx(net: string, txid: string, signal?: AbortSignal): Promise<unknown> }
  }>()
  return {
    ...actual,
    hyphen: {
      ...actual.hyphen,
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
