import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { resetHealthRegistry } from '@/data/health'
import { server } from '@/test/server'
import { renderAt } from '../hy-shared/test-utils'
import { FIRST_CHUNK } from './blocks-range'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

describe('Blocks list', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists the newest blocks with a link to older ones @HY-04', async () => {
    renderAt('/blocks')
    const table = await screen.findByRole('table', { name: 'Core blocks' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(21))
    expect(within(table).getByRole('link', { name: /2,570,085/ })).toBeInTheDocument()
    const pager = screen.getByRole('navigation', { name: 'Pagination' })
    expect(within(pager).getByRole('link', { name: 'Older' })).toHaveAttribute(
      'href',
      expect.stringContaining('from=2570065'),
    )
    expect(within(pager).queryByRole('link', { name: 'Newer' })).toBeNull()
  })

  it('carries a short unit on each count for the phone card, which has no column header @HY-04', async () => {
    renderAt('/blocks')
    const table = await screen.findByRole('table', { name: 'Core blocks' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(21))
    const cells = table.querySelectorAll('tbody td[data-u]')
    expect(cells).toHaveLength(20)
    for (const cell of cells) expect(cell).toHaveAttribute('data-u', 'tx')
  })

  it('shows a UTC day and the days either side @IN-02', async () => {
    renderAt('/blocks?date=2026-11-03')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Blocks on 3 Nov 2026/ }),
    ).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(21))
    expect(within(table).getByRole('link', { name: /2,566,380/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
      'href',
      expect.stringContaining('date=2026-11-02'),
    )
    expect(screen.getByRole('link', { name: 'Next day' })).toHaveAttribute(
      'href',
      expect.stringContaining('date=2026-11-04'),
    )
  })

  it('works on testnet @IN-16 @HY-19', async () => {
    renderAt('/blocks?network=testnet')
    const table = await screen.findByRole('table', { name: 'Core blocks' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(21))
    expect(within(table).getByRole('link', { name: /1,589,232/ })).toBeInTheDocument()
  })

  it('marks a row whose ChainLock one node reported without calling it locked @IN-02', async () => {
    const original = core.blockRows.bind(core)
    vi.spyOn(core, 'blockRows').mockImplementation(async (net, q, signal) => {
      const rows = await original(net, q, signal)
      return {
        ...rows,
        data: rows.data.map((r, i) =>
          i === 0 ? { ...r, chainLocked: false, chainLockClaim: 'one-node' as const } : r,
        ),
      }
    })
    renderAt('/blocks')
    const table = await screen.findByRole('table', { name: 'Core blocks' })
    expect(await within(table).findByText('ChainLock reported by one node')).toBeInTheDocument()
    expect(within(table).getAllByText('ChainLock reported by one node')).toHaveLength(1)
  })

  it('keeps blocks stamped across midnight on their day instead of dropping them @IN-02', async () => {
    const original = core.blockRows.bind(core)
    vi.spyOn(core, 'blockRows').mockImplementation(async (net, q, signal) => {
      const rows = await original(net, q, signal)
      return {
        ...rows,
        data: rows.data.map((r, i) => (i === 0 ? { ...r, time: Date.UTC(2026, 10, 4, 1) } : r)),
      }
    })
    renderAt('/blocks?date=2026-11-03')
    const table = await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(21))
  })

  it('shows the first rows of a day while the rest of the page is still being read @IN-02', async () => {
    const original = core.blockRows.bind(core)
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const counts: number[] = []
    vi.spyOn(core, 'blockRows').mockImplementation(async (net, q, signal) => {
      counts.push(q.count)
      if (q.count === 20 - FIRST_CHUNK) await held
      return original(net, q, signal)
    })
    renderAt('/blocks?date=2026-11-03')
    const table = await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(FIRST_CHUNK + 1))
    expect(within(table).getByRole('link', { name: /2,566,380/ })).toBeInTheDocument()
    expect(table.querySelectorAll('[data-pending-row]')).toHaveLength(20 - FIRST_CHUNK)
    release()
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(21))
    expect(table.querySelectorAll('[data-pending-row]')).toHaveLength(0)
    expect(counts).toEqual([FIRST_CHUNK, 20 - FIRST_CHUNK])
  })

  it('says a day in the future has no blocks yet @IN-02', async () => {
    renderAt('/blocks?date=2999-01-01')
    expect(await screen.findByText('No blocks on this date')).toBeInTheDocument()
  })

  describe('page size @IN-02', () => {
    afterEach(() => {
      resetHealthRegistry()
    })
    const hashOf = (h: number) => h.toString(16).padStart(64, '0')
    const rowsFor = (top: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        height: top - i,
        hash: hashOf(top - i),
        time: Date.UTC(2026, 10, 3, 12) - i * 1000,
        txCount: 2,
        size: 500,
        chainLocked: true,
      }))
    const stamp = (source: 'hyphen' | 'dapi') => ({
      source,
      asOf: Date.now(),
      fetchedAt: Date.now(),
      proved: false,
    })

    it('offers 20, 50 and 100 with 20 chosen, and keeps the date in the links @IN-02', async () => {
      renderAt('/blocks?date=2026-11-03')
      const table = await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
      await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(21))
      const group = screen.getByRole('group', { name: 'Blocks per page' })
      expect(within(group).getByRole('button', { name: '20' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      for (const n of ['50', '100']) {
        expect(within(group).getByRole('button', { name: n })).toBeEnabled()
      }
      expect(screen.getByText('20 blocks a page, newest first.')).toBeInTheDocument()
    })

    it('reads a page of 50 from Hyphen in one request, not one DAPI block each, and pages on with its size @IN-02', async () => {
      const calls: { count: number; via?: string }[] = []
      vi.spyOn(core, 'blockRows').mockImplementation((_net, q) => {
        calls.push({ count: q.count, via: q.via })
        return Promise.resolve({ ...stamp('hyphen'), data: rowsFor(q.fromHeight, q.count) })
      })
      renderAt('/blocks?date=2026-11-03&size=50')
      const table = await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
      await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(51))
      expect(calls).toEqual([{ count: 50, via: 'index' }])
      expect(screen.getByText('50 blocks a page, newest first.')).toBeInTheDocument()
      const pager = screen.getByRole('navigation', { name: 'Pagination' })
      const older = within(pager).getByRole('link', { name: 'Older' }).getAttribute('href')!
      expect(older).toContain('date=2026-11-03')
      expect(older).toContain('size=50')
      expect(older).toContain('from=')
    })

    it('goes to another size from the control and keeps the date @IN-02', async () => {
      vi.spyOn(core, 'blockRows').mockImplementation((_net, q) =>
        Promise.resolve({
          ...stamp('hyphen'),
          data: rowsFor(q.fromHeight, q.count),
        }),
      )
      const user = userEvent.setup()
      renderAt('/blocks?date=2026-11-03')
      const group = await screen.findByRole('group', { name: 'Blocks per page' })
      const hundred = within(group).getByRole('button', { name: '100' })
      await waitFor(() => expect(hundred).toBeEnabled())
      await user.click(hundred)
      const table = await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
      await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(101))
      expect(
        within(screen.getByRole('group', { name: 'Blocks per page' })).getByRole('button', {
          name: '100',
        }),
      ).toHaveAttribute('aria-pressed', 'true')
    })

    it('reads a page of 100 from Insight in one list request while Hyphen is stale @IN-02 @IN-16', async () => {
      const reads: string[] = []
      server.use(
        http.get('https://insight.testnet.networks.dash.org/insight-api/blocks', ({ request }) => {
          reads.push(request.url)
          const top = 1_589_232
          return HttpResponse.json({
            blocks: Array.from({ length: 100 }, (_, i) => ({
              height: top - i,
              hash: hashOf(top - i),
              time: 1_794_000_000 - i * 150,
              size: 400,
              txlength: 1,
            })),
            pagination: { more: true, moreTs: 1_793_985_000 },
          })
        }),
      )
      const headers = vi.spyOn(core, 'headers').mockImplementation((_net, from) =>
        Promise.resolve({
          ...stamp('dapi'),
          data: [{ height: from, hash: hashOf(from), time: 1_794_000_000_000 }],
        }),
      )
      const rows = vi.spyOn(core, 'blockRows')
      renderAt('/blocks?network=testnet&size=100')
      const table = await waitFor(() => {
        const found = screen.getByRole('table', { name: 'Core blocks' })
        expect(within(found).getAllByRole('row')).toHaveLength(101)
        return found
      })
      expect(reads).toHaveLength(1)
      const url = new URL(reads[0]!)
      expect(url.searchParams.get('limit')).toBe('100')
      expect(url.searchParams.get('blockDate')).toBe('2026-11-06')
      expect(url.searchParams.get('startTimestamp')).toBe('1794000000')
      expect(headers).toHaveBeenCalledTimes(1)
      expect(rows).not.toHaveBeenCalled()
      expect(within(table).getByRole('link', { name: /1,589,232/ })).toBeInTheDocument()
      expect(document.querySelector('[data-source="insight"]')).not.toBeNull()
      const pager = screen.getByRole('navigation', { name: 'Pagination' })
      const older = within(pager).getByRole('link', { name: 'Older' }).getAttribute('href')!
      expect(older).toContain('size=100')
      expect(older).toContain('from=1589132')
    })
  })
})
