import type { PTokenMethods } from '../../methods'
import type { ImplOf } from './types'

/** The part of `EvoSDK` this package's methods read. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface PTokenReads {}

type Impl<M extends keyof PTokenMethods> = ImplOf<PTokenReads, M>

export const pTokenImpl: { [M in keyof PTokenMethods]: Impl<M> } = {}
