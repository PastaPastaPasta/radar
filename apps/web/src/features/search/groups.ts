import type { EntityKind } from '@/ui'

export type HitGroup = 'core' | 'network' | 'platform'

export const GROUP_LABELS: Record<HitGroup, string> = {
  core: 'Core',
  network: 'Network',
  platform: 'Platform',
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

export function groupHits<T extends { kind: EntityKind }>(hits: T[]): [HitGroup, T[]][] {
  const order: HitGroup[] = ['core', 'network', 'platform']
  return order.flatMap((g) => {
    const items = hits.filter((h) => groupOf(h.kind) === g)
    return items.length > 0 ? [[g, items] as [HitGroup, T[]]] : []
  })
}
