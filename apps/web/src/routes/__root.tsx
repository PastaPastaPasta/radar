import { createRootRouteWithContext } from '@tanstack/react-router'
import { activateNetwork, networkMiddlewares, rootSearch } from '@/app/search'
import { AppShell, NotFoundPage } from '@/shell'
import type { RouterContext } from '../router'

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: rootSearch,
  search: { middlewares: networkMiddlewares },
  beforeLoad: ({ search, preload }) => {
    if (!preload) activateNetwork(search)
  },
  component: AppShell,
  notFoundComponent: NotFoundPage,
})
