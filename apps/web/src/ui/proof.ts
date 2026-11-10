import type { ProofMeta } from '@/data/envelope'

type ProofHandler = (proof: ProofMeta) => void

let handler: ProofHandler | undefined

/** The proof inspector registers itself here; the Proof-checked mark opens it. */
export function registerProofInspector(open: ProofHandler | undefined): void {
  handler = open
}

export function openProofInspector(proof: ProofMeta): void {
  handler?.(proof)
}
