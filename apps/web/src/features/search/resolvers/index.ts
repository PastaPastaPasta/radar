import type { Resolver } from '../types'
import { blocksOnDate } from './date'
import { coreAddress } from './core-address'
import { dapiBlock } from './dapi-block'
import { dapiTx } from './dapi-tx'
import { heights } from './height'
import { hyAddress } from './hy-address'
import { hySearch } from './hy-search'
import { nameLabel } from './name'
import { platformAddress } from './platform-address'
import { publicKeyHash } from './public-key-hash'
import { radarMasternodeByAddress } from './radar-masternode'
import { dapiMasternode } from './dapi-masternode'
import { sdkEpoch } from './epoch'
import { pePlatformBlock } from './platform-block'
import { peSearch } from './pe-search'
import { sdkContract, sdkDocument, sdkIdentity, sdkToken } from './sdk-entities'
import { sdkDpnsName } from './sdk-dpns-name'
import { sdkTransition } from './sdk-transition'
import { wellKnown } from './well-known'

export const resolvers: Resolver[] = [
  coreAddress,
  platformAddress,
  blocksOnDate,
  heights,
  publicKeyHash,
  radarMasternodeByAddress,
  nameLabel,
  hyAddress,
  hySearch,
  dapiBlock,
  dapiTx,
  sdkEpoch,
  pePlatformBlock,
  sdkTransition,
  sdkIdentity,
  sdkContract,
  sdkToken,
  sdkDocument,
  dapiMasternode,
  sdkDpnsName,
  wellKnown,
  peSearch,
]
