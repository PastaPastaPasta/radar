import { configure, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { renderAt } from '../hy-shared/test-utils'
import { FIRST_CHUNK } from './blocks-range'

configure({ asyncUtilTimeout: 5000 })

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
})
