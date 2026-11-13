import { msg, t } from '@lingui/core/macro'
import { stampOf } from '@/data/envelope'
import { decentralizedOnly } from '@/lib/source-mode'
import type { Resolver } from '../types'
import { serviceHost } from './radar-masternode'
import { shortId } from './helpers'

/**
 * A masternode by ProTx hash or service address from the DAPI masternode list. Where Radar answers (all sources), its
 * resolver and Hyphen's cover this, so the list is read only in Decentralized only mode, when they are off.
 */
export const dapiMasternode: Resolver = {
  id: 'dapi-masternode',
  accepts: ['hex64', 'ip'],
  cost: 'dapi',
  what: msg`Masternodes`,
  async resolve(c, { net, signal }) {
    if (!decentralizedOnly()) return []
    const { core } = await import('@/data/core/client')
    const list = await core.masternodeList(net, signal)
    const stamp = stampOf(list)
    const byHash = c.classes.includes('hex64')
    const wanted = byHash ? undefined : serviceHost(c.normalized)
    return [...list.data.values()]
      .filter((m) => {
        if (byHash) return m.proRegTxHash.toLowerCase() === c.normalized
        const have = serviceHost(m.service.toLowerCase())
        return have.host === wanted?.host && (wanted.port === null || have.port === wanted.port)
      })
      .slice(0, 5)
      .map((m) => {
        const evo = m.type === 1
        const protx = m.proRegTxHash.toLowerCase()
        const where = m.service || shortId(protx)
        return {
          kind: evo ? ('evonode' as const) : ('masternode' as const),
          id: protx,
          title: evo ? t`Evonode ${where}` : t`Masternode ${where}`,
          subtitle: m.isValid ? t`Enabled` : t`PoSe banned`,
          href: { to: '/mn/$protx' as const, params: { protx } },
          stamp,
          rank: 100,
        }
      })
  },
}
