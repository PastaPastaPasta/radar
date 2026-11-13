import type { PIdMethods } from '../../methods'
import type { ImplOf } from './types'

/** The part of `EvoSDK` this package's methods read. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface PIdReads {}

type Impl<M extends keyof PIdMethods> = ImplOf<PIdReads, M>

export const pIdImpl: { [M in keyof PIdMethods]: Impl<M> } = {}
