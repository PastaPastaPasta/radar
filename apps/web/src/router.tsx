import type { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { markFirstLoadResolved } from './app/first-load'
import { parseSearch, stringifySearch } from './app/search'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
}

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient },
    parseSearch,
    stringifySearch,
    defaultPreload: 'intent',
    scrollRestoration: true,
  })
  router.subscribe('onResolved', markFirstLoadResolved)
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
