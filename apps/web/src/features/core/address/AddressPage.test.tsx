import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveTxEvent } from '@/data/core/live'
import type { DecodedTx } from '@/data/core/types'
import { formatIsoUtc } from '@/lib/format'
import { server } from '@/test/server'
import { renderAt } from '../hy-shared/test-utils'

configure({ asyncUtilTimeout: 5000 })

const feed = vi.hoisted(() => ({
  listeners: new Set<(e: unknown) => void>(),
  status: { state: 'live', fallbackHint: false },
}))

vi.mock('@/data/query/stale', async (original) => {
  const actual = await original<{ POLL_MS: Record<string, number> }>()
  return { ...actual, POLL_MS: { ...actual.POLL_MS, addressFallback: 50 } }
})

type PagedCall = (
  q: { limit?: number; cursor?: string },
  real: () => Promise<unknown>,
) => Promise<unknown>
let addressTxsOverride: PagedCall | undefined

vi.mock('@/data/hyphen/client', async (original) => {
  const actual = await original<{
    hyphen: {
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
        addressTxsOverride
          ? addressTxsOverride(q, () => actual.hyphen.addressTxs(net, a, q, signal))
          : actual.hyphen.addressTxs(net, a, q, signal),
    },
  }
})

vi.mock('@/data/core/live', () => ({
  coreLive: {
    transactions(_net: string, listener: (e: unknown) => void) {
      feed.listeners.add(listener)
      return () => feed.listeners.delete(listener)
    },
    txStatus: () => feed.status,
    status: () => ({ state: 'idle', since: 0 }),
    subscribe: () => () => undefined,
  },
}))

const emit = (e: LiveTxEvent) => {
  for (const l of [...feed.listeners]) l(e)
}

vi.mock('./qr-image', () => ({
  qrPng: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
}))

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const TESTNET_ADDRESS = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'

afterEach(() => {
  addressTxsOverride = undefined
  feed.status = { state: 'live', fallbackHint: false }
  vi.restoreAllMocks()
})

