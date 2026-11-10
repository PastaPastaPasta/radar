import { createRootRouteWithContext } from '@tanstack/react-router'
import { networkMiddlewares, rootSearch } from '@/app/search'
import { AppShell, NotFoundPage } from '@/shell'
import type { RouterContext } from '../router'

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: rootSearch,
  search: { middlewares: networkMiddlewares },
  component: AppShell,
  notFoundComponent: NotFoundPage,
})
