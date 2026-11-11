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
]
