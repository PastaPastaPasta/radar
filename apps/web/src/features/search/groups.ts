import { msg } from '@lingui/core/macro'
import { i18n } from '@lingui/core'
import type { EntityKind } from '@/ui'

export type HitGroup = 'core' | 'network' | 'platform'

const GROUP_LABELS = {
  core: msg`Core`,
  network: msg`Network`,
  platform: msg`Platform`,
}

export function groupLabel(group: HitGroup): string {
  return i18n._(GROUP_LABELS[group])
}

const GROUP_OF: Record<EntityKind, HitGroup> = {
  block: 'core',
  tx: 'core',
  address: 'core',
  proposal: 'core',
  masternode: 'network',
  evonode: 'network',
  epoch: 'network',
  quorum: 'network',
  'platform-block': 'platform',
  transition: 'platform',
  identity: 'platform',
  contract: 'platform',
  document: 'platform',
  token: 'platform',
  name: 'platform',
  'platform-address': 'platform',
  group: 'platform',
  contest: 'platform',
}

/** The order kinds appear in inside a group: the chain first, then what lives on it. */
const KIND_ORDER: EntityKind[] = [
  'block',
  'tx',
  'address',
  'proposal',
  'masternode',
  'evonode',
  'epoch',
  'quorum',
  'platform-block',
  'transition',
  'identity',
  'name',
  'contest',
  'contract',
  'token',
  'document',
  'platform-address',
  'group',
]

const kindRank = (kind: EntityKind) => KIND_ORDER.indexOf(kind)

/** The hits of one kind, best first. */
export interface KindRun<T> {
  kind: EntityKind
  items: T[]
}

/** A group's hits split by kind, the kind with the best hit first (`KIND_ORDER` breaks ties); each kind keeps its rank order. */
export function kindRuns<T extends { kind: EntityKind; rank?: number }>(items: T[]): KindRun<T>[] {
  const best = (kind: EntityKind) =>
    Math.max(...items.filter((h) => h.kind === kind).map((h) => h.rank ?? 0))
  const kinds = [...new Set(items.map((h) => h.kind))].sort(
    (a, b) => best(b) - best(a) || kindRank(a) - kindRank(b),
  )
  return kinds.map((kind) => ({ kind, items: items.filter((h) => h.kind === kind) }))
}

/** Results the sources confirmed, grouped; readings nobody confirmed come back apart as guesses. */
export function groupHits<T extends { kind: EntityKind; rank?: number; speculative?: boolean }>(
  hits: T[],
): { groups: [HitGroup, T[]][]; guesses: T[] } {
  const order: HitGroup[] = ['core', 'network', 'platform']
  const confirmed = hits.filter((h) => !h.speculative)
  const groups = order.flatMap((g) => {
    const items = kindRuns(confirmed.filter((h) => GROUP_OF[h.kind] === g)).flatMap((r) => r.items)
    return items.length > 0 ? [[g, items] as [HitGroup, T[]]] : []
  })
  return { groups, guesses: hits.filter((h) => h.speculative) }
}
