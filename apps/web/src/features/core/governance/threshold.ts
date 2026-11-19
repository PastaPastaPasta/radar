import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import type { DapiMnEntry } from '@/data/core/types'
import { mapSourced, stampOf, type SourceStamp } from '@/data/envelope'
import { withBudget, type SuperblockBudget } from '@/data/governance-budget'
import type { HyProposal } from '@/data/hyphen/schemas'
import { insQueries } from '@/data/insight/queries'
import type { NetworkId } from '@/lib/network'

/**
 * A masternode's vote weight by its list type, as Dash Core's `GetMnType(...).voting_weight`: 1 for a regular masternode,
 * 4 for an evonode since Dash Core 19. A type this table doesn't know (a later one, such as DIP-26's shared-collateral
 * types once DAPI lists them) weighs 0, as Core gives a type it doesn't know, until its weight is added here.
 */
const VOTE_WEIGHT: Readonly<Record<number, number>> = { 0: 1, 1: 4 }

/** Dash Core's `nGovernanceMinQuorum`: 10 on mainnet, 1 on testnet and devnets. */
const minQuorum = (net: NetworkId): number => (net === 'mainnet' ? 10 : 1)

export interface FundingThreshold {
  /** Net yes votes a proposal needs. */
  votes: number
  /** The valid masternodes' votes, by weight. */
  weighted: number
  regular: number
  evonodes: number
  /** True when a tenth of the weighted votes is below the minimum quorum, so the minimum is what applies. */
  minimum: boolean
}

/**
 * Dash Core's rule (`getgovernanceinfo`'s `fundingthreshold`): a proposal passes when its yes votes less its no votes
 * reach a tenth of the valid masternodes' weighted votes, rounded down, and never fewer than the minimum quorum.
 */
export function fundingThreshold(
  list: Iterable<Pick<DapiMnEntry, 'type' | 'isValid'>>,
  net: NetworkId,
): FundingThreshold {
  let regular = 0
  let evonodes = 0
  let weighted = 0
  for (const mn of list) {
    if (!mn.isValid) continue
    weighted += VOTE_WEIGHT[mn.type] ?? 0
    if (mn.type === 0) regular++
    else if (mn.type === 1) evonodes++
  }
  const tenth = Math.floor(weighted / 10)
  const floor = minQuorum(net)
  return { votes: Math.max(floor, tenth), weighted, regular, evonodes, minimum: tenth < floor }
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

/** What the next superblock can pay and when, from Core through Insight; undefined while unknown. */
export function useSuperblockBudget(
  net: NetworkId,
): { budget: SuperblockBudget; source: SourceStamp } | undefined {
  const query = useQuery(insQueries.superblockBudget(net))
  const budget = query.data?.data
  return query.data && budget ? { budget, source: stampOf(query.data) } : undefined
}

/** Which index a proposal was read from, which says what its own threshold figure is worth. */
export type ProposalIndex = 'hyphen' | 'insight'

/**
 * A proposal measured against Dash Core's threshold. With DAPI's list, Radar's own figure decides. Until then, Insight's
 * `fundingthreshold` is Core's own and stands; Hyphen's figure divides the unweighted count, so its threshold is left
 * unknown and its `funded` flag, Core's `fCachedFunding` (the weighted rule, as Core last worked it out), decides.
 */
export function withThreshold(
  p: HyProposal,
  threshold: FundingThreshold | undefined,
  index: ProposalIndex,
): HyProposal {
  if (threshold) {
    return {
      ...p,
      fundingThreshold: threshold.votes,
      meetsFundingThreshold: p.votes.yes - p.votes.no >= threshold.votes,
    }
  }
  if (index === 'insight') return p
  return {
    ...p,
    fundingThreshold: null,
    meetsFundingThreshold: p.funded ?? p.meetsFundingThreshold,
  }
}

/**
 * Every proposal's Passing and Funded: the threshold first, then the next superblock's budget over the proposals that
 * pass, so one that no longer passes leaves its share to the next.
 */
export function fundingView(
  list: readonly HyProposal[],
  threshold: FundingThreshold | undefined,
  index: ProposalIndex,
  budget: SuperblockBudget | undefined,
): HyProposal[] {
  return withBudget(
    list.map((p) => withThreshold(p, threshold, index)),
    budget,
  )
}
