import type { NetCMethods } from '../../methods'
import type { ImplOf } from './types'

/** The part of `EvoSDK` this package's methods read. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface NetCReads {}

type Impl<M extends keyof NetCMethods> = ImplOf<NetCReads, M>

export const netCImpl: { [M in keyof NetCMethods]: Impl<M> } = {}
