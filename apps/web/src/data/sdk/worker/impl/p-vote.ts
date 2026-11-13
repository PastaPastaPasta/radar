import type { PVoteMethods } from '../../methods'
import type { ImplOf } from './types'

/** The part of `EvoSDK` this package's methods read. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface PVoteReads {}

type Impl<M extends keyof PVoteMethods> = ImplOf<PVoteReads, M>

export const pVoteImpl: { [M in keyof PVoteMethods]: Impl<M> } = {}
