import { QueryClient } from '@tanstack/react-query'
import { createQueryClientConfig, createPersister } from '@/data/query'

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
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: {
        ...config.defaultOptions?.queries,
        ...(persister && { persister: persister.persisterFn }),
      },
    },
  })
}
