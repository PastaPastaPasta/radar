import type { NetworkId } from '@/lib/network'
import { hyPages } from '@/data/hyphen/pages'
import { hyQueries } from '@/data/hyphen/queries'

export const PROPOSAL_LIMIT = 100
export const VOTE_LIMIT = 25

export const governanceQueries = {
  proposals: (net: NetworkId) => hyQueries.proposals(net, { limit: PROPOSAL_LIMIT }),
  proposal: hyQueries.proposal,
  votes: (net: NetworkId, hash: string) => hyPages.proposalVotes(net, hash, VOTE_LIMIT),
}
