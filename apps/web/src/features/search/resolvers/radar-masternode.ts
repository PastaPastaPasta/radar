import { msg, t } from '@lingui/core/macro'
import { stampOf, type SourceStamp } from '@/data/envelope'
import type { RadarMasternode } from '@/data/radar/schemas'
import { isDevnet } from '@/lib/network'
import type { Resolver, SearchHit } from '../types'

const MAX_HITS = 5

/** `host:port`, `[v6]:port` or a bare host. */
export function serviceHost(service: string): { host: string; port: string | null } {
  const v6 = /^(\[[^\]]+\])(?::(\d+))?$/.exec(service)
  if (v6) return { host: v6[1] ?? service, port: v6[2] ?? null }
  const i = service.lastIndexOf(':')
  return i > 0 && service.indexOf(':') === i
    ? { host: service.slice(0, i), port: service.slice(i + 1) }
    : { host: service, port: null }
}

function hitFor(m: RadarMasternode, stamp: SourceStamp): SearchHit {
  const evo = m.type === 'Evo'
  const where = m.service ?? m.protx.slice(0, 10)
  return {
    kind: evo ? 'evonode' : 'masternode',
    id: m.protx,
    title: evo ? t`Evonode ${where}` : t`Masternode ${where}`,
    subtitle: m.status === 'pose_banned' ? t`PoSe banned` : t`Enabled`,
    href: { to: '/mn/$protx', params: { protx: m.protx } },
    stamp,
    rank: 100,
  }
}

/** The masternodes whose service address is the one typed; a typed port narrows it, a bare address matches any port. */
export const radarMasternodeByAddress: Resolver = {
  id: 'radar-masternode-address',
  accepts: ['ip'],
  cost: 'index',
  what: msg`Masternodes by address`,
  async resolve(c, { net, signal }) {
    if (isDevnet(net)) return []
    const wanted = serviceHost(c.normalized)
    const { radarLookups } = await import('@/data/radar/lookups')
    const list = await radarLookups.masternodes(net, signal)
    const stamp = stampOf(list)
    return list.data
      .filter((m) => {
        if (!m.service) return false
        const have = serviceHost(m.service.toLowerCase())
        return have.host === wanted.host && (wanted.port === null || have.port === wanted.port)
      })
      .slice(0, MAX_HITS)
      .map((m) => hitFor(m, stamp))
  },
}
