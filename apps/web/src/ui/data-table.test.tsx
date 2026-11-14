import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef } from '@tanstack/react-table'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAnnouncer } from './announce'
import { DataTable, NewRowsPill, parseSort, stringifySort, type DataTableProps } from './data-table'
import { renderInRouter, stamp } from './test-utils'

interface Row {
  id: string
  height: number
  txs: number
  city: string
}

const ROWS: Row[] = [
  { id: 'a', height: 3, txs: 10, city: 'Berlin' },
  { id: 'b', height: 2, txs: 30, city: 'Paris' },
  { id: 'c', height: 1, txs: 20, city: 'Oslo' },
]

const COLUMNS: ColumnDef<Row>[] = [
  { id: 'height', header: 'Height', accessorKey: 'height', meta: { numeric: true } },
  { id: 'txs', header: 'Transactions', accessorKey: 'txs', meta: { numeric: true } },
  { id: 'city', header: 'City', accessorKey: 'city', meta: { filterable: true } },
]

function Harness(props: Partial<DataTableProps<Row>> & { initialSort?: string }) {
  const [sort, setSort] = useState(props.initialSort ?? '-height')
  const sorted = [...ROWS].sort((x, y) => {
    const desc = sort.startsWith('-')
    const key = sort.replace(/^-/, '') as keyof Row
    const d = x[key] < y[key] ? -1 : x[key] > y[key] ? 1 : 0
    return desc ? -d : d
  })
  return (
    <DataTable
      caption="Blocks"
      columns={COLUMNS}
      rows={sorted}
      getRowId={(r) => r.id}
      state="ready"
      sort={{ value: sort, onChange: setSort }}
      {...props}
    />
  )
}

function bodyCities(): string[] {
  return within(screen.getAllByRole('rowgroup')[1]!)
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('cell')[2]?.textContent ?? '')
}

beforeEach(() => {
  resetAnnouncer()
})

describe('parseSort and stringifySort', () => {
  it('round-trips a minus prefix for descending', () => {
    expect(parseSort('-height')).toEqual([{ id: 'height', desc: true }])
    expect(parseSort('city')).toEqual([{ id: 'city', desc: false }])
    expect(parseSort(undefined)).toEqual([])
    expect(stringifySort('height', true)).toBe('-height')
    expect(stringifySort('city', false)).toBe('city')
  })
})

