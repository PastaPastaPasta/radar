import type { NetworkId } from '@/lib/network'
import type { Classified } from './classify'
import { localStamp } from './resolvers/helpers'
import type { SearchHit } from './types'

const LABELS = { mainnet: 'a mainnet', testnet: 'a testnet' } as const

function hintLabel(net: NetworkId): string {
  if (net === 'mainnet' || net === 'testnet') return LABELS[net]
  return `a ${net}`
}

function networkName(net: NetworkId): string {
  if (net === 'mainnet') return 'Mainnet'
  if (net === 'testnet') return 'Testnet'
  return net
}

/** The single hit for an address whose prefix names another network. */
export function networkHintHit(c: Classified): SearchHit | undefined {
  const target = c.networkHint
  if (!target) return undefined
  const platform = c.classes.includes('platform-address')
  const core = c.classes.includes('core-address')
  if (!platform && !core) return undefined
  const noun = platform ? 'Platform address' : 'address'
  return {
    kind: platform ? 'platform-address' : 'address',
    id: c.normalized,
    title: `This is ${hintLabel(target)} ${noun}`,
    subtitle: `Open on ${networkName(target)}`,
    href: platform
      ? {
          to: '/platform-address/$addr',
          params: { addr: c.normalized },
          search: { network: target },
        }
      : { to: '/address/$address', params: { address: c.normalized }, search: { network: target } },
    stamp: localStamp(),
    rank: 100,
  }
}
