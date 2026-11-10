import { render } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'

export const NOW = Date.UTC(2026, 10, 10, 12, 0, 0)

export function stamp(over: Partial<SourceStamp> = {}): SourceStamp {
  return {
    source: 'dapi',
    asOf: NOW - 2000,
    fetchedAt: NOW - 2000,
    proved: false,
    ...over,
  }
}

export async function renderInRouter(node: ReactNode, initial = '/') {
  const root = createRootRoute({ component: Outlet })
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => node })
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  await router.load()
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}
