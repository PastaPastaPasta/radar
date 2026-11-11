import { t } from '@lingui/core/macro'
import { stampOf, type SourceStamp } from '@/data/envelope'
import type { HySearch } from '@/data/hyphen/schemas'
import { isDevnet } from '@/lib/network'
import type { Resolver, SearchHit } from '../types'

const MIN_TEXT = 4
const MAX_NAMED_PROPOSALS = 5

type Found = HySearch['value'][number]

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** Hyphen names the hash `blockHash` or `txHash` on a hit, and `hash` on proposals. */
function hashOf(hit: Found): string | undefined {
  const fields = hit as Record<string, unknown>
  return str(fields.hash) ?? str(fields.blockHash) ?? str(fields.txHash) ?? str(fields.proTxHash)
}

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`

function hitFor(found: Found, exact: boolean, stamp: SourceStamp): SearchHit | undefined {
  const rank = exact ? 100 : 50
  switch (found.type) {
    case 'address':
      return {
        kind: 'address',
        id: found.address,
        title: found.address,
        subtitle: t`Core address`,
        href: { to: '/address/$address', params: { address: found.address } },
        stamp,
        rank,
      }
    case 'block': {
      const hash = hashOf(found)
      if (!hash) return undefined
      return {
        kind: 'block',
        id: hash,
        title: t`Block ${short(hash)}`,
        subtitle: t`Core block`,
        href: { to: '/block/$id', params: { id: hash } },
        stamp,
        rank,
      }
    }
    case 'tx': {
      const hash = hashOf(found)
      if (!hash) return undefined
      return {
        kind: 'tx',
        id: hash,
        title: t`Transaction ${short(hash)}`,
        subtitle: t`Core transaction`,
        href: { to: '/tx/$txid', params: { txid: hash } },
        stamp,
        rank,
      }
    }
    case 'validator': {
      const hash = hashOf(found)
      if (!hash) return undefined
      return {
        kind: 'masternode',
        id: hash,
        title: t`Masternode ${short(hash)}`,
        subtitle: t`Masternode`,
        href: { to: '/mn/$protx', params: { protx: hash } },
        stamp,
        rank,
      }
    }
    case 'proposal':
      return {
        kind: 'proposal',
        id: found.hash,
        title: t`Proposal ${short(found.hash)}`,
        subtitle: t`Governance proposal`,
        href: { to: '/governance/$hash', params: { hash: found.hash } },
        stamp,
        rank,
      }
  }
}

/**
 * Hyphen's own search: blocks, transactions, masternodes, proposals and addresses by hash or by text.
 * It sends what was typed to Hyphen, so it is an `index` resolver and never runs for input the classifier
 * flags as a secret. A plain number is a height, which the height resolvers answer.
 */
export const hySearch: Resolver = {
  id: 'hy-search',
  accepts: ['hex64', 'text', 'dpns'],
  cost: 'index',
  async resolve(c, { net, signal }) {
    if (c.warning || isDevnet(net)) return []
    if (c.classes[0] === 'int' || c.classes.includes('date')) return []
    const q = c.normalized
    if (q.length < MIN_TEXT && !c.classes.includes('hex64')) return []
    const { hyLookups } = await import('@/data/hyphen/lookups')
    const found = await hyLookups.search(net, q, signal)
    if (!found.data) return []
    const stamp = stampOf(found)
    const exact = c.classes.includes('hex64')
    const hits = found.data.value
      .map((f) => hitFor(f, exact, stamp))
      .filter((h): h is SearchHit => h !== undefined)

    const named = hits.filter((h) => h.kind === 'proposal').slice(0, MAX_NAMED_PROPOSALS)
    await Promise.all(
      named.map(async (h) => {
        try {
          const p = await hyLookups.proposal(net, h.id, signal)
          if (p.data) h.title = p.data.name
        } catch {
          // the hash is still a usable label
        }
      }),
    )
    return hits
  },
}
