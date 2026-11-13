import type { QueryClient } from '@tanstack/query-core'
import { subscribeSourceMode } from '@/lib/source-mode'
import { HOSTED_SOURCES } from '../endpoints'
import { forgetSourceHealth } from '../health'

/**
 * Applies a source-mode change at once, with no reload. Every query goes back to its initial state: a hosted source's
 * answer can sit under any key (a joined view, Hyphen standing in for DAPI, a ChainLock one node and Hyphen agreed
 * on), so nothing read under the other mode stays on screen. Mounted queries run again: hosted ones are refused by the
 * gate while the mode is on and fetched normally once it is off. Hosted sources' health is forgotten both ways,
 * because a source that is off has no health, and one that was off has not been measured.
 */
export function resetForSourceMode(client: QueryClient): void {
  forgetSourceHealth(HOSTED_SOURCES)
  void client.cancelQueries()
  void client.resetQueries()
}

export function watchSourceMode(client: QueryClient): () => void {
  return subscribeSourceMode(() => {
    resetForSourceMode(client)
  })
}