describe('Address page', () => {
  it('keeps the QR code in its own card on a wide screen @IN-06', async () => {
    renderAt(`/address/${ADDRESS}`)
    expect(await screen.findByRole('heading', { name: 'QR code' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show QR code' })).toBeNull()
  })

  describe('on a phone', () => {
    const phone = () =>
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
    afterEach(() => vi.unstubAllGlobals())

    it('groups the figures in one block and shows the QR code only on request @IN-06 @HY-08', async () => {
      phone()
      const user = userEvent.setup()
      renderAt(`/address/${ADDRESS}`)
      const summary = await waitFor(() => {
        const el = document.querySelector<HTMLElement>('[data-address-summary]')
        expect(el).toHaveTextContent('Total received')
        return el!
      })
      for (const label of [
        'Balance',
        'Unconfirmed',
        'Transactions',
        'Total received',
        'Total sent',
      ]) {
        expect(within(summary).getByText(label)).toBeInTheDocument()
      }
      expect(screen.queryByRole('heading', { name: 'QR code' })).toBeNull()
      expect(screen.queryByRole('img', { name: /QR code of the address/ })).toBeNull()
      expect(screen.getByText(/Watching for new transactions/)).toBeVisible()
      const toggle = screen.getByRole('button', { name: 'Show QR code' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await user.click(toggle)
      expect(await screen.findByRole('img', { name: /QR code of the address/ })).toBeVisible()
      expect(screen.getByRole('button', { name: 'Hide QR code' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      await user.click(screen.getByRole('button', { name: 'Hide QR code' }))
      expect(screen.queryByRole('img', { name: /QR code of the address/ })).toBeNull()
    })
  })

  it('tells the viewer when a new transaction arrives for the address @IN-06', async () => {
    const id = 'ab'.repeat(32)
    const tx: DecodedTx = {
      txid: id,
      type: 'transfer',
      version: 3,
      lockTime: 0,
      size: 226,
      inputs: [{ txid: 'cd'.repeat(32), vout: 0, scriptSig: '', sequence: 0 }],
      outputs: [{ value: 250_000_000n, scriptPubKey: '', address: ADDRESS }],
    }
    renderAt(`/address/${ADDRESS}`)
    await screen.findByText(/Watching for new transactions/)
    expect(document.querySelector('[data-new-transaction]')).toBeNull()
    emit({ kind: 'tx', tx })
    const notice = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>('[data-new-transaction]')
        expect(el).not.toBeNull()
        return el!
      },
      { timeout: 4000 },
    )
    expect(notice).toHaveTextContent('Unconfirmed transaction')
    expect(notice).toHaveTextContent('2.5')
    expect(await screen.findByText(/1 transaction seen since you opened this page/)).toBeVisible()
    expect(document.querySelector('[data-pending]')).toHaveTextContent('Unconfirmed')
  })

  it('follows the address history when DAPI has given up, and says what arrived @IN-06', async () => {
    feed.status = { state: 'reconnecting', fallbackHint: true }
    const id = 'ef'.repeat(32)
    let looks = 0
    const row = (txHash: string, netValue: bigint) => ({
      txHash,
      blockHeight: 2_000_001,
      blockTime: 1_700_000_000_000,
      txType: 'normal',
      valueOut: netValue,
      netValue,
      direction: 'in' as const,
    })
    addressTxsOverride = (q, real) => {
      if (q.limit !== 10) return real()
      looks++
      const items =
        looks > 1 ? [row(id, 7_000n), row('aa'.repeat(32), 1n)] : [row('aa'.repeat(32), 1n)]
      return Promise.resolve({
        source: 'hyphen' as const,
        asOf: Date.now(),
        fetchedAt: Date.now(),
        proved: false,
        data: { items, total: items.length },
      })
    }
    renderAt(`/address/${ADDRESS}`)
    const notice = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>('[data-new-transaction]')
        expect(el).not.toBeNull()
        return el!
      },
      { timeout: 4000 },
    )
    expect(notice).toHaveTextContent('New transaction')
    expect(within(notice).queryByRole('link', { name: 'See unconfirmed activity' })).toBeNull()
    expect(await screen.findByText(/1 transaction seen since you opened this page/)).toBeVisible()
    expect(document.querySelector('[data-pending]')).toBeNull()
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

  it('reads a testnet address from Insight while Hyphen’s index is stale, and says so @IN-16 @HY-19', async () => {
    renderAt(`/address/${TESTNET_ADDRESS}?network=testnet`)
    await waitFor(() => {
      const el = document.querySelector('[data-address-summary]')
      expect(el).toHaveTextContent('999,999')
    })
    await waitFor(() => expect(screen.getAllByText('Indexed by Insight').length).toBeGreaterThan(1))
    expect(screen.queryByText(/Indexed by Hyphen/)).toBeNull()
    const history = document.querySelector<HTMLElement>('#history')!
    await waitFor(() => expect(within(history).getAllByRole('row').length).toBeGreaterThan(1))
    expect(within(history).getByText('Indexed by Insight')).toBeInTheDocument()
    expect(document.querySelector('[data-stale-index]')).toBeNull()
    expect(screen.queryByText('Not seen yet')).toBeNull()
  })
})

const INSIGHT_TESTNET = 'https://insight.testnet.networks.dash.org/insight-api'
const OTHER_TESTNET = 'ycUsXFtJGbJRVDH57gcMnQQP8kByuNp2fb'
const OTHER_MAINNET = 'XsPYocbGL8ubicsjgfav5E8ubFPMHSNzUU'
/** Recorded UTXOs: Hyphen's first mainnet one (1 DASH) and Insight's only testnet one. */
const MAINNET_UTXO = { txid: 'ebe7c581', vout: 0, value: 100_000_000n }
const TESTNET_UTXO = {
  txid: 'edb04a34191b7066b3db7bc5216cf345873d050f044820b425b81c0ce7ea5fae',
  vout: 1,
  value: 99_999_899_997_288n,
}

const idOf = (n: number) => n.toString(16).padStart(64, '0')

function insTx(
  n: number,
  over: Record<string, unknown> = {},
  paysAddress = TESTNET_ADDRESS,
  value = '1.00000000',
) {
  return {
    txid: idOf(n),
    version: 1,
    vin: [{ n: 0, txid: idOf(900 + n), vout: 0, addr: OTHER_TESTNET, valueSat: 200_000_000 }],
    vout: [
      { n: 0, value, scriptPubKey: { hex: '76a9', addresses: [paysAddress] }, spentTxId: null },
    ],
    blockheight: 1_590_000 - n,
    confirmations: 10 + n,
    time: 1_760_000_000 - n * 100,
    blocktime: 1_760_000_000 - n * 100,
    ...over,
  }
}

const mempoolTx = (n: number) =>
  insTx(n, { blockheight: null, confirmations: 0, blocktime: null, time: 1_760_000_100 })

function serveInsightTxs(pages: Record<string, unknown>[][], seen?: string[]) {
  server.use(
    http.get(`${INSIGHT_TESTNET}/txs`, ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('pageNum') ?? 0)
      seen?.push(request.url)
      return HttpResponse.json({ pagesTotal: pages.length, txs: pages[page] ?? [] })
    }),
  )
}

describe('Address page watching a spend of its own coins @IN-06 @IN-16', () => {
  const spend = (
    spent: { txid: string; vout: number },
    outputs: { value: bigint; address: string }[],
  ): DecodedTx => ({
    txid: 'ab'.repeat(32),
    type: 'transfer',
    version: 3,
    lockTime: 0,
    size: 226,
    inputs: [{ ...spent, scriptSig: '', sequence: 0 }],
    outputs: outputs.map((o) => ({ ...o, scriptPubKey: '' })),
  })

  async function watchSpend(url: string, tx: DecodedTx) {
    renderAt(url)
    await screen.findByText(/Watching for new transactions/)
    const utxos = await screen.findByRole('table', { name: /Unspent outputs of this address/ })
    await waitFor(() => expect(within(utxos).getAllByRole('row').length).toBeGreaterThan(1))
    emit({ kind: 'tx', tx })
    return waitFor(
      () => {
        const el = document.querySelector<HTMLElement>('[data-pending]')
        expect(el).not.toBeNull()
        return el!
      },
      { timeout: 4000 },
    )
  }

  const stat = (label: string) =>
    within(document.querySelector<HTMLElement>('[data-address-summary]')!)
      .getByText(label)
      .closest('.rx-stat')!

  describe.each([
    {
      name: 'a stale network, read from Insight',
      url: `/address/${TESTNET_ADDRESS}?network=testnet`,
      address: TESTNET_ADDRESS,
      other: OTHER_TESTNET,
      utxo: { txid: TESTNET_UTXO.txid, vout: TESTNET_UTXO.vout },
      value: TESTNET_UTXO.value,
    },
    {
      name: 'a fresh network, read from Hyphen',
      url: `/address/${ADDRESS}`,
      address: ADDRESS,
      other: OTHER_MAINNET,
      utxo: { txid: '', vout: MAINNET_UTXO.vout },
      value: MAINNET_UTXO.value,
    },
  ])('on $name', ({ url, address, other, utxo, value }) => {
    const outpoint = async () => {
      if (utxo.txid) return utxo
      const full = await import('@/test/fixtures/load').then((m) =>
        m.fixtureBody<{ value: { txHash: string; vout: number; value: bigint | string }[] }>(
          'hyphen',
          'mainnet',
          `address__${ADDRESS}__utxos--limit-25`,
        ),
      )
      return { txid: full.value[0]!.txHash, vout: full.value[0]!.vout }
    }

    it('counts a spend with change as a loss of what left, not a receipt of the change', async () => {
      const coin = await outpoint()
      const change = value / 2n
      const pending = await watchSpend(
        url,
        spend(coin, [
          { value: value / 4n, address: other },
          { value: change, address },
        ]),
      )
      const loss = value - change
      expect(pending).toHaveTextContent(/[-−]/)
      expect(pending.textContent).not.toMatch(/\+/)
      expect(stat('Unconfirmed')).toHaveTextContent(/[-−]/)
      expect(loss).toBeGreaterThan(0n)
    })

    it('shows a spend with no change at all, as a loss of the whole coin', async () => {
      const coin = await outpoint()
      const pending = await watchSpend(url, spend(coin, [{ value: value - 1000n, address: other }]))
      expect(pending).toHaveTextContent(/[-−]/)
      expect(stat('Unconfirmed')).toHaveTextContent(/[-−]/)
      expect(document.querySelector('[data-new-transaction]')).toHaveTextContent(
        'Unconfirmed transaction',
      )
    })
  })
})

describe('Address page reading Insight @IN-06 @IN-16', () => {
  const url = `/address/${TESTNET_ADDRESS}?network=testnet`

  it('shows an unconfirmed output as pending, with no block link, and says the balance leaves it out', async () => {
    server.use(
      http.get(`${INSIGHT_TESTNET}/addr/${TESTNET_ADDRESS}/utxo`, () =>
        HttpResponse.json([
          {
            address: TESTNET_ADDRESS,
            txid: idOf(1),
            vout: 0,
            scriptPubKey: '76a9',
            satoshis: 5_000_000,
            height: 1_590_000,
            confirmations: 12,
          },
          {
            address: TESTNET_ADDRESS,
            txid: idOf(2),
            vout: 1,
            scriptPubKey: '76a9',
            satoshis: 7_000_000,
            confirmations: 0,
          },
        ]),
      ),
    )
    renderAt(url)
    const table = await screen.findByRole('table', { name: /Unspent outputs of this address/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3))
    const pendingRow = within(table)
      .getAllByRole('row')
      .find((r) => r.textContent?.includes('Pending'))!
    expect(pendingRow).toBeDefined()
    expect(pendingRow.querySelector('a[href*="/block/"]')).toBeNull()
    expect(table.querySelector('a[href*="/block/0"]')).toBeNull()
    expect(document.querySelector('[data-utxo-pending]')).toHaveTextContent(
      'balance above does not count them',
    )
  })

  it('reads the whole UTXO list once and pages through it in the browser, without refetching on focus', async () => {
    const reads: string[] = []
    server.use(
      http.get(`${INSIGHT_TESTNET}/addr/${TESTNET_ADDRESS}/utxo`, ({ request }) => {
        reads.push(request.url)
        return HttpResponse.json(
          Array.from({ length: 60 }, (_, i) => ({
            address: TESTNET_ADDRESS,
            txid: idOf(i + 1),
            vout: 0,
            scriptPubKey: '76a9',
            satoshis: 1_000 + i,
            height: 1_500_000 + i,
            confirmations: 100,
          })),
        )
      }),
    )
    const user = userEvent.setup()
    renderAt(url)
    const table = await screen.findByRole('table', { name: /Unspent outputs of this address/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
    await user.click(within(table.closest('#utxos')!).getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(51))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(reads).toHaveLength(1)
  })

  it('keeps unconfirmed transactions out of the paged history and puts them in the unconfirmed area', async () => {
    serveInsightTxs([[mempoolTx(1), insTx(2), insTx(3)], [insTx(4)]])
    renderAt(url)
    const history = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('#history')!
      expect(within(el).getAllByRole('row').length).toBeGreaterThan(1)
      return el
    })
    expect(within(history).getAllByRole('row')).toHaveLength(1 + 2)
    const pending = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-pending]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(pending.querySelectorAll('li')).toHaveLength(1)
    expect(pending.querySelector(`a[href*="${idOf(1)}"]`)).not.toBeNull()
    expect(history.querySelector(`a[href*="${idOf(1)}"]`)).toBeNull()
  })

  it('lists a transaction once when a new block shifts it onto the next page', async () => {
    serveInsightTxs([
      [insTx(2), insTx(3)],
      [insTx(3), insTx(4)],
    ])
    const user = userEvent.setup()
    renderAt(url)
    const history = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('#history')!
      expect(within(el).getAllByRole('row').length).toBeGreaterThan(1)
      return el
    })
    await user.click(within(history).getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(within(history).getAllByRole('row')).toHaveLength(1 + 3))
    expect(history.querySelectorAll(`a[href*="${idOf(3)}"]`)).toHaveLength(1)
  })

  describe('first and last seen from Insight @HY-08 @IN-16 @HY-19', () => {
    const iso = (n: number) => formatIsoUtc((1_760_000_000 - n * 100) * 1000)
    const seenTimes = async () => {
      const el = await waitFor(() => {
        const found = document.querySelector<HTMLElement>('[data-address-summary] [data-seen]')
        expect(found).not.toBeNull()
        return found!
      })
      return [...el.querySelectorAll('time')].map((t) => t.getAttribute('title'))
    }

    it('takes last seen from the newest confirmed transaction and first seen from one read of the last page', async () => {
      const seen: string[] = []
      serveInsightTxs(
        [[mempoolTx(1), insTx(2), insTx(3)], [insTx(4)], [insTx(9), insTx(8), insTx(7)]],
        seen,
      )
      renderAt(url)
      expect(await seenTimes()).toEqual([iso(9), iso(2)])
      const lastPage = seen.filter((u) => u.includes('pageNum=2'))
      expect(lastPage).toHaveLength(1)
      expect(document.querySelector('[data-address-summary]')).not.toHaveTextContent('Not seen yet')
      expect(document.querySelector('[data-seen]')).toHaveTextContent(/First:.*Last:/)
      emit({ kind: 'block', txids: [] })
      await new Promise((r) => setTimeout(r, 150))
      expect(seen.filter((u) => u.includes('pageNum=2'))).toHaveLength(1)
    })

    it('reads no extra page for an address whose history fits on one', async () => {
      const seen: string[] = []
      serveInsightTxs([[insTx(2), insTx(3), insTx(4)]], seen)
      renderAt(url)
      expect(await seenTimes()).toEqual([iso(4), iso(2)])
      expect(seen).toHaveLength(1)
    })

    it('reads past a first page of unconfirmed transactions for the newest confirmed one', async () => {
      serveInsightTxs([[mempoolTx(1)], [insTx(5), insTx(6)]])
      renderAt(url)
      expect(await seenTimes()).toEqual([iso(6), iso(5)])
    })

    it('says first seen is unavailable, and keeps last seen, when the last page cannot be read', async () => {
      server.use(
        http.get(`${INSIGHT_TESTNET}/txs`, ({ request }) => {
          const page = Number(new URL(request.url).searchParams.get('pageNum') ?? 0)
          return page === 0
            ? HttpResponse.json({ pagesTotal: 5000, txs: [insTx(2)] })
            : new HttpResponse(null, { status: 500 })
        }),
      )
      renderAt(url)
      const times = await seenTimes()
      expect(times).toEqual([iso(2)])
      const stat = document.querySelector<HTMLElement>('[data-address-summary] [data-seen]')!
      expect(stat).toHaveTextContent('First: not available')
      expect(stat.closest('.rx-stat')).toHaveTextContent(
        'Insight could not return this address’s oldest transactions.',
      )
    })
  })

  it('reads a first page that holds only unconfirmed transactions on to the history, never as empty', async () => {
    serveInsightTxs([
      [mempoolTx(1), mempoolTx(2)],
      [insTx(3), insTx(4)],
    ])
    renderAt(url)
    await waitFor(() => {
      expect(
        within(document.querySelector<HTMLElement>('#history')!).getAllByRole('row'),
      ).toHaveLength(1 + 2)
    })
    expect(screen.queryByText('No transactions seen for this address on this network.')).toBeNull()
  })

  it('refreshes the history and the unspent outputs when a block arrives, not on focus', async () => {
    const seen: string[] = []
    serveInsightTxs([[insTx(2)]], seen)
    renderAt(url)
    await waitFor(() => {
      expect(
        within(document.querySelector<HTMLElement>('#history')!).getAllByRole('row').length,
      ).toBeGreaterThan(1)
    })
    const before = seen.length
    serveInsightTxs([[insTx(5), insTx(2)]], seen)
    emit({ kind: 'block', txids: [] })
    await waitFor(() => expect(seen.length).toBeGreaterThan(before))
    await waitFor(() =>
      expect(
        within(document.querySelector<HTMLElement>('#history')!).getAllByRole('row'),
      ).toHaveLength(1 + 2),
    )
  })

  it('names both indexes when Insight trails the chain as well, and marks its source line', async () => {
    server.use(
      http.get(`${INSIGHT_TESTNET}/status`, () =>
        HttpResponse.json({ info: { blocks: 1_580_000, network: 'testnet' } }),
      ),
    )
    renderAt(url)
    const notice = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-stale-index]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(notice).toHaveTextContent('Hyphen’s Testnet index is behind the chain')
    expect(notice).toHaveTextContent('Insight’s Testnet index is behind too')
    expect(notice).toHaveTextContent('1,580,000')
    expect(notice).toHaveTextContent('as of those blocks')
    await waitFor(() =>
      expect(
        document.querySelector('#history [data-source="insight"]')?.getAttribute('data-state'),
      ).toBe('stale'),
    )
  })
})
