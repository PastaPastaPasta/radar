import type { PChainMethods } from '../../methods'
import type { ImplOf } from './types'

/** The part of `EvoSDK` this package's methods read. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface PChainReads {}

type Impl<M extends keyof PChainMethods> = ImplOf<PChainReads, M>

export const pChainImpl: { [M in keyof PChainMethods]: Impl<M> } = {}
