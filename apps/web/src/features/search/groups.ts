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

export function groupOf(kind: EntityKind): HitGroup {
  return GROUP_OF[kind]
}

/** Results the sources confirmed, grouped; readings nobody confirmed come back apart as guesses. */
export function groupHits<T extends { kind: EntityKind; speculative?: boolean }>(
  hits: T[],
): { groups: [HitGroup, T[]][]; guesses: T[] } {
  const order: HitGroup[] = ['core', 'network', 'platform']
  const confirmed = hits.filter((h) => !h.speculative)
  const groups = order.flatMap((g) => {
    const items = confirmed.filter((h) => groupOf(h.kind) === g)
    return items.length > 0 ? [[g, items] as [HitGroup, T[]]] : []
  })
  return { groups, guesses: hits.filter((h) => h.speculative) }
}
