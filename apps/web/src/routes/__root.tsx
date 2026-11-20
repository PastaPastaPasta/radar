import { createRootRouteWithContext } from '@tanstack/react-router'
import { activateNetwork, activateSourceMode, networkMiddlewares, rootSearch } from '@/app/search'
import { i18nReady } from '@/i18n'
import { AppShell, NotFoundPage, RootError } from '@/shell'
import type { RouterContext } from '../router'

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: rootSearch,
  search: { middlewares: networkMiddlewares },
  beforeLoad: async ({ search, preload }) => {
    if (preload) return
    activateSourceMode(search)
    activateNetwork(search)
    // Loaders and the data layer build messages (failures, lag details), which Lingui cannot do before a catalog is
    // active. The edge preloads the catalog beside the entry, so this wait is short.
    await i18nReady
  },
  component: AppShell,
  errorComponent: RootError,
  notFoundComponent: NotFoundPage,
})
