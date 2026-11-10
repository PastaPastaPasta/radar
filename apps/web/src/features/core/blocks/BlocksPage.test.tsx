import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { renderAt } from '../hy-shared/test-utils'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

describe('Blocks list', () => {
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

  it('says a day in the future has no blocks yet @IN-02', async () => {
    renderAt('/blocks?date=2999-01-01')
    expect(await screen.findByText('No blocks on this date')).toBeInTheDocument()
  })
})
