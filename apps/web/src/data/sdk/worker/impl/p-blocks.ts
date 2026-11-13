import type { PBlocksMethods } from '../../methods'
import type { ImplOf } from './types'

/** The part of `EvoSDK` this package's methods read. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface PBlocksReads {}

type Impl<M extends keyof PBlocksMethods> = ImplOf<PBlocksReads, M>

export const pBlocksImpl: { [M in keyof PBlocksMethods]: Impl<M> } = {}
