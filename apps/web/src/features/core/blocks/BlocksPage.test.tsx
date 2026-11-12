import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { fixtureBody } from '@/test/fixtures/load'
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
    await screen.findByRole('table', { name: 'Core blocks' })
    const table = () => screen.getByRole('table', { name: 'Core blocks' })
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
    expect(within(table()).getByRole('link', { name: /2,570,085/ })).toBeInTheDocument()
    const pager = screen.getByRole('navigation', { name: 'Pagination' })
    expect(within(pager).getByRole('link', { name: 'Older' })).toHaveAttribute(
      'href',
      expect.stringContaining('from=2570065'),
    )
    expect(within(pager).queryByRole('link', { name: 'Newer' })).toBeNull()
  })

  it('carries a short unit on each count for the phone card, which has no column header @HY-04', async () => {
    renderAt('/blocks')
    await screen.findByRole('table', { name: 'Core blocks' })
    const table = () => screen.getByRole('table', { name: 'Core blocks' })
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
    const cells = table().querySelectorAll('tbody td[data-u]')
    expect(cells).toHaveLength(20)
    for (const cell of cells) expect(cell).toHaveAttribute('data-u', 'tx')
  })

  it('shows a UTC day and the days either side @IN-02', async () => {
    renderAt('/blocks?date=2026-11-03')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Blocks on 3 Nov 2026/ }),
    ).toBeInTheDocument()
    await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
    const table = () => screen.getByRole('table', { name: /Blocks on 3 Nov 2026/ })
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
    expect(within(table()).getByRole('link', { name: /2,566,380/ })).toBeInTheDocument()
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
    await screen.findByRole('table', { name: 'Core blocks' })
    const table = () => screen.getByRole('table', { name: 'Core blocks' })
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
    expect(within(table()).getByRole('link', { name: /1,589,232/ })).toBeInTheDocument()
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
    await screen.findByRole('table', { name: 'Core blocks' })
    const table = () => screen.getByRole('table', { name: 'Core blocks' })
    expect(await within(table()).findByText('ChainLock reported by one node')).toBeInTheDocument()
    expect(within(table()).getAllByText('ChainLock reported by one node')).toHaveLength(1)
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
    await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
    const table = () => screen.getByRole('table', { name: /Blocks on 3 Nov 2026/ })
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
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
    await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
    const table = () => screen.getByRole('table', { name: /Blocks on 3 Nov 2026/ })
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(FIRST_CHUNK + 1))
    expect(within(table()).getByRole('link', { name: /2,566,380/ })).toBeInTheDocument()
    expect(table().querySelectorAll('[data-pending-row]')).toHaveLength(20 - FIRST_CHUNK)
    release()
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
    expect(table().querySelectorAll('[data-pending-row]')).toHaveLength(0)
    expect(counts).toEqual([FIRST_CHUNK, 20 - FIRST_CHUNK])
  })

  it('says a day in the future has no blocks yet @IN-02', async () => {
    renderAt('/blocks?date=2999-01-01')
    expect(await screen.findByText('No blocks on this date')).toBeInTheDocument()
  })

  describe('page size @IN-02', () => {
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
      await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
      const table = () => screen.getByRole('table', { name: /Blocks on 3 Nov 2026/ })
      await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(21))
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
      await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
      const table = () => screen.getByRole('table', { name: /Blocks on 3 Nov 2026/ })
      await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(51))
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
      await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
      const table = () => screen.getByRole('table', { name: /Blocks on 3 Nov 2026/ })
      await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(101))
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

    it('shows a page that crosses UTC midnight whole, reading both days, and pages on from its last row @IN-02 @IN-16', async () => {
      const times: Record<number, number> = { 1586890: 1794011097_000, 1586878: 1794009534_000 }
      vi.spyOn(core, 'headers').mockImplementation((_net, from) =>
        Promise.resolve({
          ...stamp('dapi'),
          data: [{ height: from, hash: hashOf(from), time: times[from]! }],
        }),
      )
      const days: string[] = []
      server.use(
        http.get(
          'https://insight.testnet.networks.dash.org/insight-api/blocks',
          async ({ request }) => {
            const q = new URL(request.url).searchParams
            days.push(`${q.get('blockDate')}:${q.get('limit')}`)
            const slug = `blocks--blockDate-${q.get('blockDate')},limit-${q.get('limit')},startTimestamp-${q.get('startTimestamp')}`
            return HttpResponse.json(await fixtureBody('insight', 'testnet', slug))
          },
        ),
      )
      renderAt('/blocks?network=testnet&size=50&from=1586890')
      await screen.findByRole('table', { name: 'Core blocks' })
      await waitFor(() =>
        expect(
          within(screen.getByRole('table', { name: 'Core blocks' })).getAllByRole('row'),
        ).toHaveLength(51),
      )
      const table = screen.getByRole('table', { name: 'Core blocks' })
      const shown = [...table.querySelectorAll('tbody tr')].map((r) =>
        Number(/[\d,]{9}/.exec(r.textContent ?? '')?.[0].replaceAll(',', '')),
      )
      expect(shown).toEqual(Array.from({ length: 50 }, (_, i) => 1586890 - i))
      expect(days).toEqual(['2026-11-07:50', '2026-11-06:38'])
      expect(screen.getByText('Heights 1,586,841 to 1,586,890')).toBeInTheDocument()
      const pager = screen.getByRole('navigation', { name: 'Pagination' })
      expect(within(pager).getByRole('link', { name: 'Older' }).getAttribute('href')).toContain(
        'from=1586840',
      )
      expect(within(pager).getByRole('link', { name: 'Newer' }).getAttribute('href')).toContain(
        'from=1586940',
      )
    })

    it('starts the page after a short one at the lowest block it showed @IN-02', async () => {
      vi.spyOn(core, 'headers').mockImplementation((_net, from) =>
        from === 1_589_232
          ? Promise.resolve({
              ...stamp('dapi'),
              data: [{ height: from, hash: hashOf(from), time: 1_794_000_000_000 }],
            })
          : Promise.reject(new Error('no header')),
      )
      server.use(
        http.get('https://insight.testnet.networks.dash.org/insight-api/blocks', () =>
          HttpResponse.json({
            blocks: Array.from({ length: 60 }, (_, i) => ({
              height: 1_589_232 - i,
              hash: hashOf(1_589_232 - i),
              time: 1_794_000_000 - i * 150,
              size: 400,
              txlength: 1,
            })),
          }),
        ),
      )
      renderAt('/blocks?network=testnet&size=100')
      await waitFor(() =>
        expect(
          within(screen.getByRole('table', { name: 'Core blocks' })).getAllByRole('row'),
        ).toHaveLength(61),
      )
      const pager = screen.getByRole('navigation', { name: 'Pagination' })
      const older = within(pager).getByRole('link', { name: 'Older' }).getAttribute('href')!
      expect(older).toContain('from=1589172')
      expect(older).toContain('size=100')
      expect(screen.getByText('Heights 1,589,173 to 1,589,232')).toBeInTheDocument()
    })

    it('says what happened when Insight returns no blocks, with the page either side @IN-02', async () => {
      vi.spyOn(core, 'headers').mockImplementation((_net, from) =>
        Promise.resolve({
          ...stamp('dapi'),
          data: [{ height: from, hash: hashOf(from), time: 1_794_000_000_000 }],
        }),
      )
      const empty = await fixtureBody<{ blocks: never[] }>(
        'insight',
        'mainnet',
        'blocks--blockDate-2014-01-01,limit-20,startTimestamp-1388620800',
      )
      server.use(
        http.get('https://insight.testnet.networks.dash.org/insight-api/blocks', () =>
          HttpResponse.json(empty),
        ),
      )
      renderAt('/blocks?network=testnet&size=50&from=1589000')
      expect(await screen.findByText('No blocks came back for this page')).toBeInTheDocument()
      expect(
        document.querySelector('[data-nav="empty-page"] a[href*="from=1588950"]'),
      ).not.toBeNull()
      expect(
        document.querySelector('[data-nav="empty-page"] a[href*="from=1589050"]'),
      ).not.toBeNull()
      expect(document.querySelector('[data-nav="empty-page"] a[href*="size=50"]')).not.toBeNull()
      expect(screen.queryByText('No blocks on this date')).toBeNull()
    })

    it('shows loading, not "No blocks on this date", while the health probe is pending @IN-02', async () => {
      const status = await fixtureBody<Record<string, unknown>>('hyphen', 'mainnet', 'status')
      let release: () => void = () => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      server.use(
        http.get('*/x/hy/mainnet/status', async () => {
          await held
          return HttpResponse.json(status)
        }),
      )
      vi.spyOn(core, 'blockRows').mockImplementation((_net, q) =>
        Promise.resolve({ ...stamp('hyphen'), data: rowsFor(q.fromHeight, q.count) }),
      )
      renderAt('/blocks?date=2026-11-03&size=50')
      await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
      await delay(300)
      expect(screen.queryByText('No blocks on this date')).toBeNull()
      expect(
        within(screen.getByRole('group', { name: 'Blocks per page' })).getByRole('button', {
          name: '50',
        }),
      ).toHaveAttribute('aria-pressed', 'true')
      release()
      await waitFor(() =>
        expect(
          within(screen.getByRole('table', { name: /Blocks on 3 Nov 2026/ })).getAllByRole('row'),
        ).toHaveLength(51),
      )
    })

    it('keeps size in the links and shows what is on screen while no index can serve 50 @IN-02', async () => {
      server.use(
        http.get('*/x/hy/mainnet/status', () =>
          HttpResponse.json({ error: 'down' }, { status: 503 }),
        ),
      )
      renderAt('/blocks?date=2026-11-03&size=50')
      const table = await screen.findByRole('table', { name: /Blocks on 3 Nov 2026/ })
      void table
      await waitFor(() =>
        expect(
          within(screen.getByRole('table', { name: /Blocks on 3 Nov 2026/ })).getAllByRole('row'),
        ).toHaveLength(21),
      )
      const group = screen.getByRole('group', { name: 'Blocks per page' })
      expect(within(group).getByRole('button', { name: '20' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(within(group).getByRole('button', { name: '50' })).toBeDisabled()
      expect(screen.getByText(/Pages of 50 need an index that is up to date/)).toBeInTheDocument()
      const pager = screen.getByRole('navigation', { name: 'Pagination' })
      expect(within(pager).getByRole('link', { name: 'Older' }).getAttribute('href')).toContain(
        'size=50',
      )
    })

    it('keeps size on the link to blocks before the day @IN-02', async () => {
      vi.spyOn(core, 'blockRows').mockImplementation((_net, q) =>
        Promise.resolve({ ...stamp('hyphen'), data: rowsFor(q.fromHeight, q.count) }),
      )
      renderAt('/blocks?date=2026-11-03&size=50&from=2565827')
      const link = await screen.findByRole('link', { name: 'Older blocks from before this date' })
      expect(link.getAttribute('href')).toContain('size=50')
      expect(link.getAttribute('href')).toContain('from=2565826')
    })

    it('titles the page by the heights its rows hold, not the ones asked for @IN-02', async () => {
      vi.spyOn(core, 'blockRows').mockImplementation((_net, q) =>
        Promise.resolve({ ...stamp('hyphen'), data: rowsFor(q.fromHeight - 10, q.count - 10) }),
      )
      renderAt('/blocks?date=2026-11-03&size=50')
      expect(await screen.findByText('Heights 2,566,331 to 2,566,370')).toBeInTheDocument()
    })
  })
})
