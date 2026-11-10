import type { NetworkId } from '@/lib/network'
import { hyphen } from '@/data/hyphen/client'
import { hyQueries } from '@/data/hyphen/queries'
import { hyKeys } from '@/data/query/keys'
import { cursorPages } from '../hy-shared/queries'

export const PROPOSAL_LIMIT = 100
export const VOTE_LIMIT = 25

export const governanceQueries = {
  proposals: (net: NetworkId) => hyQueries.proposals(net, { limit: PROPOSAL_LIMIT }),
  proposal: hyQueries.proposal,
  votes: (net: NetworkId, hash: string) =>
    cursorPages({
      key: hyKeys(net, 'proposal-votes-pages', { hash: hash.toLowerCase() }),
      fetchPage: (cursor, signal) =>
        hyphen.proposalVotes(net, hash, { limit: VOTE_LIMIT, cursor }, signal),
    }),
}
