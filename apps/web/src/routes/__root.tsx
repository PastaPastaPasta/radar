import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { z } from 'zod'
import type { RouterContext } from '../router'

const rootSearch = z.object({
  network: z.string().optional(),
})

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: rootSearch,
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header>
        <nav aria-label="Primary">
          <Link to="/">Home</Link>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer />
    </div>
  )
}
