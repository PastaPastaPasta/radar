import { t } from '@lingui/core/macro'
import {
  wellKnownContracts,
  wellKnownIdentities,
  wellKnownTokens,
  SYSTEM_IDENTITY,
} from '@/lib/well-known'
import type { Resolver, SearchHit } from '../types'
import { localStamp, shortId } from './helpers'

const MIN_TEXT = 3

/** The contracts, tokens and identities Radar names, found by name or symbol: it needs no network. */
export const wellKnown: Resolver = {
  id: 'local-well-known',
  accepts: ['text', 'dpns'],
  cost: 'local',
  resolve(c, { net }) {
    const q = c.normalized.toLowerCase()
    if (q.length < MIN_TEXT) return Promise.resolve([])
    const stamp = localStamp()
    const hits: SearchHit[] = []
    for (const k of wellKnownContracts(net)) {
      if (!k.name.toLowerCase().includes(q) && k.key !== q) continue
      hits.push({
        kind: 'contract',
        id: k.id,
        title: k.name,
        subtitle: k.description,
        href: { to: '/contract/$id', params: { id: k.id } },
        stamp,
        rank: k.name.toLowerCase() === q ? 90 : 50,
      })
    }
    for (const k of wellKnownTokens(net)) {
      const names = [k.symbol, k.name].map((n) => n.toLowerCase())
      if (!names.some((n) => n.includes(q))) continue
      const contract = shortId(k.contractId)
      hits.push({
        kind: 'token',
        id: k.id,
        title: k.symbol,
        subtitle: t`In contract ${contract}`,
        href: { to: '/token/$id', params: { id: k.id } },
        stamp,
        rank: names.includes(q) ? 90 : 50,
      })
    }
    for (const k of wellKnownIdentities(net)) {
      if (!k.name.toLowerCase().includes(q)) continue
      hits.push({
        kind: 'identity',
        id: k.id,
        title: k.name,
        subtitle: k.id === SYSTEM_IDENTITY ? k.description : shortId(k.id),
        href: { to: '/identity/$id', params: { id: k.id } },
        stamp,
        rank: k.name.toLowerCase() === q ? 90 : 50,
      })
    }
    return Promise.resolve(hits)
  },
}
