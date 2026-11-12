import { useSourceHealth } from '../health'
import { useIndexHealth } from '../index-health'
import type { NetworkId } from '@/lib/network'

/**
 * True once Hyphen's index is known to be fresh (the rule in `index-health.ts`) and Hyphen is answering (§4.7
 * rule 3). Pages that add Hyphen-only facts to a DAPI page (spent flags) wait for this before asking.
 */
export function useHyphenFit(net: NetworkId): boolean {
  const index = useIndexHealth(net)
  const health = useSourceHealth('hyphen')
  return index.probed && index.state !== 'stale' && health.state !== 'down'
}
