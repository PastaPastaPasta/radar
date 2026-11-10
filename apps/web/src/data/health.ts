import type { BudgetSnapshot } from './dapi-core/budget'
import type { SourceErrorKind } from './errors'
import type { SourceId } from './envelope'
import type { NetworkId } from '@/lib/network'

export type HealthState = 'unknown' | 'ok' | 'slow' | 'stale' | 'degraded' | 'down'

export interface SourceHealth {
  source: SourceId
  net: NetworkId
  state: HealthState
  lastOkAt?: number
  lastError?: { kind: SourceErrorKind; message: string; at: number }
  p50LatencyMs?: number
  /** Freshness lag, when the source reports one. */
  lag?: { blocks?: number; ms?: number; detail: string } // detail: "indexed to block 1,577,999 (18 days behind)"
  /** dapi only */
  budget?: BudgetSnapshot
}

export const healthRegistry: {
  report(
    net: NetworkId,
    source: SourceId,
    r: { ok: boolean; latencyMs: number; kind?: SourceErrorKind },
  ): void
  setLag(net: NetworkId, source: SourceId, lag: SourceHealth['lag']): void
  get(net: NetworkId, source: SourceId): SourceHealth
  subscribe(cb: () => void): () => void
} = {
  report() {
    throw new Error('not implemented')
  },
  setLag() {
    throw new Error('not implemented')
  },
  get() {
    throw new Error('not implemented')
  },
  subscribe() {
    throw new Error('not implemented')
  },
}

export function useSourceHealth(source: SourceId): SourceHealth {
  void source
  throw new Error('not implemented')
}

export function useAllSourceHealth(): SourceHealth[] {
  throw new Error('not implemented')
}
