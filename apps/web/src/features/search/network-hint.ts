import { networkName } from '@/features/entity'
import type { Classified } from './classify'
import { localStamp } from './resolvers/helpers'
import type { SearchHit } from './types'

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
    title: `This is a ${target} ${noun}`,
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
