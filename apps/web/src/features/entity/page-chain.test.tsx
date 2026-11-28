import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { usePageChain } from './page-chain'

vi.mock('./network', () => ({ useNetwork: () => 'mainnet' }))

const PAGE = 5
const ids = (n: number) => Array.from({ length: n }, (_, i) => `v${i + 1}`)

function List({
  all,
  start,
  earlier,
  asked,
  maxPages,
  hold,
  keep,
}: {
  hold?: Promise<void>
  keep?: (id: string) => boolean
  all: string[] | (() => string[])
  start?: string | undefined
  earlier?: (string | undefined)[]
  asked: (string | undefined)[]
  maxPages?: number
}) {
  const list = usePageChain({
    listKey: 'voters',
    start,
    earlier,
    query: (cursor: string | undefined) =>
      queryOptions({
        queryKey: ['voters', cursor ?? 'first'],
        queryFn: async () => {
          asked.push(cursor)
          if (cursor && hold) await hold
          const list = typeof all === 'function' ? all() : all
          const from = cursor ? list.indexOf(cursor) + 1 : 0
          return list.slice(from, from + PAGE + 1)
        },
      }),
    rows: (page) => page.slice(0, PAGE).filter((id) => keep?.(id) ?? true),
    getRowId: (id) => id,
    next: (page) => (page.length > PAGE ? page[PAGE - 1] : undefined),
    maxPages,
  })
  return (
    <div>
      <p data-testid="state">{list.state}</p>
      <ul>
        {list.rows.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
      {list.before.has ? (
        <button type="button" onClick={list.before.load}>
          earlier
        </button>
      ) : null}
      {list.restart ? (
        <button type="button" onClick={list.restart}>
          start
        </button>
      ) : null}
      {list.paging.hasNext ? (
        <button type="button" disabled={list.paging.fetching} onClick={list.paging.fetchNext}>
          more
        </button>
      ) : (
        <p>end</p>
      )}
    </div>
  )
}

function setup(props: Omit<Parameters<typeof List>[0], 'asked'>) {
  const asked: (string | undefined)[] = []
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <List {...props} asked={asked} />
    </QueryClientProvider>,
  )
  const rerender = (next: Omit<Parameters<typeof List>[0], 'asked'>) => {
    view.rerender(
      <QueryClientProvider client={client}>
        <List {...next} asked={asked} />
      </QueryClientProvider>,
    )
  }
  return { asked, rerender }
}

const shown = () => Array.from(document.querySelectorAll('li'), (li) => li.textContent)

