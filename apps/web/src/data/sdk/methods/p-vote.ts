import type { DataClass } from '@/lib/data-class'

export interface ContenderDto {
  identityId: string
  /** Votes towards this contender; absent when the node left the tally out. */
  voteTally: number | null
}

/** How a finished contest ended: `won` by `identityId`, `locked` (the name stays unregistered) or `none` (no winner chosen). */
export interface ContestWinnerDto {
  kind: 'won' | 'locked' | 'none'
  identityId?: string
  /** The Platform block time and height at which the contest was decided. */
  timeMs?: number
  height?: number
}

export interface ContestVoteStateDto {
  contenders: ContenderDto[]
  abstainVotes: number | null
  lockVotes: number | null
  winner: ContestWinnerDto | null
}

export interface ContestRefArgs {
  contractId: string
  type: string
  index: string
  indexValues: string[]
}

export interface PVoteMethods {
  /**
   * The values the contested index takes after `prefix`, ordered, one page: for DPNS and prefix `["dash"]` the labels
   * of every contest ever held, open or decided. `startAt` is the last value of the page before.
   */
  'group.contestedResources': {
    args: {
      contractId: string
      type: string
      index: string
      prefix?: string[]
      startAt?: string
      startAtIncluded?: boolean
      limit?: number
      orderAscending?: boolean
    }
    result: string[]
  }
  /** Contenders with their tallies, the abstain and lock tallies, and the winner once the contest is decided. */
  'voting.contestedResourceVoteState': { args: ContestRefArgs; result: ContestVoteStateDto }
  /** The identities that voted for one contender, in identity order; `startAfter` is the last voter of the page before. */
  'voting.contestedResourceVotersForIdentity': {
    args: ContestRefArgs & {
      contestantId: string
      limit?: number
      startAfter?: string
      orderAscending?: boolean
    }
    result: string[]
  }
}

export const P_VOTE_CLASSES = {
  'group.contestedResources': 'live',
  'voting.contestedResourceVoteState': 'live',
  'voting.contestedResourceVotersForIdentity': 'live',
} as const satisfies Record<keyof PVoteMethods, DataClass>
