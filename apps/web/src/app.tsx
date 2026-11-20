import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider, type RouterHistory } from '@tanstack/react-router'
import { useState } from 'react'
import { createQueryClient } from './app/query-client'
import { registerEntityHoverCards } from './features/entity'
import { createAppRouter } from './router'

registerEntityHoverCards()

export { createQueryClient, createAppRouter }

export type AppRouter = ReturnType<typeof createAppRouter>

/** `main.tsx` passes a client and router it has already started loading the first route with. */
export function App({
  history,
  started,
}: {
  history?: RouterHistory
  started?: { queryClient: QueryClient; router: AppRouter }
}) {
  const [queryClient] = useState(() => started?.queryClient ?? createQueryClient())
  const [router] = useState(() => started?.router ?? createAppRouter(queryClient, history))

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
