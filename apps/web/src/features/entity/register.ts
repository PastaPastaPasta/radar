import { registerHoverCard } from '@/ui/base'
import { lazyCard } from './cards/lazy'
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
  registerHoverCard(
    'block',
    lazyCard(() => import('./cards/block').then((m) => m.BlockHoverCard)),
  )
  registerHoverCard(
    'tx',
    lazyCard(() => import('./cards/tx').then((m) => m.TxHoverCard)),
  )
  registerHoverCard(
    'address',
    lazyCard(() => import('./cards/address').then((m) => m.AddressHoverCard)),
  )
}
