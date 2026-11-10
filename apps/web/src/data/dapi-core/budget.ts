import type { NetworkId } from '@/lib/network'

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
export const budget: Budget = {
  snapshot() {
    throw new Error('not implemented')
  },
  canAfford() {
    throw new Error('not implemented')
  },
  subscribe() {
    throw new Error('not implemented')
  },
}
