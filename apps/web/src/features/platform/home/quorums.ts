import type { QuorumDto } from '@/data/sdk/methods'

export interface ListedQuorum {
  quorum: QuorumDto
  /** This quorum signed the newest Platform block. */
  signing: boolean
}

/**
 * The quorums DAPI lists, the one that signed the newest block first and the rest in DAPI's order. DAPI writes a
 * hash in lower case and Platform Explorer in upper case, so they are compared without case.
 */
export function signingFirst(
  quorums: readonly QuorumDto[],
  signer: string | null | undefined,
): ListedQuorum[] {
  const want = signer?.toLowerCase()
  const listed = quorums.map((quorum) => ({
    quorum,
    signing: want !== undefined && quorum.quorumHash.toLowerCase() === want,
  }))
  return [...listed.filter((q) => q.signing), ...listed.filter((q) => !q.signing)]
}
