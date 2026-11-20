import type { QueryClient } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'

const listeners = new Set<(net: NetworkId, finished: number) => void>()

/** Tells the watchers that `net`'s latest crawl is now one that finished at `finished`. */
export function announceNewerCrawl(net: NetworkId, finished: number): void {
  for (const listener of listeners) listener(net, finished)
}

/**
 * Re-reads every crawl document of a network that predates a newer crawl as soon as one document names it, so a page
 * never shows two crawls' ages side by side without one of them saying it is from an earlier crawl.
 */
export function watchCrawls(client: QueryClient): () => void {
  const listener = (net: NetworkId, finished: number) => {
    void client.invalidateQueries({
      predicate: (q) => {
        const asOf = (q.state.data as { asOf?: unknown } | undefined)?.asOf
        return (
          q.queryKey[0] === net &&
          q.queryKey[1] === 'radar' &&
          q.meta?.dataClass === 'crawl' &&
          typeof asOf === 'number' &&
          asOf < finished
        )
      },
    })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
