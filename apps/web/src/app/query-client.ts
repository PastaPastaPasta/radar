import { QueryClient } from '@tanstack/react-query'
import { createQueryClientConfig, createPersister, watchSourceMode } from '@/data/query'
import { watchCrawls } from '@/data/radar/crawl-events'

function openPersister() {
  if (typeof indexedDB === 'undefined') return undefined
  try {
    return createPersister({ appVersion: __APP_VERSION__ })
  } catch {
    return undefined
  }
}

export function createQueryClient(): QueryClient {
  const config = createQueryClientConfig()
  const persister = openPersister()
  const client = new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: {
        ...config.defaultOptions?.queries,
        ...(persister && { persister: persister.persisterFn }),
      },
    },
  })
  watchSourceMode(client)
  watchCrawls(client)
  return client
}
