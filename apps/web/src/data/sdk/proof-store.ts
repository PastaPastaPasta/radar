import type { NetworkId } from '@/lib/network'
import type { WireMeta, WireProof } from './methods'

export const PROOF_STORE_SIZE = 300

export interface ProofRecord {
  id: string
  net: NetworkId
  method: string
  args: unknown
  recordedAt: number
  /** The evonode that answered, when the worker knew it. */
  node?: string
  meta: WireMeta
  proof: WireProof
}

/** The last 300 full proofs, in memory, for the proof inspector and evidence export (NX-61). */
export function createProofStore(size = PROOF_STORE_SIZE) {
  const records = new Map<string, ProofRecord>()
  const listeners = new Set<() => void>()
  let counter = 0
  let version = 0
  const changed = () => {
    version++
    for (const cb of [...listeners]) cb()
  }

  return {
    put(record: Omit<ProofRecord, 'id'>): ProofRecord {
      const full: ProofRecord = { ...record, id: `proof-${++counter}` }
      records.set(full.id, full)
      while (records.size > size) records.delete(records.keys().next().value!)
      changed()
      return full
    },
    get: (id: string): ProofRecord | undefined => records.get(id),
    /** Newest first. */
    list: (): ProofRecord[] => [...records.values()].reverse(),
    subscribe(cb: () => void): () => void {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    /** Changes whenever a record is added, for `useSyncExternalStore`. */
    snapshot: (): number => version,
    clear(): void {
      records.clear()
      changed()
    },
  }
}

export type ProofStore = ReturnType<typeof createProofStore>
export const proofStore: ProofStore = createProofStore()
