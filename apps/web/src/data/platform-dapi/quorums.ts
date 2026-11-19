import { BinaryReader, WireType } from '@bufbuild/protobuf/wire'
import { bytesToHex } from '@/lib/hex'
import { isDevnet, type NetworkId } from '@/lib/network'
import type { ValidatorMember, ValidatorSet, ValidatorSets } from '@/lib/proposer-order'

/** Drive's response metadata: the Platform block the answer is at. */
export interface PlatformAnswerMeta {
  height: number
  coreChainLockedHeight: number
  epoch: number
  timeMs: number
  protocolVersion: number
  chainId: string
}

export interface CurrentQuorums extends ValidatorSets {
  meta: PlatformAnswerMeta
}

/** Most validator sets, and members per set, an answer may have (mainnet has 24 of 100), so one node can't make the turn walk huge. */
export const MAX_SETS = 100
export const MAX_MEMBERS = 1_000

/** `GetCurrentQuorumsInfoRequest { v0: {} }`: the same bytes every time. */
export const CURRENT_QUORUMS_REQUEST = new Uint8Array([0x0a, 0x00])

/** An answer may be stamped at most this far past the browser's clock: block times come from the evonodes' clocks. */
export const MAX_FUTURE_MS = 60_000

/** The chain id a network's answers must carry: testnet's number moves when it is reset. Devnets are not checked. */
export function chainIdFits(net: NetworkId, chainId: string): boolean {
  if (isDevnet(net)) return true
  return net === 'mainnet' ? chainId === 'evo1' : /^dash-testnet-\d+$/.test(chainId)
}

export class QuorumsDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuorumsDecodeError'
  }
}

/** Calls `field` for each field of the message in `bytes`, skipping the ones it does not take. */
function each(bytes: Uint8Array, field: (no: number, r: BinaryReader, wire: WireType) => boolean) {
  const r = new BinaryReader(bytes)
  while (r.pos < r.len) {
    const [no, wire] = r.tag()
    if (!field(no, r, wire)) r.skip(wire, no)
  }
}

const hash32 = (b: Uint8Array, what: string): string => {
  if (b.length !== 32) throw new QuorumsDecodeError(`${what} is ${b.length} bytes, not 32`)
  return bytesToHex(b)
}

function member(bytes: Uint8Array): ValidatorMember {
  let proTxHash: string | undefined
  let banned = false
  each(bytes, (no, r, wire) => {
    if (no === 1 && wire === WireType.LengthDelimited) proTxHash = hash32(r.bytes(), 'A ProTx hash')
    else if (no === 3 && wire === WireType.Varint) banned = r.bool()
    else return false
    return true
  })
  if (proTxHash === undefined) throw new QuorumsDecodeError('A validator has no ProTx hash')
  return { proTxHash, banned }
}

function validatorSet(bytes: Uint8Array): ValidatorSet {
  let quorumHash: string | undefined
  const members: ValidatorMember[] = []
  each(bytes, (no, r, wire) => {
    if (wire !== WireType.LengthDelimited) return false
    if (no === 1) quorumHash = hash32(r.bytes(), 'A quorum hash')
    else if (no === 3) {
      if (members.length === MAX_MEMBERS)
        throw new QuorumsDecodeError(`A validator set of more than ${MAX_MEMBERS} members`)
      members.push(member(r.bytes()))
    } else return false
    return true
  })
  if (quorumHash === undefined) throw new QuorumsDecodeError('A validator set has no quorum hash')
  members.sort((a, b) => (a.proTxHash < b.proTxHash ? -1 : a.proTxHash > b.proTxHash ? 1 : 0))
  return { quorumHash, members }
}

function safe(v: bigint | string, what: string): number {
  const n = Number(v)
  if (!Number.isSafeInteger(n)) throw new QuorumsDecodeError(`The ${what} is out of range`)
  return n
}