describe('DataTable sorting', () => {
  it('names the table and reports the sorted column with aria-sort', async () => {
    await renderInRouter(<Harness />)
    expect(screen.getByRole('table')).toHaveAccessibleName(/Blocks, sorted by Height/)
    expect(screen.getByRole('columnheader', { name: 'Height' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(screen.getByRole('columnheader', { name: 'City' })).not.toHaveAttribute('aria-sort')
    expect(bodyCities()).toEqual(['Berlin', 'Paris', 'Oslo'])
  })

  it('sorts by mouse, flips direction on a second click, and announces both', async () => {
    const user = userEvent.setup()
    await renderInRouter(<Harness />)
    await user.click(screen.getByRole('button', { name: 'City' }))
    expect(bodyCities()).toEqual(['Berlin', 'Oslo', 'Paris'])
    expect(screen.getByRole('columnheader', { name: 'City' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Sorted by City, ascending')
    })
    await user.click(screen.getByRole('button', { name: 'City' }))
    expect(bodyCities()).toEqual(['Paris', 'Oslo', 'Berlin'])
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Sorted by City, descending')
    })
  })

  it('starts numeric columns high to low and text columns A to Z', async () => {
    const user = userEvent.setup()
    await renderInRouter(<Harness initialSort="city" />)
    await user.click(screen.getByRole('button', { name: 'Transactions' }))
    expect(screen.getByRole('columnheader', { name: 'Transactions' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  it('sorts from the keyboard with Enter and Space', async () => {
    const user = userEvent.setup()
    await renderInRouter(<Harness />)
    const txs = screen.getByRole('button', { name: 'Transactions' })
    await user.tab()
    expect(screen.getByRole('button', { name: 'Height' })).toHaveFocus()
    await user.tab()
    expect(txs).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('columnheader', { name: 'Transactions' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await user.keyboard(' ')
    expect(screen.getByRole('columnheader', { name: 'Transactions' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })

  it('leaves headers as plain text when no sort is wired', async () => {
    await renderInRouter(
      <DataTable
        caption="Blocks"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        state="ready"
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('DataTable states', () => {
  const base = {
    caption: 'Blocks',
    columns: COLUMNS,
    rows: [] as Row[],
    getRowId: (r: Row) => r.id,
  }

  it('shows skeleton rows hidden from assistive technology while loading', async () => {
    await renderInRouter(<DataTable {...base} state="loading" />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    expect(document.querySelectorAll('.rx-skelrow')).toHaveLength(8)
  })

  it('shows the empty state for no rows', async () => {
    await renderInRouter(<DataTable {...base} state="ready" />)
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('shows an error row with a working retry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    await renderInRouter(
      <DataTable
        {...base}
        state="error"
        error={{ kind: 'http', source: 'pe' }}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Platform Explorer isn't answering/)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows custom empty content', async () => {
    await renderInRouter(<DataTable {...base} state="empty" empty={<p>No blocks match.</p>} />)
    expect(screen.getByText('No blocks match.')).toBeInTheDocument()
  })

  it('puts the source line in the foot', async () => {
    await renderInRouter(<Harness source={stamp()} />)
    expect(document.querySelector('.rx-tfoot [data-source="dapi"]')).not.toBeNull()
  })
})

describe('DataTable rows', () => {
  it('opens a row on click and on Enter, moving with j and k', async () => {
    const user = userEvent.setup()
    const { router } = await renderInRouter(<Harness rowLink={(r) => ({ to: '/', hash: r.id })} />)
    const rows = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row')
    await user.click(within(rows()[1]!).getAllByRole('cell')[1]!)
    await waitFor(() => {
      expect(router.state.location.hash).toBe('b')
    })
    expect(rows()[1]).toHaveFocus()
    await user.keyboard('k')
    expect(rows()[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(router.state.location.hash).toBe('a')
    })
    await user.keyboard('jj')
    expect(rows()[2]).toHaveFocus()
    await user.keyboard('j')
    expect(rows()[2]).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(router.state.location.hash).toBe('c')
    })
  })

  it('keeps clicks on interactive cell content from opening the row', async () => {
    const user = userEvent.setup()
    const onCellFilter = vi.fn()
    const { router } = await renderInRouter(
      <Harness rowLink={(r) => ({ to: '/', hash: r.id })} onCellFilter={onCellFilter} />,
    )
    await user.click(screen.getByRole('button', { name: /Oslo/ }))
    expect(onCellFilter).toHaveBeenCalledWith('city', 'Oslo')
    expect(router.state.location.hash).toBe('')
  })

  it('ignores row shortcuts while typing in a field', async () => {
    const user = userEvent.setup()
    await renderInRouter(
      <>
        <input aria-label="Search" />
        <Harness rowLink={(r) => ({ to: '/', hash: r.id })} />
      </>,
    )
    await user.click(screen.getByLabelText('Search'))
    await user.keyboard('j')
    expect(screen.getByLabelText('Search')).toHaveValue('j')
  })

  it('flags rows that just arrived', async () => {
    await renderInRouter(<Harness live={{ newRowIds: new Set(['b']) }} />)
    const flagged = document.querySelectorAll('tr.rx-enter')
    expect(flagged).toHaveLength(1)
    expect(flagged[0]).toHaveAttribute('data-row-id', 'b')
  })

  it('labels cells for the phone card layout', async () => {
    await renderInRouter(<Harness />)
    expect(document.querySelector('table')).toHaveClass('rx-table--cards')
  })
})

describe('DataTable paging', () => {
  it('shows the range, links to neighbours and disables the ends', async () => {
    await renderInRouter(
      <Harness
        paging={{
          kind: 'page',
          page: 1,
          limit: 3,
          total: 7,
          to: (page) => ({ to: '/', search: { page } as never }),
        }}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Pagination' })
    expect(nav).toHaveTextContent('1–3 of 7')
    expect(within(nav).getByRole('link', { name: 'Next' })).toBeInTheDocument()
    expect(within(nav).getByText('Previous')).toHaveAttribute('aria-disabled', 'true')
  })

  it('has no Next on the last page', async () => {
    await renderInRouter(
      <Harness paging={{ kind: 'page', page: 1, limit: 3, total: 3, to: () => ({ to: '/' }) }} />,
    )
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull()
  })

  it('offers newer and older links for cursors', async () => {
    await renderInRouter(<Harness paging={{ kind: 'cursor', next: { to: '/', hash: 'older' } }} />)
    expect(screen.getByRole('link', { name: 'Older' })).toHaveAttribute('rel', 'next')
    expect(screen.getByText('Newer')).toHaveAttribute('aria-disabled', 'true')
  })

  it('loads more on request and shows how many are loaded', async () => {
    const user = userEvent.setup()
    const fetchNext = vi.fn()
    await renderInRouter(
      <Harness paging={{ kind: 'infinite', hasNext: true, fetching: false, fetchNext }} />,
    )
    expect(screen.getByText('3 loaded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(fetchNext).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Back to top' })).toBeInTheDocument()
  })

  it('renders only a window of rows when virtual', async () => {
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(53)
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 53,
      top: 0,
      left: 0,
      right: 1200,
      bottom: 53,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const many = Array.from({ length: 400 }, (_, i) => ({
      id: `r${i}`,
      height: i,
      txs: i,
      city: `City ${i}`,
    }))
    await renderInRouter(
      <DataTable
        caption="Many"
        columns={COLUMNS}
        rows={many}
        getRowId={(r) => r.id}
        state="ready"
        virtual
      />,
    )
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '401')
    expect(document.querySelectorAll('tbody tr[data-row-id]').length).toBeLessThan(100)
    expect(document.querySelectorAll('tbody tr[data-row-id]').length).toBeGreaterThan(0)
    height.mockRestore()
    rect.mockRestore()
  })
})

describe('NewRowsPill', () => {
  it('hides at zero and offers to show the new rows', async () => {
    const user = userEvent.setup()
    const onShow = vi.fn()
    const { rerender } = render(<NewRowsPill count={0} noun="blocks" onShow={onShow} />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<NewRowsPill count={3} noun="blocks" onShow={onShow} />)
    await user.click(screen.getByRole('button', { name: /3 new blocks/ }))
    expect(onShow).toHaveBeenCalled()
  })
})

describe('DataTable width', () => {
  const widths = { scroll: 0, client: 0 }
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get: () => widths.scroll,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => widths.client,
    })
    return () => {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth')
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
    }
  })

  it('flags the scroll box of a table wider than its box, so it scrolls instead of widening the page', async () => {
    widths.scroll = 1400
    widths.client = 900
    const { container } = await renderInRouter(<Harness />)
    await waitFor(() => {
      expect(container.querySelector('.rx-tablescroll')).toHaveAttribute('data-wide')
    })
  })

  it('makes the scrolling box a named region a keyboard can focus', async () => {
    widths.scroll = 1400
    widths.client = 900
    await renderInRouter(<Harness />)
    const region = await screen.findByRole('region', { name: /./ })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region.querySelector('table')).not.toBeNull()
  })

  it('leaves a table that fits unflagged, so its sticky header keeps working', async () => {
    widths.scroll = 900
    widths.client = 900
    const { container } = await renderInRouter(<Harness />)
    await new Promise((r) => requestAnimationFrame(r))
    expect(container.querySelector('.rx-tablescroll')).not.toHaveAttribute('data-wide')
  })
})
