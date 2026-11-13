import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Sourced } from '@/data/envelope'
import { CURSOR_PAGE, CursorPages } from './CursorPages'

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => `v${from + i}`)

function sourced(data: string[]): Sourced<string[]> {
  return { data, source: 'sdk', proved: true, fetchedAt: 0, asOf: 0 } as unknown as Sourced<
    string[]
  >
}

function setup(target: number, total: number) {
  const asked: (string | undefined)[] = []
  const all = ids(1, total)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CursorPages
        target={target}
        cursor={undefined}
        cursorOf={(id: string) => id}
        queryFor={(cursor) =>
          queryOptions({
            queryKey: ['voters', cursor ?? 'first'],
            queryFn: () => {
              asked.push(cursor)
              const start = cursor ? all.indexOf(cursor) + 1 : 0
              return Promise.resolve(sourced(all.slice(start, start + CURSOR_PAGE + 1)))
            },
          })
        }
        render={(q) => (
          <ul>
            {(q.data?.data ?? []).slice(0, CURSOR_PAGE).map((id) => (
              <li key={id}>{id}</li>
            ))}
            {q.data && q.data.data.length > CURSOR_PAGE ? <li>more</li> : null}
          </ul>
        )}
      />
    </QueryClientProvider>,
  )
  return asked
}

describe('cursor pages', () => {
  it('shows the first page from the start of the list, and says another follows', async () => {
    const asked = setup(1, 60)
    expect(await screen.findByText('v25')).toBeInTheDocument()
    expect(screen.queryByText('v26')).toBeNull()
    expect(screen.getByText('more')).toBeInTheDocument()
    expect(asked).toEqual([undefined])
  })

  it('reaches the third page by starting each page after the last row of the page before', async () => {
    const asked = setup(3, 60)
    expect(await screen.findByText('v51')).toBeInTheDocument()
    expect(screen.getByText('v60')).toBeInTheDocument()
    expect(screen.queryByText('more')).toBeNull()
    expect(asked).toEqual([undefined, 'v25', 'v50'])
  })

  it('stops at the last page when the list ends sooner than asked', async () => {
    const asked = setup(2, 10)
    expect(await screen.findByText('v10')).toBeInTheDocument()
    expect(screen.queryByText('more')).toBeNull()
    expect(asked).toEqual([undefined])
  })
})
