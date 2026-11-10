import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef } from '@tanstack/react-table'
import type { UseQueryResult } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sourced } from '@/data/envelope'
import { Time } from './amount'
import { DataTable } from './data-table'
import { EntityChip } from './entities'
import { HoverCardScope, clearHoverCards, registerHoverCard } from './hover-cards'
import { PaletteShell } from './palette'
import { QueryView } from './query-view'
import { registerProofInspector } from './proof'
import { Stat } from './stat'
import { SourceLine } from './states'
import { NOW, renderInRouter, stamp } from './test-utils'

interface Row {
  id: string
  name: string
}

const COLUMNS: ColumnDef<Row>[] = [{ id: 'name', header: 'Name', accessorKey: 'name' }]

function rowsOf(prefix: string, ids: string[]): Row[] {
  return ids.map((id) => ({ id, name: `${prefix}-${id}` }))
}

function Table({ caption, rows }: { caption: string; rows: Row[] }) {
  return (
    <DataTable
      caption={caption}
      columns={COLUMNS}
      rows={rows}
      getRowId={(r) => r.id}
      state="ready"
      rowLink={(r) => ({ to: '/', hash: r.id })}
    />
  )
}

function bodyRows(caption: string): HTMLElement[] {
  const table = screen.getByRole('table', { name: new RegExp(caption) })
  return within(within(table).getAllByRole('rowgroup')[1]!).getAllByRole('row')
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  registerProofInspector(undefined)
  clearHoverCards()
})

describe('DataTable keyboard with several tables', () => {
  it('moves only the table the user is working in', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await renderInRouter(
      <>
        <Table caption="First" rows={rowsOf('a', ['1', '2', '3'])} />
        <Table caption="Second" rows={rowsOf('b', ['1', '2', '3'])} />
      </>,
    )
    await user.keyboard('j')
    expect(bodyRows('First')[0]).toHaveFocus()
    expect(bodyRows('Second')[0]).not.toHaveFocus()
    await user.hover(screen.getByRole('table', { name: /Second/ }))
    await user.keyboard('j')
    expect(bodyRows('Second')[0]).toHaveFocus()
    expect(bodyRows('First')[1]).not.toHaveFocus()
  })

  it('does not open a row once focus has left the table', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { router } = await renderInRouter(
      <>
        <button type="button">elsewhere</button>
        <Table caption="First" rows={rowsOf('a', ['1', '2'])} />
      </>,
    )
    await user.keyboard('j')
    expect(bodyRows('First')[0]).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    await user.keyboard('{Enter}')
    expect(router.state.location.hash).toBe('')
  })

  it('keeps following the same row when new rows arrive above it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const feed = { push: () => undefined as void }
    function Live() {
      const [rows, setRows] = useState(rowsOf('a', ['1', '2', '3']))
      useEffect(() => {
        feed.push = () => {
          setRows((r) => [...rowsOf('n', ['0']), ...r])
        }
      }, [])
      return <Table caption="Live" rows={rows} />
    }
    const { router } = await renderInRouter(<Live />)
    await user.keyboard('jj')
    expect(bodyRows('Live')[1]).toHaveFocus()
    act(() => {
      feed.push()
    })
    await user.keyboard('j')
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(router.state.location.hash).toBe('3')
    })
  })
})

describe('SourceLine proof inspector', () => {
  it('opens from the plain line too', async () => {
    const open = vi.fn()
    registerProofInspector(open)
    const proof = { kind: 'identity', height: 3 } as never
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SourceLine stamp={stamp({ source: 'sdk', proved: true, proof })} />)
    await user.click(screen.getByRole('button', { name: /Proof-checked/ }))
    expect(open).toHaveBeenCalledWith(proof)
  })
})

describe('Stat as a link', () => {
  it('never nests a button inside the anchor', () => {
    const proof = { kind: 'identity', height: 3 } as never
    render(
      <Stat
        label="Balance"
        value="1"
        href="/identity/x"
        source={stamp({ source: 'sdk', proved: true, proof })}
      />,
    )
    const link = screen.getByRole('link')
    expect(within(link).queryByRole('button')).toBeNull()
    expect(link).toHaveTextContent('Proof-checked')
  })
})

describe('hover card scope', () => {
  it('shows scoped cards without touching the registry', async () => {
    registerHoverCard('block', () => <div data-testid="real">real</div>)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <>
        <HoverCardScope cards={{ block: () => <div data-testid="scoped">scoped</div> }}>
          <EntityChip kind="block" id="1" href="/b/1" />
        </HoverCardScope>
        <EntityChip kind="block" id="2" href="/b/2" />
      </>,
    )
    const [inside, outside] = screen.getAllByRole('link')
    await user.hover(inside!)
    expect(await screen.findByTestId('scoped', {}, { timeout: 2000 })).toBeInTheDocument()
    await user.unhover(inside!)
    await user.hover(outside!)
    expect(await screen.findByTestId('real', {}, { timeout: 2000 })).toBeInTheDocument()
  })
})

describe('QueryView', () => {
  it('keeps showing the last good data when a refetch fails', () => {
    const sourced: Sourced<string> = { data: 'last good', ...stamp() }
    const query = {
      isPending: false,
      isError: true,
      error: new Error('timeout'),
      data: sourced,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<Sourced<string>>
    render(<QueryView query={query}>{(data) => <p>{data}</p>}</QueryView>)
    expect(screen.getByText('last good')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the error when there is nothing to show', () => {
    const query = {
      isPending: false,
      isError: true,
      error: { kind: 'timeout', source: 'pe' },
      data: undefined,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<Sourced<string>>
    render(<QueryView query={query}>{(data) => <p>{data}</p>}</QueryView>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('clock skew', () => {
  it('reads "0 s ago" for a stamp a few seconds ahead of the local clock', () => {
    render(
      <>
        <Time ms={NOW + 7000} />
        <SourceLine stamp={stamp({ asOf: NOW + 7000 })} compact />
      </>,
    )
    expect(document.querySelector('time.rx-time')).toHaveTextContent('0 s ago')
    expect(screen.queryByText(/in \d+ s/)).toBeNull()
  })
})

describe('palette Shift+Enter', () => {
  it('opens the highlighted result in a new tab even when selection is uncontrolled', async () => {
    globalThis.ResizeObserver = class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    Element.prototype.scrollIntoView = () => undefined
    const onSelect = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <PaletteShell
        open
        onOpenChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
        groups={[
          {
            id: 'g',
            heading: 'Blocks',
            icon: 'block',
            items: [
              { id: 'one', glyph: <i />, title: 'One' },
              { id: 'two', glyph: <i />, title: 'Two' },
            ],
          },
        ]}
        onSelect={onSelect}
      />,
    )
    await screen.findByRole('dialog')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'two' }), true)
  })
})
