/**
 * Where the network switch takes a visitor from the page they are on. The bar proposes the same address on the other
 * network; this keeps that for a list, search or tool, carries an identifier that can exist on both networks, and turns
 * a record that cannot (a ProTx, a transaction, a block, an epoch) into a search for it on the network they chose.
 */

/** Routes whose one record may exist on any network: its id is the same, and so is the page. */
const SAME_ID_DROPS: Record<string, readonly string[]> = {
  '/identity/$id': ['contract', 'type', 'tokens', 'page'],
  '/contract/$id/': ['type', 'owner', 'rev', 'path', 'base', 'from', 'to', 'page'],
  '/contract/$id/documents/$type': ['where', 'order', 'after', 'prev'],
  '/token/$id/': ['who', 'page'],
  '/token/$id/holders': ['ids', 'page'],
  '/name/$label': [],
  '/contest/$label': ['towards', 'page'],
  '/groups/$contract': [],
}

/** Routes whose record belongs to one network, and the route parameter a search for it starts from. */
const SEARCH_FOR: Record<string, string> = {
  '/mn/$protx': 'protx',
  '/tx/$txid': 'txid',
  '/block/$id': 'id',
  '/block-index/$height': 'height',
  '/address/$address': 'address',
  '/platform/block/$id': 'id',
  '/platform/tx/$hash': 'hash',
  '/platform-address/$addr': 'addr',
  '/document/$contract/$type/$id': 'id',
  '/group/$contract/$pos': 'contract',
  '/governance/$hash': 'hash',
}

/** A record that has no counterpart elsewhere, where the list of its kind is the nearest page that has. */
const LIST_INSTEAD: Record<string, string> = { '/epoch/$n': '/epochs' }

/** Filters on a list that name something of the network the visitor leaves. */
const LIST_DROPS: Record<string, readonly string[]> = {
  '/platform/blocks': ['height', 'epoch', 'proposer'],
  '/platform/txs': ['owner'],
  '/epochs': ['from', 'to'],
  '/shielded': ['nf'],
  '/quorums': ['q'],
}

/** Cursors and entity-scoped fields no page keeps across networks. */
const ALWAYS_DROPPED = ['after', 'prev', 'before', 'epoch']

const CARRIED = ['network', 'sources']

export interface SwitchMatch {
  routeId: string
  params: Readonly<Record<string, string | undefined>>
}

export type SwitchKind = 'keep' | 'same-id' | 'search' | 'list'

export interface SwitchTarget {
  kind: SwitchKind
  url: URL
}

function carried(from: URL, path: string): URL {
  const url = new URL(path, from)
  for (const key of CARRIED) {
    const value = from.searchParams.get(key)
    if (value !== null) url.searchParams.set(key, value)
  }
  return url
}

function without(url: URL, fields: readonly string[]): URL {
  const out = new URL(url)
  for (const field of fields) out.searchParams.delete(field)
  return out
}

/** `proposed` is the address the bar offers: the current page with the other network in it. */
export function switchTarget(proposed: URL, match: SwitchMatch): SwitchTarget {
  const same = SAME_ID_DROPS[match.routeId]
  if (same) return { kind: 'same-id', url: without(proposed, [...ALWAYS_DROPPED, ...same]) }

  const key = SEARCH_FOR[match.routeId]
  const value = key === undefined ? undefined : match.params[key]
  if (value) {
    const url = carried(proposed, '/search')
    url.searchParams.set('q', value)
    return { kind: 'search', url }
  }

  const list = LIST_INSTEAD[match.routeId]
  if (list) return { kind: 'list', url: carried(proposed, list) }

  const drops = LIST_DROPS[match.routeId] ?? []
  return { kind: 'keep', url: without(proposed, [...ALWAYS_DROPPED, ...drops]) }
}
