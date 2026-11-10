import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { budget } from '@/data/dapi-core/budget'
import type { CoreClient, DecodedBlock, DecodedTx } from '@/data/core/types'
import { setCoreClient } from '../index'

const NOW = 1_794_000_000_000
const stamp = { source: 'dapi' as const, asOf: NOW, fetchedAt: NOW, proved: false }
const HASH = 'ab'.repeat(32)
const TXID = 'cd'.repeat(32)

const block: DecodedBlock = {
  hash: HASH,
  height: 2_570_010,
  version: 1,
  prevHash: '00'.repeat(32),
  merkleRoot: '11'.repeat(32),
  time: NOW,
  bits: '1a2b3c4d',
  nonce: 1,
  size: 12_345,
  txs: [{} as DecodedTx, {} as DecodedTx, {} as DecodedTx],
  chainLocked: true,
}

const tx: DecodedTx = {
  txid: TXID,
  type: 'transfer',
  version: 3,
  lockTime: 0,
  size: 200,
  inputs: [{ txid: '00'.repeat(32), vout: 0, scriptSig: '', sequence: 0 }],
  outputs: [
    { value: 150_000_000n, scriptPubKey: '' },
    { value: 50_000_000n, scriptPubKey: '' },
  ],
  height: 2_570_000,
  confirmations: 11,
  isInstantLocked: true,
  isChainLocked: false,
}

function core(overrides: Partial<CoreClient> = {}): CoreClient {
  const never = () => Promise.reject(new Error('unused'))
  return {
    tip: never,
    chainLock: never,
    status: never,
    block: () => Promise.resolve({ ...stamp, data: block }),
    tx: () => Promise.resolve({ ...stamp, data: tx }),
    prevouts: never,
    headers: never,
    blockRows: never,
    heightAtTime: never,
    nodeSelfStatus: never,
    masternodeList: never,
    ...overrides,
  }
}

const open = {
  pressure: 'ok' as const,
  headroom: 300,
  capacity: 400,
  benched: 0,
  usedLastMinute: 10,
}

beforeEach(() => {
  vi.spyOn(budget, 'snapshot').mockReturnValue(open)
  vi.spyOn(budget, 'canAfford').mockReturnValue(true)
})

afterEach(() => {
  setCoreClient(undefined)
  vi.restoreAllMocks()
})

describe('hover cards for Core kinds', () => {
  it('registers a card of its own for block, tx and address', async () => {
    const { getHoverCard } = await import('@/ui/hover-cards')
    const { registerEntityHoverCards } = await import('../register')
    registerEntityHoverCards()
    for (const kind of ['block', 'tx', 'address'] as const) {
      expect(getHoverCard(kind)?.name, kind).toBe('LazyCard')
    }
  })

  it('loads the card code when one opens', async () => {
    setCoreClient(core())
    const { getHoverCard } = await import('@/ui/hover-cards')
    const { registerEntityHoverCards } = await import('../register')
    registerEntityHoverCards()
    const Card = getHoverCard('block')!
    const Harness = await harness(<Card id={HASH} />)
    render(<Harness />)
    expect(await screen.findByText('Block 2,570,010', {}, { timeout: 5000 })).toBeInTheDocument()
  })
})

