import { QueryClient } from '@tanstack/react-query'
import { createQueryClientConfig, createPersister, watchSourceMode } from '@/data/query'
import { hyBlockKey, hyTxKey, onHyphenDetail } from '@/data/hyphen/seen'
import { watchCrawls } from '@/data/radar/crawl-events'
import { decentralizedOnly } from '@/lib/source-mode'

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
  // A detail the Core client read is the answer the page's own Hyphen query would fetch a moment later.
  onHyphenDetail((net, seen) => {
    if (decentralizedOnly()) return
    for (const id of new Set(seen.ids.map((i) => i.toLowerCase()))) {
      const queryKey = seen.kind === 'tx' ? hyTxKey(net, id) : hyBlockKey(net, id)
      if (client.getQueryData(queryKey) === undefined) {
        client.setQueryData(queryKey, seen.read, { updatedAt: seen.read.fetchedAt })
      }
    }
  })
  return client
}
