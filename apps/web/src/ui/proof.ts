import type { ProofMeta } from '@/data/envelope'

type ProofHandler = (proof: ProofMeta) => void

let handler: ProofHandler | undefined
let needed: (() => void) | undefined
let waiting: ProofMeta | undefined

/** The proof inspector registers itself here; the Proof-checked mark opens it. */
export function registerProofInspector(open: ProofHandler | undefined): void {
  handler = open
  if (open && waiting) {
    const proof = waiting
    waiting = undefined
    open(proof)
  }
}

/** The shell says how to load the inspector, which is not mounted until a mark asks for it. */
export function onProofInspectorNeeded(load: (() => void) | undefined): void {
  needed = load
}

export function openProofInspector(proof: ProofMeta): void {
  if (handler) {
    handler(proof)
    return
  }
  if (!needed) return
  waiting = proof
  needed()
}
