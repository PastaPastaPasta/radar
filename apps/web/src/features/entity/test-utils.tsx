import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'

/** Renders a component with the app's i18n, a query client and a router whose address is `initial`, e.g. `/?network=testnet`. */
export function renderInApp(node: ReactNode, initial = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderInRouter(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>{node}</I18nProvider>
    </QueryClientProvider>,
    initial,
  )
}
