import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, createAppRouter, createQueryClient } from '@/app'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { coreQueries } from '@/data/core/queries'
import type { BlockRow } from '@/data/core/types'
import { enableEarlyAnswers } from '@/data/early'
import { SourceError } from '@/data/errors'

const probe = vi.hoisted(() => ({ fit: true }))
vi.mock('@/data/hyphen/fit', () => ({ useHyphenFit: () => probe.fit }))

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const TIP = 2_570_085
const INDEXED = 'INDEXED-ROW'

function indexedPage(top: number) {
  const rows: BlockRow[] = Array.from({ length: 20 }, (_, i) => ({
    height: top - i,
    hash: (top - i).toString(16).padStart(64, '0'),
    time: Date.now() - i * 150_000,
    txCount: 1,
    size: 300,
    chainLocked: false,
    pool: INDEXED,
  }))
  const now = Date.now()
  return {
    source: 'hyphen' as const,
    asOf: now,
    fetchedAt: now,
    proved: false,
    fallback: 'dapi-cold' as const,
    data: rows,
  }
}

function deferred() {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  return { gate, release }
}

function mount(url: string) {
  const queryClient = createQueryClient()
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [url] }))
  render(<App started={{ queryClient, router }} />)
  return queryClient
}

const table = () => screen.getByRole('table', { name: 'Core blocks' })

describe('Blocks list, indexed first', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    enableEarlyAnswers(false)
    probe.fit = true
  })

  it("shows Hyphen's latest page without paging until DAPI's rows land, and never again after a new block", async () => {
    enableEarlyAnswers()
    const dapi = deferred()
    let bump = 0
    const tip = core.tip.bind(core)
    vi.spyOn(core, 'tip').mockImplementation(async (net, signal) => {
      const r = await tip(net, signal)
      return bump ? { ...r, data: { ...r.data, height: r.data.height + bump } } : r
    })
    const rows = core.blockRows.bind(core)
    const asked: number[] = []
    vi.spyOn(core, 'blockRows').mockImplementation(async (net, q, signal) => {
      asked.push(q.fromHeight)
      // The read for the new block's page never lands, so DAPI's previous rows stay up as the placeholder.
      if (q.fromHeight > TIP) return new Promise(() => undefined)
      await dapi.gate
      return rows(net, q, signal)
    })
    const indexed = vi
      .spyOn(core, 'indexedLatestRows')
      .mockImplementation(() => Promise.resolve(indexedPage(TIP + 1)))

    const client = mount('/blocks')
    await screen.findAllByText(INDEXED)
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull()

    dapi.release()
    await waitFor(() => expect(screen.queryAllByText(INDEXED)).toHaveLength(0))
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
    expect(within(table()).getByRole('link', { name: /2,570,085/ })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    const indexedCalls = indexed.mock.calls.length

    bump = 1
    await client.invalidateQueries({ queryKey: coreQueries.tip('mainnet').queryKey })
    await waitFor(() => expect(asked).toContain(TIP + 1))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryAllByText(INDEXED)).toHaveLength(0)
    expect(within(table()).getByRole('link', { name: /2,570,085/ })).toBeInTheDocument()
    expect(indexed.mock.calls.length).toBe(indexedCalls)
  })

  it("keeps Hyphen's page off the screen while the probe has not found its index current", async () => {
    enableEarlyAnswers()
    probe.fit = false
    const dapi = deferred()
    const rows = core.blockRows.bind(core)
    vi.spyOn(core, 'blockRows').mockImplementation(async (net, q, signal) => {
      await dapi.gate
      return rows(net, q, signal)
    })
    vi.spyOn(core, 'indexedLatestRows').mockImplementation(() => Promise.resolve(indexedPage(TIP)))
    mount('/blocks')
    await screen.findByRole('table', { name: 'Core blocks' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryAllByText(INDEXED)).toHaveLength(0)
    dapi.release()
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
    expect(screen.queryAllByText(INDEXED)).toHaveLength(0)
  })
})

describe('Blocks list, a page named by its height', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads its first rows before the tip lands, and pages once it has', async () => {
    const tipGate = deferred()
    const tip = core.tip.bind(core)
    vi.spyOn(core, 'tip').mockImplementation(async (net, signal) => {
      await tipGate.gate
      return tip(net, signal)
    })
    const rows = core.blockRows.bind(core)
    const asked: { fromHeight: number; count: number }[] = []
    vi.spyOn(core, 'blockRows').mockImplementation((net, q, signal) => {
      asked.push({ fromHeight: q.fromHeight, count: q.count })
      return rows(net, q, signal)
    })
    const from = TIP
    mount(`/blocks?from=${from}`)
    await waitFor(() =>
      expect(within(table()).getByRole('link', { name: /2,570,085/ })).toBeInTheDocument(),
    )
    expect(asked).toEqual([{ fromHeight: from, count: 4 }])
    const pager = () => screen.getByRole('navigation', { name: 'Pagination' })
    expect(within(pager()).queryByRole('link', { name: 'Older' })).toBeNull()

    tipGate.release()
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
    expect(within(pager()).getByRole('link', { name: 'Older' })).toBeInTheDocument()
    expect(asked.filter((q) => q.fromHeight === from)).toHaveLength(1)
  })

  it('shows no error while a height above the tip is read before the tip lands', async () => {
    const tipGate = deferred()
    const tip = core.tip.bind(core)
    vi.spyOn(core, 'tip').mockImplementation(async (net, signal) => {
      await tipGate.gate
      return tip(net, signal)
    })
    vi.spyOn(core, 'blockRows').mockImplementation(() =>
      Promise.reject(
        new SourceError({ source: 'dapi', kind: 'invalid-response', message: 'No block there' }),
      ),
    )
    mount(`/blocks?from=${TIP + 50}`)
    await screen.findByRole('table', { name: 'Core blocks' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull()
    expect(screen.getByRole('table', { name: 'Core blocks' })).toBeInTheDocument()
  })
})
