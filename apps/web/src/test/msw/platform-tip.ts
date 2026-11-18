import { BinaryWriter } from '@bufbuild/protobuf/wire'
import { decodeCurrentQuorums, type CurrentQuorums } from '@/data/platform-dapi/quorums'
import { hexToBytes } from '@/lib/hex'
import { proposerTurns } from '@/lib/proposer-order'

/**
 * The fixture chain's Platform tip, moved on by specs: `advance` blocks past the recordings, each `blockMs` apart, with
 * every turn taken; `down` makes the epoch read and the validator-set read fail as an unreachable node would.
 */
const tip = { advance: 0, blockMs: 135_000, down: false }

export function advancePlatformTip(blocks: number, blockMs = tip.blockMs): void {
  tip.advance += blocks
  tip.blockMs = blockMs
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
      timeMs: r.meta.timeMs + tip.advance * tip.blockMs,
    },
  } as R
}

function encode(q: CurrentQuorums): Uint8Array {
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
    .uint64(q.meta.height)
    .tag(2, 0)
    .uint32(q.meta.coreChainLockedHeight)
    .tag(3, 0)
    .uint32(q.meta.epoch)
    .tag(4, 0)
    .uint64(q.meta.timeMs)
    .tag(5, 0)
    .uint32(q.meta.protocolVersion)
    .tag(6, 2)
    .string(q.meta.chainId)
  v0.tag(5, 2).bytes(meta.finish())
  return new BinaryWriter().tag(1, 2).bytes(v0.finish()).finish()
}

/** A recorded validator-set answer as it reads `advance` blocks later: each turn taken, so the proposer is the one due. */
export function advancedQuorumsAnswer(bytes: Uint8Array): Uint8Array {
  if (tip.advance === 0) return bytes
  const q = decodeCurrentQuorums(bytes)
  const due = proposerTurns(q).find((t) => t.slot === tip.advance)
  if (!due) return bytes
  return encode({
    ...q,
    lastProposer: due.proTxHash,
    meta: {
      ...q.meta,
      height: q.meta.height + tip.advance,
      timeMs: q.meta.timeMs + tip.advance * tip.blockMs,
    },
  })
}
