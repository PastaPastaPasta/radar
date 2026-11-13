import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parseSearch, stringifySearch } from '@/app/search'
import { useMnSearch, type MnSearchControls } from '@/features/network/masternodes/use-mn-search'

function mount(url: string) {
  let controls!: MnSearchControls
  const Probe = () => {
    controls = useMnSearch()
    return <p>probe</p>
  }
  const root = createRootRoute()
  const route = createRoute({ getParentRoute: () => root, path: '/masternodes', component: Probe })
  const history = createMemoryHistory({ initialEntries: [url] })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history,
    parseSearch,
    stringifySearch,
  })
  render(<RouterProvider router={router} />)
  return { history, get: () => controls, ready: () => screen.findByText('probe') }
}

describe('useMnSearch', () => {
  it('replaces the history entry for a filter and goes back to page one', async () => {
    const { history, get, ready } = mount('/masternodes?page=3&sort=version')
    await ready()
    const before = history.length
    act(() => {
      get().filter({ country: ['DE'] })
    })
    await waitFor(() => expect(history.location.search).toContain('country=DE'))
    expect(history.location.search).not.toContain('page=')
    expect(history.location.search).toContain('sort=version')
    expect(history.length).toBe(before)
  })

  it('adds a history entry for a sort and for a page', async () => {
    const { history, get, ready } = mount('/masternodes?country=DE')
    await ready()
    const before = history.length
    act(() => {
      get().sort({ sort: '-version' })
    })
    await waitFor(() => expect(history.location.search).toContain('sort=-version'))
    expect(history.length).toBe(before + 1)
    act(() => {
      get().page(2)
    })
    await waitFor(() => expect(history.location.search).toContain('page=2'))
    expect(history.length).toBe(before + 2)
    expect(history.location.search).toContain('country=DE')
  })

  it('removes a field set to undefined', async () => {
    const { history, get, ready } = mount('/masternodes?q=abc&type=evo')
    await ready()
    act(() => {
      get().filter({ q: undefined })
    })
    await waitFor(() => expect(history.location.search).not.toContain('q='))
    expect(history.location.search).toContain('type=evo')
  })
})
