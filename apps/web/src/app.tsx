import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, type RouterHistory } from '@tanstack/react-router'
import { useState } from 'react'
import { createAppRouter } from './router'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  })
}

export function App({ history }: { history?: RouterHistory }) {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(() => createAppRouter(queryClient, history))

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
