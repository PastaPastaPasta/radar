import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import type { DapiMnEntry } from '@/data/core/types'
import { mapSourced, stampOf, type SourceStamp } from '@/data/envelope'
import type { HyProposal } from '@/data/hyphen/schemas'
import type { NetworkId } from '@/lib/network'

/** An evonode's vote counts four times since Dash Core 19. */
export const EVONODE_VOTE_WEIGHT = 4

/** Dash Core's `nGovernanceMinQuorum`: 10 on mainnet, 1 on testnet and devnets. */
const minQuorum = (net: NetworkId): number => (net === 'mainnet' ? 10 : 1)

export interface FundingThreshold {
  /** Net yes votes a proposal needs. */
  votes: number
  /** The valid masternodes' votes, each evonode counted four times. */
  weighted: number
  regular: number
  evonodes: number
}

/**
 * Dash Core's rule (`getgovernanceinfo`'s `fundingthreshold`): a proposal is funded when its yes votes less its no votes
 * reach a tenth of the valid masternodes' weighted votes, rounded down, and never fewer than the minimum quorum.
 */
export function fundingThreshold(
  list: Iterable<Pick<DapiMnEntry, 'type' | 'isValid'>>,
  net: NetworkId,
): FundingThreshold {
  let regular = 0
  let evonodes = 0
  for (const mn of list) {
    if (!mn.isValid) continue
    if (mn.type === 1) evonodes++
    else regular++
  }
  const weighted = regular + EVONODE_VOTE_WEIGHT * evonodes
  return { votes: Math.max(minQuorum(net), Math.floor(weighted / 10)), weighted, regular, evonodes }
}

/** The threshold from DAPI's masternode list, and where it came from; undefined until the list has answered. */
export function useFundingThreshold(
  net: NetworkId,
): { threshold: FundingThreshold; source: SourceStamp } | undefined {
  const query = useQuery({
    ...coreQueries.masternodeList(net),
    select: (s) => mapSourced(s, (list) => fundingThreshold(list.values(), net)),
  })
  return query.data ? { threshold: query.data.data, source: stampOf(query.data) } : undefined
}

/**
 * A proposal measured against Dash Core's threshold instead of the index's own figure (Hyphen divides the unweighted
 * count). It can be in the budget only while it passes.
 */
export function withThreshold(p: HyProposal, threshold: FundingThreshold | undefined): HyProposal {
  if (!threshold) return p
  const meets = p.votes.yes - p.votes.no >= threshold.votes
  return {
    ...p,
    fundingThreshold: threshold.votes,
    meetsFundingThreshold: meets,
    funded: p.funded == null ? p.funded : p.funded && meets,
  }
}
