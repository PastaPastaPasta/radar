import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { RadarChange } from '@/data/radar/schemas'

export const CHANGE_KINDS = ['joins', 'pose', 'address', 'keys'] as const
export type ChangeKind = (typeof CHANGE_KINDS)[number]
export type KindFilter = 'all' | ChangeKind

/** The fields Radar records, grouped the way the filter offers them. */
const FIELDS: Record<ChangeKind, readonly string[]> = {
  joins: ['registered', 'removed', 'returned'],
  pose: ['pose'],
  address: ['service', 'platform_p2p', 'platform_https'],
  keys: [
    'payout_address',
    'operator_payout_address',
    'owner_address',
    'voting_address',
    'pubkey_operator',
    'platform_node_id',
    'operator_reward',
  ],
}

export const KIND_LABEL: Record<KindFilter, MessageDescriptor> = {
  all: msg`Everything`,
  joins: msg`Registrations and removals`,
  pose: msg`PoSe bans and revivals`,
  address: msg`Address changes`,
  keys: msg`Payout and key changes`,
}

export const FIELD_LABEL: Record<string, MessageDescriptor> = {
  registered: msg`Registered`,
  removed: msg`Left the list`,
  returned: msg`Back in the list`,
  service: msg`Core P2P address`,
  platform_p2p: msg`Platform P2P address`,
  platform_https: msg`Platform HTTPS address`,
  platform_node_id: msg`Platform node ID`,
  payout_address: msg`Payout address`,
  operator_payout_address: msg`Operator payout address`,
  owner_address: msg`Owner address`,
  voting_address: msg`Voting address`,
  pubkey_operator: msg`Operator key`,
  operator_reward: msg`Operator reward`,
  pose: msg`PoSe status`,
}

export function matchesKind(field: string, kind: KindFilter): boolean {
  return kind === 'all' || FIELDS[kind].includes(field)
}

export const kindOf = (field: string): ChangeKind | undefined =>
  CHANGE_KINDS.find((k) => FIELDS[k].includes(field))

export type ChangeTone = 'success' | 'warning' | 'danger' | 'neutral'

/** Bans stand out; revivals and joins read as good news; a removal is a loss. */
export function changeTone(c: Pick<RadarChange, 'field' | 'new'>): ChangeTone {
  if (c.field === 'pose') return c.new === 'enabled' ? 'success' : 'warning'
  if (c.field === 'registered' || c.field === 'returned') return 'success'
  if (c.field === 'removed') return 'danger'
  return 'neutral'
}

const short = (v: string, n = 10): string =>
  v.length <= 2 * n + 1 ? v : `${v.slice(0, n)}…${v.slice(-n)}`

/** What a stored value shows as; `banned at <height>` is turned into words by the caller through `words.banned`. */
export function valueText(
  field: string,
  v: unknown,
  words: { enabled: string; banned: (height: string) => string },
): string {
  if (v == null || v === '') return '–'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (field === 'pose') {
    if (s === 'enabled') return words.enabled
    const m = /^banned at (\d+)$/.exec(s)
    return m ? words.banned(m[1]!) : s
  }
  if (field === 'operator_reward') return `${s}%`
  if (field === 'pubkey_operator' || field === 'platform_node_id') return short(s)
  return s
}
