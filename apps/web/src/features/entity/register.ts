import { registerHoverCard } from '@/ui'
import { AddressHoverCard } from './cards/address'
import { BlockHoverCard } from './cards/block'
import { TxHoverCard } from './cards/tx'
import { GenericHoverCard } from './GenericHoverCard'

const KINDS = [
  'block',
  'tx',
  'address',
  'masternode',
  'evonode',
  'proposal',
  'platform-block',
  'transition',
  'identity',
  'contract',
  'document',
  'token',
  'name',
  'platform-address',
  'epoch',
  'quorum',
  'group',
  'contest',
] as const

let registered = false

export function registerEntityHoverCards(): void {
  if (registered) return
  registered = true
  for (const kind of KINDS) registerHoverCard(kind, GenericHoverCard(kind))
  registerHoverCard('block', BlockHoverCard)
  registerHoverCard('tx', TxHoverCard)
  registerHoverCard('address', AddressHoverCard)
}
