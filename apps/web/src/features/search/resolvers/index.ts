import type { Resolver } from '../types'
import { blocksOnDate } from './date'
import { coreAddress } from './core-address'
import { heights } from './height'
import { masternodeAddress } from './masternode-address'
import { nameLabel } from './name'
import { platformAddress } from './platform-address'
import { publicKeyHash } from './public-key-hash'

export const resolvers: Resolver[] = [
  coreAddress,
  platformAddress,
  blocksOnDate,
  heights,
  publicKeyHash,
  masternodeAddress,
  nameLabel,
]
