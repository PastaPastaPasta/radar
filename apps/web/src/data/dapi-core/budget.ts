import type { NetworkId } from '@/lib/network'
import { getDapiTransport } from './client'

export type BudgetPressure = 'ok' | 'tight' | 'exhausted'
export interface BudgetSnapshot {
  pressure: BudgetPressure
  headroom: number // requests available in the next 60 s across unbenched active nodes
  capacity: number // activeNodes × 50
  benched: number
  usedLastMinute: number
}
export interface Budget {
  snapshot(net: NetworkId): BudgetSnapshot
  /** True if n more requests fit without moving pressure past 'ok'. */
  canAfford(net: NetworkId, n: number): boolean
  subscribe(cb: () => void): () => void
}
/** The budget of whichever transport is installed (production pool, or the fixture transport in tests and fixture builds). */
export const budget: Budget = {
  snapshot: (net) => getDapiTransport().budget.snapshot(net),
  canAfford: (net, n) => getDapiTransport().budget.canAfford(net, n),
  subscribe: (cb) => getDapiTransport().budget.subscribe(cb),
}
