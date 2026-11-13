import type { ToolsMethods } from '../../methods'
import type { ImplOf } from './types'

/** The part of `EvoSDK` this package's methods read. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface ToolsReads {}

type Impl<M extends keyof ToolsMethods> = ImplOf<ToolsReads, M>

export const toolsImpl: { [M in keyof ToolsMethods]: Impl<M> } = {}
