import type { SdkMethodName } from '../methods'
import { netCImpl, type NetCReads } from './impl/net-c'
import { pBlocksImpl, type PBlocksReads } from './impl/p-blocks'
import { pChainImpl, type PChainReads } from './impl/p-chain'
import { pDataImpl, type PDataReads } from './impl/p-data'
import { pIdImpl, type PIdReads } from './impl/p-id'
import { pTokenImpl, type PTokenReads } from './impl/p-token'
import { pVoteImpl, type PVoteReads } from './impl/p-vote'
import { sharedImpl, type SharedReads } from './impl/shared'
import { toolsImpl, type ToolsReads } from './impl/tools'
import type { ImplOf } from './impl/types'

export type { Freeable, ImplOutput, ProvedResponse } from './impl/types'

/** The part of `EvoSDK` Radar reads from: each file declares the facade members it calls. Writes are not here. */
export type SdkReads = SharedReads &
  NetCReads &
  PChainReads &
  PBlocksReads &
  PIdReads &
  PDataReads &
  PTokenReads &
  PVoteReads &
  ToolsReads

export const impl: { [M in SdkMethodName]: ImplOf<SdkReads, M> } = {
  ...sharedImpl,
  ...netCImpl,
  ...pChainImpl,
  ...pBlocksImpl,
  ...pIdImpl,
  ...pDataImpl,
  ...pTokenImpl,
  ...pVoteImpl,
  ...toolsImpl,
}
