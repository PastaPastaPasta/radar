import { registerHoverCard } from '@/ui'
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
}
