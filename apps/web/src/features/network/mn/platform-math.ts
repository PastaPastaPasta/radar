// The payout rule follows dash-nodes' proof check of an evonode's rewards (MIT, github.com/PastaPastaPasta/dash-nodes).
import type { FinalizedEpochDto } from '@/data/sdk/methods'
import { CREDITS_PER_DASH } from '@/lib/units'

/** Credits as a number of DASH, for charts and sentences. */
export const dash = (credits: bigint): number => Number(credits) / Number(CREDITS_PER_DASH)

export type Finalized = Pick<
  FinalizedEpochDto,
  | 'index'
  | 'totalBlocks'
  | 'coreBlockRewards'
  | 'totalProcessingFees'
  | 'totalDistributedStorageFees'
  | 'blockProposers'
>

/** Blocks one evonode proposed in a finalized epoch (0 when it proposed none). */
export const blocksIn = (info: Finalized, protx: string): bigint =>
  info.blockProposers.get(protx.toLowerCase()) ?? 0n

/**
 * What an evonode was paid for a finalized epoch, the way Drive pays it: in identifier order, pool × blocks / total
 * rounded down, the last proposer also getting what the divisions left.
 */
export function payoutIn(info: Finalized, protx: string): bigint {
  const id = protx.toLowerCase()
  const pool = info.totalProcessingFees + info.totalDistributedStorageFees + info.coreBlockRewards
  const total = BigInt(info.totalBlocks)
  const list = [...info.blockProposers].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  let left = pool
  for (const [i, [key, blocks]] of list.entries()) {
    const share = total > 0n ? (pool * blocks) / total : 0n
    left -= share
    if (key === id) return i === list.length - 1 ? share + left : share
  }
  return 0n
}

/** Rank among the proposers by blocks (1 is the most; equal counts share a rank), or null when it proposed none. */
export function rankIn(info: Finalized, protx: string): { rank: number; of: number } | null {
  const mine = blocksIn(info, protx)
  if (mine === 0n) return null
  let ahead = 0
  for (const blocks of info.blockProposers.values()) if (blocks > mine) ahead++
  return { rank: ahead + 1, of: info.blockProposers.size }
}

export interface EpochRow {
  epoch: number
  sdkBlocks: bigint
  sdkPaid: bigint
  radarBlocks: number | null
  radarPaid: bigint | null
  matches: boolean | null
}

/** The SDK's finalized epochs set against what Radar recorded for the same epochs. */
export function compareEpochs(
  infos: readonly Finalized[],
  radar: readonly { epoch: number; blocks: number; credits: bigint }[],
  protx: string,
): EpochRow[] {
  const ours = new Map(radar.map((e) => [e.epoch, e]))
  return infos
    .map((info) => {
      const theirs = ours.get(info.index)
      const sdkBlocks = blocksIn(info, protx)
      const sdkPaid = payoutIn(info, protx)
      const radarBlocks = theirs?.blocks ?? (sdkBlocks === 0n ? 0 : null)
      const radarPaid = theirs?.credits ?? (sdkPaid === 0n ? 0n : null)
      return {
        epoch: info.index,
        sdkBlocks,
        sdkPaid,
        radarBlocks,
        radarPaid,
        matches:
          radarBlocks === null || radarPaid === null
            ? null
            : BigInt(radarBlocks) === sdkBlocks && radarPaid === sdkPaid,
      }
    })
    .sort((a, b) => b.epoch - a.epoch)
}

/** The 10th and 90th percentile of last epoch's evonode rewards, with the median, from Radar's census. */
export function spreadOf(
  values: readonly bigint[],
): { p10: bigint; p50: bigint; p90: bigint } | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const at = (f: number): bigint => sorted[Math.round((sorted.length - 1) * f)] ?? 0n
  return { p10: at(0.1), p50: at(0.5), p90: at(0.9) }
}

/** A withdrawal document's status as Drive numbers it. */
export const WITHDRAWAL_STATUS = ['queued', 'pooled', 'broadcast', 'complete', 'expired'] as const
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUS)[number] | 'unknown'

export interface Withdrawal {
  id: string
  amount: bigint
  status: WithdrawalStatus
  createdAt: number | null
  updatedAt: number | null
}

const toBigint = (v: unknown): bigint => {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v)
  return 0n
}

export function withdrawalOf(doc: {
  id: string
  createdAt: number | null
  updatedAt: number | null
  data: Record<string, unknown>
}): Withdrawal {
  const s = doc.data.status
  return {
    id: doc.id,
    amount: toBigint(doc.data.amount),
    status: typeof s === 'number' ? (WITHDRAWAL_STATUS[s] ?? 'unknown') : 'unknown',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
