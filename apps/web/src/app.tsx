import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, type RouterHistory } from '@tanstack/react-router'
import { useState } from 'react'
import { createQueryClient } from './app/query-client'
import { registerEntityHoverCards } from './features/entity'
import { createAppRouter } from './router'

registerEntityHoverCards()

export { createQueryClient }

export function App({ history }: { history?: RouterHistory }) {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(() => createAppRouter(queryClient, history))

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