describe('usePageChain', () => {
  it('reads each page after the last row of the one before, one page at a time', async () => {
    const user = userEvent.setup()
    const { asked } = setup({ all: ids(12) })
    expect(await screen.findByText('v5')).toBeInTheDocument()
    expect(asked).toEqual([undefined])
    await user.click(screen.getByRole('button', { name: 'more' }))
    expect(await screen.findByText('v10')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'more' }))
    expect(await screen.findByText('end')).toBeInTheDocument()
    expect(shown()).toEqual(ids(12))
    expect(asked).toEqual([undefined, 'v5', 'v10'])
  })

  it('does not say the list has ended while its next page is still on its way', async () => {
    const user = userEvent.setup()
    let release: () => void = () => undefined
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    setup({ all: ids(12), hold })
    expect(await screen.findByText('v5')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'more' }))
    expect(screen.getByRole('button', { name: 'more' })).toBeDisabled()
    expect(screen.queryByText('end')).toBeNull()
    release()
    expect(await screen.findByText('v10')).toBeInTheDocument()
  })

  it('reads on past later pages a browser-side filter hides entirely', async () => {
    const user = userEvent.setup()
    const kept = new Set(['v1', 'v2', 'v18'])
    const { asked } = setup({ all: ids(30), keep: (id) => kept.has(id) })
    expect(await screen.findByText('v2')).toBeInTheDocument()
    expect(asked).toEqual([undefined])
    await user.click(screen.getByRole('button', { name: 'more' }))
    expect(await screen.findByText('v18')).toBeInTheDocument()
    expect(shown()).toEqual(['v1', 'v2', 'v18'])
    expect(asked).toEqual([undefined, 'v5', 'v10', 'v15'])
  })

  it('keeps the rows on screen while it reads past more hidden pages than it keeps', async () => {
    const user = userEvent.setup()
    const { asked } = setup({
      all: ids(200),
      maxPages: 3,
      keep: (id) => id === 'v1' || id === 'v2',
    })
    expect(await screen.findByText('v2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'more' }))
    await waitFor(() => {
      expect(asked).toHaveLength(14)
    })
    expect(shown()).toEqual(['v1', 'v2'])
    expect(screen.queryByRole('button', { name: 'earlier' })).toBeNull()
  })

  it('opens at the cursor the address names, without reading the pages above it', async () => {
    const { asked } = setup({ all: ids(20), start: 'v10' })
    expect(await screen.findByText('v11')).toBeInTheDocument()
    expect(shown()).toEqual(['v11', 'v12', 'v13', 'v14', 'v15'])
    expect(asked).toEqual(['v10'])
    expect(screen.queryByRole('button', { name: 'earlier' })).toBeNull()
  })

  it('reads the pages above a deep link when the address keeps their cursors', async () => {
    const user = userEvent.setup()
    const { asked } = setup({ all: ids(20), start: 'v10', earlier: [undefined, 'v5'] })
    expect(await screen.findByText('v11')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'earlier' }))
    expect(await screen.findByText('v6')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'earlier' }))
    expect(await screen.findByText('v1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'earlier' })).toBeNull()
    expect(shown()).toEqual(ids(15))
    expect(asked).toEqual(['v10', 'v5', undefined])
  })

  it('keeps at most `maxPages` on the page and brings a dropped page back from the cache', async () => {
    const user = userEvent.setup()
    const { asked } = setup({ all: ids(30), maxPages: 2 })
    expect(await screen.findByText('v5')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'more' }))
    expect(await screen.findByText('v10')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'more' }))
    expect(await screen.findByText('v15')).toBeInTheDocument()
    expect(shown()).toEqual(ids(15).slice(5))
    await user.click(screen.getByRole('button', { name: 'earlier' }))
    await waitFor(() => {
      expect(shown()).toEqual(ids(10))
    })
    expect(asked).toEqual([undefined, 'v5', 'v10'])
  })

  it('keeps its pages when the address moves to one it holds, and moves when it names another', async () => {
    const user = userEvent.setup()
    const { rerender } = setup({ all: ids(30) })
    expect(await screen.findByText('v5')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'more' }))
    expect(await screen.findByText('v10')).toBeInTheDocument()
    rerender({ all: ids(30), start: 'v5' })
    expect(shown()).toEqual(ids(10))
    rerender({ all: ids(30), start: 'v20' })
    expect(await screen.findByText('v21')).toBeInTheDocument()
    expect(shown()).toEqual(['v21', 'v22', 'v23', 'v24', 'v25'])
  })

  it('shows a row once when it moved onto the next page between reads', async () => {
    const user = userEvent.setup()
    let list = ids(12)
    setup({ all: () => list })
    expect(await screen.findByText('v5')).toBeInTheDocument()
    list = ['v0', ...list]
    await user.click(screen.getByRole('button', { name: 'more' }))
    expect(await screen.findByText('v10')).toBeInTheDocument()
    expect(shown()).toEqual(ids(10))
  })

  it('offers the start of a cursor list opened part-way down, and goes back there', async () => {
    const user = userEvent.setup()
    setup({ all: ids(20), start: 'v10' })
    expect(await screen.findByText('v11')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'start' }))
    expect(await screen.findByText('v1')).toBeInTheDocument()
    expect(shown()).toEqual(ids(5))
    expect(screen.queryByRole('button', { name: 'start' })).toBeNull()
  })

  it('does not offer the start to a list whose first page is a number, while it is there', async () => {
    const user = userEvent.setup()
    function Chunks({ start }: { start: number }) {
      const list = usePageChain({
        listKey: 'chunks',
        start,
        first: 0,
        query: (chunk: number) =>
          queryOptions({
            queryKey: ['chunks', chunk],
            queryFn: () => Promise.resolve(ids(PAGE).map((id) => `${chunk}-${id}`)),
          }),
        rows: (page) => page,
        getRowId: (id) => id,
        next: (_, chunk) => (chunk < 3 ? chunk + 1 : undefined),
      })
      return (
        <div>
          <ul>
            {list.rows.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
          {list.restart ? (
            <button type="button" onClick={list.restart}>
              start
            </button>
          ) : null}
        </div>
      )
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={client}>
        <Chunks start={0} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('0-v1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'start' })).toBeNull()
    view.unmount()
    render(
      <QueryClientProvider client={client}>
        <Chunks start={2} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('2-v1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'start' }))
    expect(await screen.findByText('0-v1')).toBeInTheDocument()
    expect(screen.queryByText('2-v1')).toBeNull()
  })
})
