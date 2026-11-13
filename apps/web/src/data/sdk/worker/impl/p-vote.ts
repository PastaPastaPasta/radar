import type { PVoteMethods } from '../../methods'
import { idText } from '../convert'
import type { Freeable, ImplOf, ProvedResponse } from './types'

type IdLike = { toString(): string } | string

type ContenderDto =
  PVoteMethods['voting.contestedResourceVoteState']['result']['contenders'][number]
type ContestWinnerDto = NonNullable<
  PVoteMethods['voting.contestedResourceVoteState']['result']['winner']
>

/** A contender as the SDK hands it over: the class has the id and tally, and nests the same pair under `contender`. */
export interface ContenderLike extends Freeable {
  identityId: IdLike
  voteTally?: number | bigint | null
}

export interface WinnerLike extends Freeable {
  kind?: string
  identityId?: IdLike | null
  block?: { timeMs?: bigint | number; height?: bigint | number } | null
}

export interface VoteStateLike extends Freeable {
  contenders: ContenderLike[]
  abstainVoteTally?: number | bigint | null
  lockVoteTally?: number | bigint | null
  winner?: WinnerLike | null
}

interface ContestQuery {
  dataContractId: string
  documentTypeName: string
  indexName: string
  indexValues: string[]
}

/** The part of `EvoSDK` this package's methods read. */
export interface PVoteReads {
  group: {
    contestedResourcesWithProof(query: {
      dataContractId: string
      documentTypeName: string
      indexName: string
      startIndexValues?: string[]
      startAtValue?: string
      startAtValueIncluded?: boolean
      limit?: number
      orderAscending?: boolean
    }): Promise<ProvedResponse<unknown[]>>
    contestedResourceVotersForIdentityWithProof(
      query: ContestQuery & {
        contestantId: string
        limit?: number
        startAtVoterId?: string
        startAtIncluded?: boolean
        orderAscending?: boolean
      },
    ): Promise<ProvedResponse<IdLike[]>>
  }
  voting: {
    contestedResourceVoteStateWithProof(
      query: ContestQuery & {
        resultType?: 'documents' | 'voteTally' | 'documentsAndVoteTally'
        limit?: number
        includeLockedAndAbstaining?: boolean
      },
    ): Promise<ProvedResponse<VoteStateLike>>
  }
}

type Impl<M extends keyof PVoteMethods> = ImplOf<PVoteReads, M>

const count = (n: number | bigint | null | undefined): number | null =>
  n === undefined || n === null ? null : Number(n)

const valueText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v))

const contenderDto = (c: ContenderLike): ContenderDto => ({
  identityId: idText(c.identityId),
  voteTally: count(c.voteTally),
})

function winnerDto(w: WinnerLike | null | undefined): ContestWinnerDto | null {
  if (!w) return null
  const kind =
    w.kind === 'WonByIdentity' || w.kind === 'won'
      ? 'won'
      : w.kind === 'Locked' || w.kind === 'locked'
        ? 'locked'
        : 'none'
  return {
    kind,
    ...(w.identityId ? { identityId: idText(w.identityId) } : {}),
    ...(w.block?.timeMs === undefined ? {} : { timeMs: Number(w.block.timeMs) }),
    ...(w.block?.height === undefined ? {} : { height: Number(w.block.height) }),
  }
}

const queryOf = (a: {
  contractId: string
  type: string
  index: string
  indexValues: string[]
}): ContestQuery => ({
  dataContractId: a.contractId,
  documentTypeName: a.type,
  indexName: a.index,
  indexValues: a.indexValues,
})

export const pVoteImpl: { [M in keyof PVoteMethods]: Impl<M> } = {
  async 'group.contestedResources'(sdk, args) {
    const response = await sdk.group.contestedResourcesWithProof({
      dataContractId: args.contractId,
      documentTypeName: args.type,
      indexName: args.index,
      ...(args.prefix ? { startIndexValues: args.prefix } : {}),
      ...(args.startAt === undefined ? {} : { startAtValue: args.startAt }),
      ...(args.startAtIncluded === undefined ? {} : { startAtValueIncluded: args.startAtIncluded }),
      ...(args.limit === undefined ? {} : { limit: args.limit }),
      ...(args.orderAscending === undefined ? {} : { orderAscending: args.orderAscending }),
    })
    return { data: response.data.map(valueText), response }
  },

  async 'voting.contestedResourceVoteState'(sdk, args) {
    const response = await sdk.voting.contestedResourceVoteStateWithProof({
      ...queryOf(args),
      resultType: 'documentsAndVoteTally',
      includeLockedAndAbstaining: true,
    })
    const state = response.data
    const data = {
      contenders: state.contenders.map(contenderDto),
      abstainVotes: count(state.abstainVoteTally),
      lockVotes: count(state.lockVoteTally),
      winner: winnerDto(state.winner),
    }
    state.free?.()
    return { data, response }
  },

  async 'voting.contestedResourceVotersForIdentity'(sdk, args) {
    const response = await sdk.group.contestedResourceVotersForIdentityWithProof({
      ...queryOf(args),
      contestantId: args.contestantId,
      ...(args.limit === undefined ? {} : { limit: args.limit }),
      ...(args.startAfter === undefined
        ? {}
        : { startAtVoterId: args.startAfter, startAtIncluded: false }),
      ...(args.orderAscending === undefined ? {} : { orderAscending: args.orderAscending }),
    })
    return { data: response.data.map(idText), response }
  },
}
