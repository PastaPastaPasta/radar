/**
 * Platform produces a block at least every few minutes, sooner when there are transitions to include. A node that has
 * not seen one for twice that is behind; five times that, it has stopped.
 */
export const EXPECTED_BLOCK_MS = 3 * 60_000
const LAGGING_AFTER = 2
const STALLED_AFTER = 5

/** Core finds a block every 2.6 minutes and ChainLocks it within moments; Platform follows the lock. */
const LAGGING_CORE_BLOCKS = 6
const STALLED_CORE_BLOCKS = 24

export type PlatformHealthState = 'live' | 'lagging' | 'stalled'

export type PlatformReason =
  | { kind: 'no-block'; ageMs: number }
  | { kind: 'catching-up' }
  | { kind: 'no-peers' }
  | { kind: 'core-behind'; blocks: number }

export interface PlatformHealthInput {
  /** When Platform's last block was made, from the answering node. */
  lastBlockMs: number
  catchingUp: boolean
  peers: number
  /** The Core height Platform has locked to, and Core's own tip as DAPI reports it. */
  coreChainLockedHeight: number
  coreTip: number | undefined
  now: number
}

const RANK: Record<PlatformHealthState, number> = { live: 0, lagging: 1, stalled: 2 }

/** Live, Lagging or Stalled, and the reasons for anything but Live. */
export function platformHealth(input: PlatformHealthInput): {
  state: PlatformHealthState
  reasons: PlatformReason[]
} {
  const reasons: PlatformReason[] = []
  let state: PlatformHealthState = 'live'
  const raise = (to: PlatformHealthState) => {
    if (RANK[to] > RANK[state]) state = to
  }

  const age = Math.max(0, input.now - input.lastBlockMs)
  if (age > EXPECTED_BLOCK_MS * LAGGING_AFTER) {
    reasons.push({ kind: 'no-block', ageMs: age })
    raise(age > EXPECTED_BLOCK_MS * STALLED_AFTER ? 'stalled' : 'lagging')
  }
  if (input.catchingUp) {
    reasons.push({ kind: 'catching-up' })
    raise('lagging')
  }
  if (input.peers === 0) {
    reasons.push({ kind: 'no-peers' })
    raise('lagging')
  }
  if (input.coreTip !== undefined && input.coreChainLockedHeight > 0) {
    const blocks = input.coreTip - input.coreChainLockedHeight
    if (blocks > LAGGING_CORE_BLOCKS) {
      reasons.push({ kind: 'core-behind', blocks })
      raise(blocks > STALLED_CORE_BLOCKS ? 'stalled' : 'lagging')
    }
  }
  return { state, reasons }
}
