import { base58Decode } from '@/lib/base58'
import { bytesToHex } from '@/lib/hex'
import type { PeValidator } from '../pe/schemas'
import type { RadarPlatform } from '../radar/schemas'
import type { MnRow } from './rows'
import { parseSort, sortItems, type SortValue } from './sort'

export type RadarEvonode = RadarPlatform['evonodes'][number]
export type PlatformFilter = 'all' | 'proposed' | 'not-in-set' | 'vote-not-counted'
export type ValidatorState = 'active' | 'queued' | 'banned'

/** One evonode of the Platform view: its masternode row joined with Radar's Platform record and Platform Explorer's. */
export interface EvoRow {
  protx: string
  row: MnRow
  radar: RadarEvonode | null
  validator: PeValidator | null
  /** `null` while no source has said; PoSe-banned wins over everything else. */
  state: ValidatorState | null
  /** Blocks proposed this epoch: the SDK's count wins over Radar's. */
  blocks: number | null
}

/** The SDK's answer for the rows asked: an evonode it names no block for proposed none. */
export interface ProposedBlocks {
  asked: ReadonlySet<string>
  counts: ReadonlyMap<string, bigint>
}

export interface EvoSources {
  platform?: RadarPlatform | undefined
  /** Platform Explorer's active validators; absent when it was not asked or did not answer. */
  validators?: readonly PeValidator[] | undefined
  proposed?: ProposedBlocks | undefined
}

export function buildEvoRows(rows: readonly MnRow[], sources: EvoSources): EvoRow[] {
  const radar = new Map(sources.platform?.evonodes.map((e) => [e.protx, e]))
  const validators = sources.validators
    ? new Map(sources.validators.map((v) => [v.proTxHash, v]))
    : undefined
  return rows
    .filter((r) => r.type === 'evo')
    .map((row) => {
      const record = radar.get(row.protx) ?? null
      const validator = validators?.get(row.protx) ?? null
      const state: ValidatorState | null =
        row.status === 'pose-banned'
          ? 'banned'
          : validators
            ? validator
              ? 'active'
              : 'queued'
            : null
      const counted = sources.proposed?.asked.has(row.protx)
        ? Number(sources.proposed.counts.get(row.protx) ?? 0n)
        : null
      return {
        protx: row.protx,
        row,
        radar: record,
        validator,
        state,
        blocks: counted ?? record?.epoch_blocks ?? null,
      }
    })
}

const stateRank: Record<ValidatorState, number> = { active: 3, queued: 2, banned: 1 }
const num = (n: bigint | number | null | undefined): number | null => (n == null ? null : Number(n))

export const EVO_SORT_KEYS = [
  'evonode',
  'node_id',
  'drive',
  'validator',
  'blocks_epoch',
  'blocks_total',
  'last_block',
  'last_epoch',
  'd30',
  'monthly',
  'balance',
  'next',
  'vote',
] as const

export type EvoSortKey = (typeof EVO_SORT_KEYS)[number]

export const isEvoSortKey = (key: string): key is EvoSortKey =>
  (EVO_SORT_KEYS as readonly string[]).includes(key)

const valueOf: Record<EvoSortKey, (e: EvoRow) => SortValue> = {
  evonode: (e) => e.protx,
  node_id: (e) => e.row.registration?.platformNodeId ?? null,
  drive: (e) => e.radar?.drive ?? null,
  validator: (e) => (e.state ? stateRank[e.state] : null),
  blocks_epoch: (e) => e.blocks,
  blocks_total: (e) => e.validator?.proposedBlocksAmount ?? null,
  last_block: (e) => e.validator?.lastProposedBlockHeader?.height ?? null,
  last_epoch: (e) => num(e.radar?.last_epoch),
  d30: (e) => num(e.radar?.d30),
  monthly: (e) => num(e.radar?.monthly),
  balance: (e) => num(e.radar?.balance),
  next: (e) => e.radar?.next ?? null,
  vote: (e) => e.radar?.vote ?? null,
}

/** Radar's default for this table is the estimated monthly earnings, highest first. */
export const DEFAULT_EVO_SORT = '-monthly'

export const parseEvoSort = (sort: string, fallback = DEFAULT_EVO_SORT) =>
  parseSort(sort, isEvoSortKey, parseSort(fallback, isEvoSortKey, { key: 'evonode', desc: false }))

export function sortEvoRows(rows: readonly EvoRow[], sort: string, fallback?: string): EvoRow[] {
  const { key, desc } = parseEvoSort(sort, fallback)
  return sortItems(rows, desc, valueOf[key], (e) => e.protx)
}

/** An evonode's identity id is its ProTx in base58: the ProTx a base58 id stands for, if the text is one. */
export function protxOfIdentity(text: string): string | undefined {
  if (!/^[1-9A-HJ-NP-Za-km-z]{42,44}$/.test(text)) return undefined
  try {
    const bytes = base58Decode(text)
    return bytes.length === 32 ? bytesToHex(bytes) : undefined
  } catch {
    return undefined
  }
}

export interface EvoFilter {
  q?: string | undefined
  pf: PlatformFilter
  /** The protocol version being voted for, while an upgrade vote is open. */
  candidate?: number | null | undefined
}

export function filterEvoRows(rows: readonly EvoRow[], filter: EvoFilter): EvoRow[] {
  const q = filter.q?.trim()
  const lower = q?.toLowerCase()
  const identity = q ? protxOfIdentity(q) : undefined
  return rows.filter((e) => {
    if (filter.pf === 'proposed' && !hasProposed(e)) return false
    if (filter.pf === 'not-in-set' && !notInSet(e)) return false
    if (filter.pf === 'vote-not-counted' && !voteNotCounted(e, filter.candidate)) return false
    if (!lower) return true
    return (
      e.protx.includes(lower) ||
      (identity !== undefined && e.protx === identity) ||
      (e.row.service ?? '').includes(lower) ||
      (e.radar?.drive ?? '').toLowerCase().includes(lower) ||
      (e.validator?.identity ?? '').toLowerCase().includes(lower)
    )
  })
}

function hasProposed(e: EvoRow): boolean {
  return (e.blocks ?? 0) > 0
}

/** Enabled, and either Platform Explorer lists it as queued or Radar sees no turn coming for it. */
function notInSet(e: EvoRow): boolean {
  if (e.row.status !== 'enabled') return false
  return e.state === null ? e.radar !== null && !e.radar.next : e.state === 'queued'
}

function voteNotCounted(e: EvoRow, candidate: number | null | undefined): boolean {
  return (
    candidate != null &&
    e.row.status === 'enabled' &&
    (e.radar?.supports ?? 0) >= candidate &&
    e.radar?.vote !== candidate
  )
}

/** How many rows each filter option would show, for the option labels. */
export function evoFilterCounts(rows: readonly EvoRow[], candidate?: number | null) {
  return {
    all: rows.length,
    proposed: rows.filter(hasProposed).length,
    'not-in-set': rows.filter(notInSet).length,
    'vote-not-counted': rows.filter((e) => voteNotCounted(e, candidate)).length,
  } satisfies Record<PlatformFilter, number>
}
