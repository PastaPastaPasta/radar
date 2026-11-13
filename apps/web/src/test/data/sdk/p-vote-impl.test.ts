import { describe, expect, it, vi } from 'vitest'
import { P_VOTE_CLASSES } from '@/data/sdk/methods/p-vote'
import { pVoteImpl, type PVoteReads } from '@/data/sdk/worker/impl/p-vote'
import { proved } from './fakes'

const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const A = 'BMJWm8wKmbApR7nQ6q7RG3HgD8maJ8t7B4yWBKRe7aZ6'
const B = 'CUaJuBYgwXBCLarN2Gfnnve7SvaM8zvqiQ5PEUztHh4H'
const ref = {
  contractId: CONTRACT,
  type: 'domain',
  index: 'parentNameAndLabel',
  indexValues: ['dash', 'reza'],
}

const reads = (over: Partial<Record<keyof PVoteReads, unknown>>) => over as unknown as PVoteReads

describe('contested resources', () => {
  it('lists the values after a prefix, in order, as text', async () => {
    const contestedResourcesWithProof = vi.fn(() => Promise.resolve(proved(['0-0', '000', 'reza'])))
    const out = await pVoteImpl['group.contestedResources'](
      reads({ group: { contestedResourcesWithProof } }),
      {
        contractId: CONTRACT,
        type: 'domain',
        index: 'parentNameAndLabel',
        prefix: ['dash'],
        startAt: 'reza',
        startAtIncluded: false,
        limit: 3,
        orderAscending: true,
      },
    )
    expect(out.data).toEqual(['0-0', '000', 'reza'])
    expect(out.response).toBeDefined()
    expect(contestedResourcesWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      documentTypeName: 'domain',
      indexName: 'parentNameAndLabel',
      startIndexValues: ['dash'],
      startAtValue: 'reza',
      startAtValueIncluded: false,
      limit: 3,
      orderAscending: true,
    })
  })

  it('sends only the arguments it was given', async () => {
    const contestedResourcesWithProof = vi.fn(() => Promise.resolve(proved([])))
    await pVoteImpl['group.contestedResources'](reads({ group: { contestedResourcesWithProof } }), {
      contractId: CONTRACT,
      type: 'domain',
      index: 'parentNameAndLabel',
    })
    expect(contestedResourcesWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      documentTypeName: 'domain',
      indexName: 'parentNameAndLabel',
    })
  })
})

describe('contest vote state', () => {
  const state = (over: Record<string, unknown> = {}) => ({
    contenders: [
      { identityId: { toString: (): string => A }, voteTally: 16 },
      { identityId: B, voteTally: undefined },
    ],
    abstainVoteTally: 2,
    lockVoteTally: undefined,
    winner: undefined,
    free: vi.fn(),
    ...over,
  })

  it('asks with the tallies of every choice and gives plain contenders and counts', async () => {
    const contestedResourceVoteStateWithProof = vi.fn(() => Promise.resolve(proved(state())))
    const out = await pVoteImpl['voting.contestedResourceVoteState'](
      reads({ voting: { contestedResourceVoteStateWithProof } }),
      ref,
    )
    expect(contestedResourceVoteStateWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      documentTypeName: 'domain',
      indexName: 'parentNameAndLabel',
      indexValues: ['dash', 'reza'],
      resultType: 'documentsAndVoteTally',
      includeLockedAndAbstaining: true,
    })
    expect(out.data).toEqual({
      contenders: [
        { identityId: A, voteTally: 16 },
        { identityId: B, voteTally: null },
      ],
      abstainVotes: 2,
      lockVotes: null,
      winner: null,
    })
  })

  it.each([
    ['WonByIdentity', 'won'],
    ['Locked', 'locked'],
    ['NoWinner', 'none'],
  ])('reads a %s winner as %s, with the block it was decided in', async (kind, expected) => {
    const winner = {
      kind,
      identityId: kind === 'WonByIdentity' ? A : undefined,
      block: { timeMs: 1729160581367n, height: 22560n },
    }
    const out = await pVoteImpl['voting.contestedResourceVoteState'](
      reads({
        voting: {
          contestedResourceVoteStateWithProof: () => Promise.resolve(proved(state({ winner }))),
        },
      }),
      ref,
    )
    expect(out.data.winner).toEqual({
      kind: expected,
      ...(kind === 'WonByIdentity' ? { identityId: A } : {}),
      timeMs: 1729160581367,
      height: 22560,
    })
  })
})

describe('contest voters', () => {
  it('resumes after a voter, excluding it, and gives identity text', async () => {
    const contestedResourceVotersForIdentityWithProof = vi.fn(() =>
      Promise.resolve(proved([A, { toString: (): string => B }])),
    )
    const out = await pVoteImpl['voting.contestedResourceVotersForIdentity'](
      reads({ group: { contestedResourceVotersForIdentityWithProof } }),
      { ...ref, contestantId: A, limit: 26, startAfter: B },
    )
    expect(out.data).toEqual([A, B])
    expect(contestedResourceVotersForIdentityWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      documentTypeName: 'domain',
      indexName: 'parentNameAndLabel',
      indexValues: ['dash', 'reza'],
      contestantId: A,
      limit: 26,
      startAtVoterId: B,
      startAtIncluded: false,
    })
  })
})

describe('data classes', () => {
  it('treat every contest read as live', () => {
    expect(Object.values(P_VOTE_CLASSES)).toEqual(['live', 'live', 'live'])
  })
})