describe('BlockHoverCard', () => {
  it('shows height, time, transaction count, size and ChainLock state @X-06', async () => {
    setCoreClient(core())
    const { BlockHoverCard } = await import('./block')
    const Harness = await harness(<BlockHoverCard id={HASH} />)
    render(<Harness />)
    const card = await screen.findByText('Block 2,570,010', {}, { timeout: 5000 })
    const root = card.closest<HTMLElement>('[data-hover-card="block"]')!
    expect(within(root).getByText('3')).toBeInTheDocument()
    expect(within(root).getByText('12.3 kB')).toBeInTheDocument()
    expect(within(root).getByText('ChainLocked')).toBeInTheDocument()
    expect(root.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('asks by height when the id is a number', async () => {
    const blockFn = vi.fn(() => Promise.resolve({ ...stamp, data: block }))
    setCoreClient(core({ block: blockFn }))
    const { BlockHoverCard } = await import('./block')
    const Harness = await harness(<BlockHoverCard id="2570010" />)
    render(<Harness />)
    await screen.findByText('Block 2,570,010', {}, { timeout: 5000 })
    expect(blockFn).toHaveBeenCalledWith('mainnet', { height: 2570010 }, expect.anything())
  })

  it('does not read DAPI while the budget is not ok', async () => {
    vi.spyOn(budget, 'snapshot').mockReturnValue({ ...open, pressure: 'tight' })
    const blockFn = vi.fn(() => Promise.resolve({ ...stamp, data: block }))
    setCoreClient(core({ block: blockFn }))
    const { BlockHoverCard } = await import('./block')
    const Harness = await harness(<BlockHoverCard id={HASH} />)
    render(<Harness />)
    expect(await screen.findByText(/DAPI is busy/)).toBeInTheDocument()
    expect(blockFn).not.toHaveBeenCalled()
  })

  it('says when there is no such block', async () => {
    setCoreClient(core({ block: () => Promise.resolve({ ...stamp, data: null }) }))
    const { BlockHoverCard } = await import('./block')
    const Harness = await harness(<BlockHoverCard id={HASH} />)
    render(<Harness />)
    expect(await screen.findByText(/No block with this ID/)).toBeInTheDocument()
  })
})

describe('TxHoverCard', () => {
  it('shows type, finality, amount moved and the shape of the transaction @X-06', async () => {
    setCoreClient(core())
    const { TxHoverCard } = await import('./tx')
    const Harness = await harness(<TxHoverCard id={TXID} />)
    render(<Harness />)
    const root = (
      await screen.findByText(/In block 2,570,000/, {}, { timeout: 5000 })
    ).closest<HTMLElement>('[data-hover-card="tx"]')!
    expect(within(root).getByText('InstantSend')).toBeInTheDocument()
    expect(root.querySelector('[data-amount="200000000"]')).toHaveTextContent('2')
    expect(within(root).getByText('1 → 2')).toBeInTheDocument()
  })

  it('shows a transaction without a block as in the mempool', async () => {
    setCoreClient(
      core({
        tx: () =>
          Promise.resolve({
            ...stamp,
            data: { ...tx, height: undefined, confirmations: 0, isInstantLocked: false },
          }),
      }),
    )
    const { TxHoverCard } = await import('./tx')
    const Harness = await harness(<TxHoverCard id={TXID} />)
    render(<Harness />)
    expect(await screen.findByText('In the mempool', {}, { timeout: 5000 })).toBeInTheDocument()
  })
})

describe('AddressHoverCard', () => {
  it('reads the address from Hyphen @X-06', async () => {
    const { AddressHoverCard } = await import('./address')
    const Harness = await harness(<AddressHoverCard id="XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14" />)
    render(<Harness />)
    const root = (await screen.findByText('Balance', {}, { timeout: 5000 })).closest<HTMLElement>(
      '[data-hover-card="address"]',
    )!
    expect(root.querySelector('[data-source="hyphen"]')).not.toBeNull()
    await waitFor(() => expect(within(root).getByText('Transactions')).toBeInTheDocument())
  })
})

/** Renders the card inside the app's providers by mounting it as the page at a throwaway route. */
async function harness(card: React.ReactNode) {
  const { RouterProvider, createRootRoute, createRoute, createRouter } =
    await import('@tanstack/react-router')
  const { QueryClientProvider } = await import('@tanstack/react-query')
  const { I18nProvider, i18n } = await import('@/i18n')
  const { createQueryClient } = await import('@/app')
  const root = createRootRoute()
  const page = createRoute({ getParentRoute: () => root, path: '/', component: () => card })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const client = createQueryClient()
  return function Harness() {
    return (
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nProvider>
    )
  }
}
