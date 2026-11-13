import type { Query, QueryClient } from '@tanstack/query-core'
import { decentralizedOnly, subscribeSourceMode } from '@/lib/source-mode'
import { HOSTED_SOURCES, isHostedSource } from '../endpoints'
import { forgetSourceHealth } from '../health'

/** DAPI answers that can rest on a hosted claim: a ChainLock flag one node and Hyphen agreed on. */
const CLAIM_BEARING = new Set(['tx', 'block', 'block-rows'])

/** True for a query no hosted source could have answered: the SDK's, and DAPI's that carry no claim. */
function ownAnswer(query: Query): boolean {
  const [, source, resource] = query.queryKey as readonly unknown[]
  if (source === 'sdk') return true
  if (source !== 'dapi' || (typeof resource === 'string' && CLAIM_BEARING.has(resource))) return false
  const data = query.state.data as { source?: unknown; fallback?: unknown } | undefined
  return !(
    data &&
    typeof data === 'object' &&
    ((typeof data.source === 'string' && isHostedSource(data.source)) || data.fallback !== undefined)
  )
}

/**
 * Applies a source-mode change at once, with no reload. Every query a hosted source could have answered goes back
 * to its initial state: its own keys, joined views, and the few DAPI keys whose answer can rest on a hosted claim or
 * come from Hyphen standing in for DAPI. DAPI and SDK queries keep their data and their in-flight reads. Mounted
 * queries run again: hosted ones are refused by the gate while the mode is on and fetched normally once it is off.
 * Hosted sources' health is forgotten both ways, because a source that is off has no health, and one that was off has
 * not been measured.
 */
export function resetForSourceMode(client: QueryClient): void {
  const predicate = (query: Query) => !ownAnswer(query)
  forgetSourceHealth(HOSTED_SOURCES)
  void client.cancelQueries({ predicate })
  void client.resetQueries({ predicate })
}

/** Resets when the mode in force changes, not when only the remembered choice or the link's part of it does. */
export function watchSourceMode(client: QueryClient): () => void {
  let mode = decentralizedOnly()
  return subscribeSourceMode(() => {
    const next = decentralizedOnly()
    if (next === mode) return
    mode = next
    resetForSourceMode(client)
  })
}
