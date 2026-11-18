/** One member of a Platform validator set: a ProTx hash as lower-case hex, in display order. */
export interface ValidatorMember {
  proTxHash: string
  banned: boolean
}

export interface ValidatorSet {
  quorumHash: string
  /** Sorted by ProTx hash: Tenderdash's proposer order inside a set. */
  members: ValidatorMember[]
}

/** What Drive reports about its validator sets (`getCurrentQuorumsInfo`), as the turn order needs it. */
export interface ValidatorSets {
  /** Every set's quorum hash, in Drive's rotation order, without repeats. */
  order: string[]
  current: string
  sets: ValidatorSet[]
  /** The proposer of the block the answer is at. */
  lastProposer: string
}

/** One evonode's next turn: the block it is due to propose, counted from the block the answer is at (1 = the next). */
export interface ProposerTurn {
  proTxHash: string
  slot: number
}

/**
 * The turn order from the validator sets, mirroring Drive's `validator_set_update_v2` and Tenderdash's proposer
 * selection, as Radar's crawl does: the rest of the active set after the last proposer, then each other set in
 * rotation order (wrapping, never into the two oldest when there are more than ten), each in ProTx order. Banned
 * members are skipped. Each evonode is listed once, at its first turn.
 *
 * It assumes every turn is taken: a proposer that misses its turn, or a set that rotates early, shifts what follows.
 */
export function proposerTurns(q: ValidatorSets): ProposerTurn[] {
  const byHash = new Map(q.sets.map((s) => [s.quorumHash, s]))
  const listed = new Set<string>()
  const order = q.order.filter((h) => byHash.has(h) && !listed.has(h) && listed.add(h))
  const out: ProposerTurn[] = []
  if (order.length === 0) return out
  const seen = new Set<string>()
  let slot = 0
  const turn = (m: ValidatorMember) => {
    slot++
    if (!seen.has(m.proTxHash)) {
      seen.add(m.proTxHash)
      out.push({ proTxHash: m.proTxHash, slot })
    }
  }
  const found = order.indexOf(q.current)
  const current = found < 0 ? 0 : found
  const rotatable = order.length > 10 ? order.length - 2 : order.length
  for (const m of byHash.get(order[current]!)!.members) {
    if (!m.banned && m.proTxHash > q.lastProposer) turn(m)
  }
  // Drive moves on from a set among the two oldest to the first, so then every rotatable set is next.
  const others = current < rotatable ? rotatable - 1 : rotatable
  let index = current
  for (let i = 0; i < others; i++) {
    index = index + 1 >= rotatable ? 0 : index + 1
    for (const m of byHash.get(order[index]!)!.members) if (!m.banned) turn(m)
  }
  return out
}
