import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { mapSourced } from '@/data/envelope'
import { hyPages } from '@/data/hyphen/pages'
import { hyQueries } from '@/data/hyphen/queries'
import { insQueries } from '@/data/insight/queries'

const PROPOSAL_LIMIT = 100
const VOTE_LIMIT = 25

/** Insight's proposal list, and one proposal picked from it. */
export const insightGovernanceQueries = {
  proposals: insQueries.proposalPage,
  proposal: (net: NetworkId, hash: string) =>
    queryOptions({
      ...insQueries.proposalPage(net),
      select: (page) =>
        mapSourced(page, (p) => p.items.find((x) => x.hash === hash.toLowerCase()) ?? null),
    }),
}

export const governanceQueries = {
  proposals: (net: NetworkId) => hyQueries.proposals(net, { limit: PROPOSAL_LIMIT }),
  proposal: hyQueries.proposal,
  votes: (net: NetworkId, hash: string) => hyPages.proposalVotes(net, hash, VOTE_LIMIT),
}
