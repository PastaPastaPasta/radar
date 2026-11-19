import { BinaryWriter } from '@bufbuild/protobuf/wire'
import { decodeCurrentQuorums, type CurrentQuorums } from '@/data/platform-dapi/quorums'
import { hexToBytes } from '@/lib/hex'
import type { NetworkId } from '@/lib/network'
import { proposerTurns } from '@/lib/proposer-order'
import { reportFixtureMiss } from './handlers/fixtures'

/**
 * The fixture chain's Platform tip, moved on by specs: `advance` blocks past the recordings, each `blockMs` apart, with
 * every turn taken; `down` makes the epoch read and the validator-set read fail as an unreachable node would.
 */
const tip = { advance: 0, elapsedMs: 0, down: false }
const BLOCK_MS = 135_000

/** Moves the fixture tip on `blocks` blocks, each `blockMs` after the one before; earlier calls keep their spacing. */
export function advancePlatformTip(blocks: number, blockMs = BLOCK_MS): void {
  tip.advance += blocks
  tip.elapsedMs += blocks * blockMs
}

/** Back to the recordings, for tests that move the tip. */
export function resetPlatformTip(): void {
  tip.advance = 0
  tip.elapsedMs = 0
  tip.down = false
}

export function cutPlatform(down: boolean): void {
  tip.down = down
}

export const platformCut = () => tip.down

interface AnswerMeta {
  height: number
  timeMs: number
}

/** A recorded `epoch.current` answer as it reads `advance` blocks later. */
export function advancedEpochAnswer<R>(result: R): R {
  const r = result as { ok?: boolean; meta?: AnswerMeta }
  if (tip.advance === 0 || !r.ok || !r.meta) return result
  return {
    ...r,
    meta: {
      ...r.meta,
      height: r.meta.height + tip.advance,
      timeMs: r.meta.timeMs + tip.elapsedMs,
    },
  } as R
}

/**
 * Encodes an answer as a node would send it. `raw` overrides the height and time with values no decoded answer could
 * hold, for tests of what the decoder refuses.
 */
export function encodeCurrentQuorums(
  q: CurrentQuorums,
  raw: { height?: bigint; timeMs?: bigint } = {},
): Uint8Array {
  const v0 = new BinaryWriter()
  for (const h of q.order) v0.tag(1, 2).bytes(hexToBytes(h))
  v0.tag(2, 2).bytes(hexToBytes(q.current))
  for (const s of q.sets) {
    const set = new BinaryWriter().tag(1, 2).bytes(hexToBytes(s.quorumHash))
    for (const m of s.members) {
      const member = new BinaryWriter().tag(1, 2).bytes(hexToBytes(m.proTxHash))
      if (m.banned) member.tag(3, 0).bool(true)
      set.tag(3, 2).bytes(member.finish())
    }
    v0.tag(3, 2).bytes(set.finish())
  }
  v0.tag(4, 2).bytes(hexToBytes(q.lastProposer))
  const meta = new BinaryWriter()
    .tag(1, 0)
    .uint64(raw.height ?? q.meta.height)
    .tag(2, 0)
    .uint32(q.meta.coreChainLockedHeight)
    .tag(3, 0)
    .uint32(q.meta.epoch)
    .tag(4, 0)
    .uint64(raw.timeMs ?? q.meta.timeMs)
    .tag(5, 0)
    .uint32(q.meta.protocolVersion)
    .tag(6, 2)
    .string(q.meta.chainId)
  v0.tag(5, 2).bytes(meta.finish())
  return new BinaryWriter().tag(1, 2).bytes(v0.finish()).finish()
}

/**
 * A recorded validator-set answer as it reads `advance` blocks later: each turn taken, so the proposer is the one due,
 * and the active set is the one that turn is taken in. An advance the recording cannot place (past its turns, or onto
 * a repeated turn) is a fixture miss, never the recorded answer at the wrong height.
 */
export function advancedQuorumsAnswer(bytes: Uint8Array, net: NetworkId): Uint8Array {
  if (tip.advance === 0) return bytes
  const q = decodeCurrentQuorums(bytes, { net, now: Number.MAX_SAFE_INTEGER })
  const due = proposerTurns(q).find((t) => t.slot === tip.advance)
  if (!due) {
    const what = `the validator sets ${String(tip.advance)} blocks past the ${net} recording`
    reportFixtureMiss(what)
    throw new Error(`No recorded turn places ${what}`)
  }
  return encodeCurrentQuorums({
    ...q,
    current: due.quorumHash,
    lastProposer: due.proTxHash,
    meta: {
      ...q.meta,
      height: q.meta.height + tip.advance,
      timeMs: q.meta.timeMs + tip.elapsedMs,
    },
  })
}
