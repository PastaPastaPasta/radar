import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef } from '@tanstack/react-table'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable } from './data-table'
import { barInset } from './infinite'
import { useListPosition, useReveal } from './data-table'
import { renderInRouter } from './test-utils'

interface Row {
  id: string
}

const ALL: Row[] = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}` }))
const COLUMNS: ColumnDef<Row>[] = [{ id: 'id', header: 'Id', accessorKey: 'id' }]
const shown = () => document.querySelectorAll('tbody tr[data-row-id]').length

function List({
  total = ALL.length,
  steps,
  busy,
  at = 1,
}: {
  total?: number
  steps?: number
  busy?: boolean
  at?: number
}) {
  const [sort, setSort] = useState('a')
  const reveal = useReveal({ total, step: 10, steps, reset: sort, busy })
  const list = useRef<HTMLDivElement>(null)
  useListPosition(list, { at, step: 10, count: reveal.count, total })
  return (
    <div ref={list}>
      <button
        type="button"
        onClick={() => {
          setSort('b')
        }}
      >
        resort
      </button>
      <DataTable
        caption="Rows"
        columns={COLUMNS}
        rows={ALL.slice(0, reveal.count)}
        getRowId={(r) => r.id}
        state="ready"
        paging={reveal.paging}
      />
    </div>
  )
}

describe('useReveal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reveals a step at a time and stops at the end of the list', async () => {
    const user = userEvent.setup()
    await renderInRouter(<List />)
    expect(shown()).toBe(10)
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(shown()).toBe(20))
    await user.click(await screen.findByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(shown()).toBe(25))
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('All 25 shown.')
  })

  it('opens with the steps a page names, and starts over when the reader re-sorts', async () => {
    const user = userEvent.setup()
    const { unmount } = await renderInRouter(<List steps={2} />)
    expect(shown()).toBe(20)
    unmount()
    await renderInRouter(<List />)
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(shown()).toBe(20))
    await user.click(screen.getByRole('button', { name: 'resort' }))
    expect(shown()).toBe(10)
  })

  it('holds the next step while the rows revealed last are still loading', async () => {
    const user = userEvent.setup()
    function Busy() {
      const [busy, setBusy] = useState(true)
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setBusy(false)
            }}
          >
            landed
          </button>
          <List busy={busy} />
        </>
      )
    }
    await renderInRouter(<Busy />)
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(shown()).toBe(10)
    expect(screen.getByRole('status')).toHaveTextContent('Loading more…')
    await user.click(screen.getByRole('button', { name: 'landed' }))
    await waitFor(() => expect(shown()).toBe(20))
  })

  it('pages nothing when the whole list fits one step', async () => {
    await renderInRouter(<List total={8} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })
})

describe('useListPosition', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes the step of the first row in view back to the address, keeping the history state', async () => {
    const ROW = 40
    let scrolled = 0
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = Number(this.dataset.index ?? -1)
      const top = index * ROW - scrolled
      return {
        top,
        bottom: top + ROW,
        height: ROW,
        width: 100,
        left: 0,
        right: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }
    })
    history.replaceState({ kept: 1 }, '')
    await renderInRouter(<List steps={3} />)
    expect(shown()).toBe(25)
    scrolled = 12 * ROW
    await act(async () => {
      window.dispatchEvent(new Event('scroll'))
      await new Promise((r) => requestAnimationFrame(r))
    })
    expect(new URL(window.location.href).searchParams.get('page')).toBe('2')
    expect(history.state).toMatchObject({ kept: 1, radarListPage: 2 })
    scrolled = 0
    await act(async () => {
      window.dispatchEvent(new Event('scroll'))
      await new Promise((r) => requestAnimationFrame(r))
    })
    expect(new URL(window.location.href).searchParams.has('page')).toBe(false)
  })

  it('scrolls the first row of the page the address names to the top', async () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = Number(this.dataset.index ?? -1)
      const top = index >= 10 && scrollBy.mock.calls.length > 0 ? barInset() : index * 40
      return {
        top,
        bottom: top + 40,
        height: 40,
        width: 100,
        left: 0,
        right: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }
    })
    await renderInRouter(<List steps={2} at={2} />)
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => requestAnimationFrame(r))
    })
    expect(scrollBy).toHaveBeenCalledWith(0, 400 - barInset())
  })
})
