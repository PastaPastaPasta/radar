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
  registerHoverCard(
    'masternode',
    lazyCard(() => import('./cards/masternode').then((m) => m.MasternodeHoverCard)),
  )
  registerHoverCard(
    'evonode',
    lazyCard(() => import('./cards/masternode').then((m) => m.MasternodeHoverCard)),
  )
  registerHoverCard(
    'identity',
    lazyCard(() => import('./cards/identity').then((m) => m.IdentityHoverCard)),
  )
  registerHoverCard(
    'contract',
    lazyCard(() => import('./cards/contract').then((m) => m.ContractHoverCard)),
  )
  registerHoverCard(
    'token',
    lazyCard(() => import('./cards/token').then((m) => m.TokenHoverCard)),
  )
  registerHoverCard(
    'document',
    lazyCard(() => import('./cards/document').then((m) => m.DocumentHoverCard)),
  )
  registerHoverCard(
    'name',
    lazyCard(() => import('./cards/name').then((m) => m.NameHoverCard)),
  )
  registerHoverCard(
    'epoch',
    lazyCard(() => import('./cards/epoch').then((m) => m.EpochHoverCard)),
  )
  registerHoverCard(
    'platform-block',
    lazyCard(() => import('./cards/platform-block').then((m) => m.PlatformBlockHoverCard)),
  )
  registerHoverCard(
    'transition',
    lazyCard(() => import('./cards/transition').then((m) => m.TransitionHoverCard)),
  )
  registerHoverCard(
    'platform-address',
    lazyCard(() => import('./cards/platform-address').then((m) => m.PlatformAddressHoverCard)),
  )
  registerHoverCard(
    'contest',
    lazyCard(() => import('./cards/contest').then((m) => m.ContestHoverCard)),
  )
}
