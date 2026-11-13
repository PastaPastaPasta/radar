import type { PDataMethods } from '../../methods'
import type { ImplOf } from './types'

/** The part of `EvoSDK` this package's methods read. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface PDataReads {}

type Impl<M extends keyof PDataMethods> = ImplOf<PDataReads, M>

export const pDataImpl: { [M in keyof PDataMethods]: Impl<M> } = {}
