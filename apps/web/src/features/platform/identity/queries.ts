import { infiniteQueryOptions } from '@tanstack/react-query'
import { dataClass, viewKeys } from '@/data/query'
import { sdk } from '@/data/sdk'
import type { NetworkId } from '@/lib/network'

const VOTES_PAGE = 25

/** Contested-resource votes the identity cast, a page at a time; each page starts after the last vote of the one before. */
export const identityVotesQuery = (net: NetworkId, identityId: string) =>
  infiniteQueryOptions({
    queryKey: viewKeys(net, 'identity-votes', { identityId }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      sdk.call(
        net,
        'voting.contestedResourceIdentityVotes',
        pageParam === undefined
          ? { identityId, limit: VOTES_PAGE }
          : { identityId, limit: VOTES_PAGE, startAtVoteId: pageParam, startAtIncluded: false },
        signal,
      ),
    getNextPageParam: (last) =>
      last.data.length >= VOTES_PAGE ? last.data[last.data.length - 1]?.voteId : undefined,
    ...dataClass('live'),
  })

/**
 * The identities that share a public key hash. A page starts after the last identity of the one before; the first
 * page starts after `after` when the address names one. An empty page is the end.
 */
export const keyHashMatchesQuery = (net: NetworkId, pkh: string, after: string | undefined) =>
  infiniteQueryOptions({
    queryKey: viewKeys(net, 'identity-key-matches', { pkh, after }),
    initialPageParam: after,
    queryFn: ({ pageParam, signal }) =>
      sdk.call(
        net,
        'identities.byNonUniquePublicKeyHash',
        pageParam === undefined ? { pkh } : { pkh, startAfter: pageParam },
        signal,
      ),
    getNextPageParam: (last) => last.data[last.data.length - 1]?.id,
    ...dataClass('structural'),
  })
