import { queryOptions } from '@tanstack/react-query'
import { dataClass, viewKeys } from '@/data/query'
import { sdk } from '@/data/sdk'
import type { NetworkId } from '@/lib/network'

const VOTES_PAGE = 25

/** One page of the contested-resource votes the identity cast: the page after the vote `after`, or the first. */
export const identityVotesPage = (net: NetworkId, identityId: string, after: string | undefined) =>
  queryOptions({
    queryKey: viewKeys(net, 'identity-votes', { identityId, after }),
    queryFn: ({ signal }) =>
      sdk.call(
        net,
        'voting.contestedResourceIdentityVotes',
        after === undefined
          ? { identityId, limit: VOTES_PAGE }
          : { identityId, limit: VOTES_PAGE, startAtVoteId: after, startAtIncluded: false },
        signal,
      ),
    ...dataClass('live'),
  })

/** The vote the page after this one starts after, or undefined at the end. */
export const nextVotesCursor = (page: { data: { voteId: string }[] }): string | undefined =>
  page.data.length >= VOTES_PAGE ? page.data[page.data.length - 1]?.voteId : undefined

/** One page of the identities that share a public key hash, after the identity `after` or from the start. */
export const keyHashMatchesPage = (net: NetworkId, pkh: string, after: string | undefined) =>
  queryOptions({
    queryKey: viewKeys(net, 'identity-key-matches', { pkh, after }),
    queryFn: ({ signal }) =>
      sdk.call(
        net,
        'identities.byNonUniquePublicKeyHash',
        after === undefined ? { pkh } : { pkh, startAfter: after },
        signal,
      ),
    ...dataClass('structural'),
  })
