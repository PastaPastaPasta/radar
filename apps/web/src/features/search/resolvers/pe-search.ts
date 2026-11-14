import { msg, t } from '@lingui/core/macro'
import { stampOf, type SourceStamp } from '@/data/envelope'
import type { PeSearch } from '@/data/pe/schemas'
import { formatInt } from '@/lib/format'
import { isDevnet, type NetworkId } from '@/lib/network'
import { wellKnownLabel } from '@/lib/well-known'
import type { Resolver, SearchHit } from '../types'
import { dpnsLabel, fetchLookup, isNumeric, shortId } from './helpers'

const MIN_TEXT = 3
const PER_KIND = 5

const same = (a: string | null | undefined, b: string) => a?.toLowerCase() === b.toLowerCase()

/**
 * Platform Explorer's indexed search, mapped to one hit per entity. Each kind keeps at most five matches; a
 * match on the typed ID or hash ranks as exact, a name match by what was typed, the rest as text.
 */
function peSearchHits(found: PeSearch, q: string, stamp: SourceStamp, net: NetworkId): SearchHit[] {
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  const add = (hit: SearchHit) => {
    const key = `${hit.kind}:${hit.id}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push(hit)
  }
  const take = <T>(rows: T[] | null | undefined): T[] => (rows ?? []).slice(0, PER_KIND)

  for (const b of take(found.blocks)) {
    const height = String(b.header.height)
    const label = formatInt(b.header.height)
    add({
      kind: 'platform-block',
      id: height,
      title: t`Platform block ${label}`,
      subtitle: shortId(b.header.hash.toLowerCase()),
      href: { to: '/platform/block/$id', params: { id: height } },
      stamp,
      rank: 100,
    })
  }

  for (const tx of take(found.transactions)) {
    const hash = tx.hash.toLowerCase()
    const type = tx.type
    add({
      kind: 'transition',
      id: hash,
      title: t`State transition ${shortId(hash)}`,
      subtitle: type,
      href: { to: '/platform/tx/$hash', params: { hash } },
      stamp,
      rank: 100,
    })
  }

  for (const v of take(found.validators)) {
    const protx = v.proTxHash.toLowerCase()
    const where = shortId(protx)
    add({
      kind: 'evonode',
      id: protx,
      title: t`Evonode ${where}`,
      subtitle: t`Platform validator`,
      href: { to: '/mn/$protx', params: { protx } },
      stamp,
      rank: 100,
    })
  }

  for (const i of take(found.identities)) {
    const alias = i.alias ?? undefined
    const rank = same(i.identifier, q)
      ? 100
      : alias && same(dpnsLabel(alias), dpnsLabel(q))
        ? 80
        : 50
    add({
      kind: 'identity',
      id: i.identifier,
      title:
        alias ??
        wellKnownLabel(net, 'identity', i.identifier) ??
        t`Identity ${shortId(i.identifier)}`,
      subtitle: alias ? shortId(i.identifier) : undefined,
      href: { to: '/identity/$id', params: { id: i.identifier } },
      stamp,
      rank,
    })
    if (!alias) continue
    const label = dpnsLabel(alias)
    const ownerId = shortId(i.identifier)
    add({
      kind: 'name',
      id: label,
      title: alias,
      subtitle: t`Name of identity ${ownerId}`,
      href: { to: '/name/$label', params: { label } },
      stamp,
      rank,
    })
    const status = i.status as { contested?: unknown } | null | undefined
    if (status?.contested === true) {
      add({
        kind: 'contest',
        id: label,
        title: t`Contest for ${alias}`,
        subtitle: t`A contested name: masternodes vote on who gets it`,
        href: { to: '/contest/$label', params: { label } },
        stamp,
        rank: rank - 10,
      })
    }
  }

  for (const c of take(found.dataContracts)) {
    const known = wellKnownLabel(net, 'contract', c.identifier)
    add({
      kind: 'contract',
      id: c.identifier,
      title: c.name ?? known ?? t`Contract ${shortId(c.identifier)}`,
      subtitle:
        c.description ?? (c.keywords.length > 0 ? c.keywords.join(', ') : shortId(c.identifier)),
      href: { to: '/contract/$id', params: { id: c.identifier } },
      stamp,
      rank: same(c.identifier, q) ? 100 : same(c.name, q) ? 80 : 50,
    })
  }

  for (const tok of take(found.tokens)) {
    const names = tok.localizations ? Object.values(tok.localizations) : []
    const name = names[0]?.singularForm
    const contract = shortId(tok.dataContractIdentifier)
    add({
      kind: 'token',
      id: tok.identifier,
      title:
        name ?? wellKnownLabel(net, 'token', tok.identifier) ?? t`Token ${shortId(tok.identifier)}`,
      subtitle: tok.description ?? t`In contract ${contract}`,
      href: { to: '/token/$id', params: { id: tok.identifier } },
      stamp,
      rank: same(tok.identifier, q) ? 100 : same(name, q) ? 80 : 50,
    })
  }

  for (const d of take(found.documents)) {
    if (!d.dataContractIdentifier || !d.documentTypeName) continue
    const type = d.documentTypeName
    const contract = shortId(d.dataContractIdentifier)
    add({
      kind: 'document',
      id: `${d.dataContractIdentifier}/${type}/${d.identifier}`,
      title: t`Document ${shortId(d.identifier)}`,
      subtitle: t`${type} in contract ${contract}`,
      href: {
        to: '/document/$contract/$type/$id',
        params: { contract: d.dataContractIdentifier, type, id: d.identifier },
      },
      stamp,
      rank: same(d.identifier, q) ? 100 : 50,
    })
  }

  for (const a of take(found.platformAddresses)) {
    add({
      kind: 'platform-address',
      id: a.bech32mAddress,
      title: a.bech32mAddress,
      subtitle: t`Platform address`,
      href: { to: '/platform-address/$addr', params: { addr: a.bech32mAddress } },
      stamp,
      rank: same(a.bech32mAddress, q) ? 100 : 50,
    })
  }
  return hits
}

export const peSearch: Resolver = {
  id: 'pe-search',
  accepts: ['hex64', 'base58-id', 'text', 'dpns'],
  cost: 'index',
  what: msg`Platform Explorer’s search`,
  async resolve(c, { net, signal }) {
    if (c.warning || isDevnet(net) || isNumeric(c)) return []
    const q = c.normalized
    const exactShape = c.classes.includes('hex64') || c.classes.includes('base58-id')
    if (q.length < MIN_TEXT && !exactShape) return []
    const { peQueries } = await import('@/data/pe/queries')
    const answer = await fetchLookup(peQueries.search(net, q), signal)
    if (!answer.data) return []
    return peSearchHits(answer.data, q, stampOf(answer), net)
  },
}
