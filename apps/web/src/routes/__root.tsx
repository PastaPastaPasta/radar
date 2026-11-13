import { createRootRouteWithContext } from '@tanstack/react-router'
import { activateNetwork, activateSourceMode, networkMiddlewares, rootSearch } from '@/app/search'
import { AppShell, NotFoundPage } from '@/shell'
import type { RouterContext } from '../router'

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: rootSearch,
  search: { middlewares: networkMiddlewares },
  beforeLoad: ({ search, preload }) => {
    if (preload) return
    activateSourceMode(search)
    activateNetwork(search)
  },
  component: AppShell,
  notFoundComponent: NotFoundPage,
})