function metadata(bytes: Uint8Array): PlatformAnswerMeta {
  const meta: PlatformAnswerMeta = {
    height: 0,
    coreChainLockedHeight: 0,
    epoch: 0,
    timeMs: 0,
    protocolVersion: 0,
    chainId: '',
  }
  each(bytes, (no, r, wire) => {
    if (no === 6 && wire === WireType.LengthDelimited) meta.chainId = r.string()
    else if (wire !== WireType.Varint) return false
    else if (no === 1) meta.height = safe(r.uint64(), 'block height')
    else if (no === 2) meta.coreChainLockedHeight = r.uint32()
    else if (no === 3) meta.epoch = r.uint32()
    else if (no === 4) meta.timeMs = safe(r.uint64(), 'block time')
    else if (no === 5) meta.protocolVersion = r.uint32()
    else return false
    return true
  })
  return meta
}

/**
 * Decodes `GetCurrentQuorumsInfoResponse` (platform.proto): `v0 { quorum_hashes = 1, current_quorum_hash = 2,
 * validator_sets = 3 [{ quorum_hash = 1, members = 3 [{ pro_tx_hash = 1, is_banned = 3 }] }], last_block_proposer = 4,
 * metadata = 5 }`. Hashes stay in the order Drive keys them by. Throws `QuorumsDecodeError` for anything malformed: an
 * answer with no rotation, a height or time that is not a safe integer, a time more than `MAX_FUTURE_MS` ahead of
 * `now`, or another network's chain id.
 */
export function decodeCurrentQuorums(
  bytes: Uint8Array,
  expect: { net: NetworkId; now: number },
): CurrentQuorums {
  let v0: Uint8Array | undefined
  try {
    each(bytes, (no, r, wire) => {
      if (no !== 1 || wire !== WireType.LengthDelimited) return false
      v0 = r.bytes()
      return true
    })
    if (!v0) throw new QuorumsDecodeError('No v0 answer')
    const order: string[] = []
    const sets: ValidatorSet[] = []
    let current = ''
    let lastProposer: string | undefined
    let meta: PlatformAnswerMeta | undefined
    each(v0, (no, r, wire) => {
      if (wire !== WireType.LengthDelimited) return false
      if (no === 1) {
        const h = hash32(r.bytes(), 'A quorum hash')
        if (!order.includes(h)) order.push(h)
        if (order.length > MAX_SETS)
          throw new QuorumsDecodeError(`More than ${MAX_SETS} sets in the rotation`)
      } else if (no === 2) current = hash32(r.bytes(), 'The current quorum hash')
      else if (no === 3) {
        if (sets.length === MAX_SETS)
          throw new QuorumsDecodeError(`More than ${MAX_SETS} validator sets`)
        sets.push(validatorSet(r.bytes()))
      } else if (no === 4) lastProposer = hash32(r.bytes(), 'The last block proposer')
      else if (no === 5) meta = metadata(r.bytes())
      else return false
      return true
    })
    if (lastProposer === undefined) throw new QuorumsDecodeError('No last block proposer')
    if (order.length === 0) throw new QuorumsDecodeError('No validator-set rotation')
    if (!meta || meta.height <= 0 || meta.timeMs <= 0)
      throw new QuorumsDecodeError('No block height or time in the answer')
    if (meta.timeMs > expect.now + MAX_FUTURE_MS)
      throw new QuorumsDecodeError('The answer is stamped in the future')
    if (!chainIdFits(expect.net, meta.chainId))
      throw new QuorumsDecodeError(`The answer is for chain ${meta.chainId}, not ${expect.net}`)
    if (!sets.some((s) => s.quorumHash === current))
      throw new QuorumsDecodeError('The current validator set is not among the sets')
    return { order, current, sets, lastProposer, meta }
  } catch (e) {
    if (e instanceof QuorumsDecodeError) throw e
    throw new QuorumsDecodeError(`Unreadable answer: ${(e as Error).message}`)
  }
}
