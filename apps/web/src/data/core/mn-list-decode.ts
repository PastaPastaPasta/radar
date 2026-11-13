import { z } from 'zod'
import { bytesToHex, hexToBytes } from '@/lib/hex'
import { SourceError } from '../errors'
import type { DapiMnEntry, DapiMnListDiff } from './types'

/**
 * Reads the first message of DAPI's `subscribeToMasternodeList`. rs-dapi sends Dash Core's `protx diff` answer as
 * CBOR (`ciborium::into_writer` over the RPC's JSON), not the P2P `mnlistdiff` the wasm decoder would read, so a small
 * CBOR reader and a schema stand in for it. Every field is checked: one malformed entry refuses the whole message.
 */

const MAX_DEPTH = 24
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

type Cbor =
  null | undefined | boolean | number | string | Uint8Array | Cbor[] | { [k: string]: Cbor }

class ReadError extends Error {}

/** The subset of RFC 8949 a JSON document needs: definite lengths, text keys, no half-open items. */
export function readCbor(bytes: Uint8Array): Cbor {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0
  const need = (n: number) => {
    if (n < 0 || at + n > bytes.length) throw new ReadError('The message ends early')
  }
  const argument = (info: number): number => {
    if (info < 24) return info
    const width = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0
    if (width === 0) throw new ReadError('An unsupported item length')
    need(width)
    let n: bigint
    if (width === 1) n = BigInt(bytes[at]!)
    else if (width === 2) n = BigInt(view.getUint16(at))
    else if (width === 4) n = BigInt(view.getUint32(at))
    else n = view.getBigUint64(at)
    at += width
    if (n > MAX_SAFE) throw new ReadError('A number is too large')
    return Number(n)
  }
  const float16 = (h: number): number => {
    const exp = (h >> 10) & 0x1f
    const frac = h & 0x3ff
    const value =
      exp === 0
        ? frac * 2 ** -24
        : exp === 31
          ? frac
            ? NaN
            : Infinity
          : (1 + frac / 1024) * 2 ** (exp - 15)
    return h & 0x8000 ? -value : value
  }
  const item = (depth: number): Cbor => {
    if (depth > MAX_DEPTH) throw new ReadError('The message is nested too deeply')
    need(1)
    const head = bytes[at++]!
    const major = head >> 5
    const info = head & 31
    switch (major) {
      case 0:
        return argument(info)
      case 1:
        return -1 - argument(info)
      case 2:
      case 3: {
        const n = argument(info)
        need(n)
        const slice = bytes.subarray(at, at + n)
        at += n
        return major === 2 ? slice : new TextDecoder('utf-8', { fatal: true }).decode(slice)
      }
      case 4: {
        const n = argument(info)
        need(n)
        const out: Cbor[] = []
        for (let i = 0; i < n; i++) out.push(item(depth + 1))
        return out
      }
      case 5: {
        const n = argument(info)
        need(n * 2)
        const out: Record<string, Cbor> = Object.create(null) as Record<string, Cbor>
        for (let i = 0; i < n; i++) {
          const key = item(depth + 1)
          if (typeof key !== 'string') throw new ReadError('A map key is not text')
          out[key] = item(depth + 1)
        }
        return out
      }
      case 6:
        argument(info)
        return item(depth + 1)
      default: {
        if (info === 20) return false
        if (info === 21) return true
        if (info === 22) return null
        if (info === 23) return undefined
        if (info === 25) {
          need(2)
          const v = float16(view.getUint16(at))
          at += 2
          return v
        }
        if (info === 26) {
          need(4)
          const v = view.getFloat32(at)
          at += 4
          return v
        }
        if (info === 27) {
          need(8)
          const v = view.getFloat64(at)
          at += 8
          return v
        }
        throw new ReadError('An unsupported simple value')
      }
    }
  }
  const value = item(0)
  if (at !== bytes.length) throw new ReadError('Bytes follow the message')
  return value
}

const hex = (bytes: number) =>
  z.string().regex(new RegExp(`^[0-9a-f]{${bytes * 2}}$`), `${bytes} bytes of lower-case hex`)
const port = z.number().int().min(0).max(65535)
const addressList = z.array(z.string().min(1).max(100)).max(8)

const entrySchema = z.object({
  nVersion: z.number().int().min(1).max(255),
  nType: z.union([z.literal(0), z.literal(1)]),
  proRegTxHash: hex(32),
  confirmedHash: hex(32),
  service: z.string().max(100),
  addresses: z.record(z.string(), addressList).optional(),
  pubKeyOperator: hex(48),
  votingAddress: z.string().min(26).max(64),
  isValid: z.boolean(),
  platformHTTPPort: port.optional(),
  platformNodeID: hex(20).optional(),
})

const diffSchema = z.object({
  nVersion: z.number().int().min(1),
  baseBlockHash: hex(32),
  blockHash: hex(32),
  cbTx: z.string().regex(/^(?:[0-9a-f]{2})+$/),
  deletedMNs: z.array(hex(32)),
  mnList: z.array(entrySchema),
  merkleRootMNList: hex(32),
})

export interface ParsedMnListDiff {
  diff: DapiMnListDiff
  /** The diff's block height, from the BIP-34-style height in its coinbase payload. */
  height: number
  /** The simplified-list merkle root the block's coinbase commits to (display order). */
  merkleRootMNList: string
  /** The coinbase payload's own copy of that root equals the diff's. */
  rootMatchesCoinbase: boolean
}

const UNSPECIFIED = /^(?:0\.0\.0\.0|\[::\]):0$/

function portOf(address: string | undefined): number | undefined {
  const m = address ? /:(\d{1,5})$/.exec(address) : null
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n <= 65535 ? n : undefined
}

function toEntry(e: z.output<typeof entrySchema>): DapiMnEntry {
  const httpPort = e.platformHTTPPort ?? portOf(e.addresses?.platform_https?.[0])
  const p2pPort = portOf(e.addresses?.platform_p2p?.[0])
  return {
    proRegTxHash: e.proRegTxHash,
    confirmedHash: e.confirmedHash,
    service: UNSPECIFIED.test(e.service) ? '' : e.service,
    pubKeyOperator: e.pubKeyOperator,
    votingAddress: e.votingAddress,
    isValid: e.isValid,
    type: e.nType,
    ...(e.nType === 1 && httpPort !== undefined && { platformHttpPort: httpPort }),
    ...(e.nType === 1 && p2pPort !== undefined && { platformP2pPort: p2pPort }),
    ...(e.nType === 1 && e.platformNodeID !== undefined && { platformNodeId: e.platformNodeID }),
  }
}

/** The reversed hex of a 32-byte hash: Core prints hashes byte-reversed from how a payload holds them. */
const reversedHex = (b: Uint8Array) => bytesToHex(Uint8Array.from(b).reverse())

/**
 * Height and masternode-list root of a DIP-4 coinbase transaction: version and type, the coinbase input, the outputs,
 * the lock time, then the payload (version, height, merkleRootMNList, …).
 */
export function readCoinbasePayload(tx: Uint8Array): { height: number; merkleRootMNList: string } {
  const view = new DataView(tx.buffer, tx.byteOffset, tx.byteLength)
  let at = 0
  const need = (n: number) => {
    if (n < 0 || at + n > tx.length) throw new ReadError('The coinbase transaction ends early')
  }
  const varint = (): number => {
    need(1)
    const first = tx[at++]!
    if (first < 0xfd) return first
    const width = first === 0xfd ? 2 : first === 0xfe ? 4 : 8
    need(width)
    const n =
      width === 2
        ? view.getUint16(at, true)
        : width === 4
          ? view.getUint32(at, true)
          : Number(view.getBigUint64(at, true))
    at += width
    return n
  }
  need(4)
  const version = view.getUint16(0, true)
  const type = view.getUint16(2, true)
  at = 4
  if (version < 3 || type !== 5)
    throw new ReadError('The diff does not carry a coinbase special transaction')
  const inputs = varint()
  if (inputs !== 1) throw new ReadError('A coinbase has one input')
  need(36)
  at += 36
  const script = varint()
  need(script + 4)
  at += script + 4
  const outputs = varint()
  for (let i = 0; i < outputs; i++) {
    need(8)
    at += 8
    const len = varint()
    need(len)
    at += len
  }
  need(4)
  at += 4
  const payloadLength = varint()
  need(payloadLength)
  if (payloadLength < 2 + 4 + 32) throw new ReadError('The coinbase payload is too short')
  const payload = tx.subarray(at, at + payloadLength)
  const height = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(
    2,
    true,
  )
  return { height, merkleRootMNList: reversedHex(payload.subarray(6, 38)) }
}

function invalid(message: string, cause?: unknown): SourceError {
  return new SourceError({ source: 'dapi', kind: 'invalid-response', message, cause })
}

/** Decodes and checks one masternode list diff as DAPI sends it. Throws `invalid-response`. */
export function parseMnListDiff(bytes: Uint8Array): ParsedMnListDiff {
  let raw: Cbor
  try {
    raw = readCbor(bytes)
  } catch (cause) {
    throw invalid(
      `DAPI sent a masternode list that is not readable: ${(cause as Error).message}`,
      cause,
    )
  }
  const parsed = diffSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw invalid(
      `DAPI sent a malformed masternode list (${first?.path.join('.') ?? 'message'}: ${first?.message ?? 'invalid'})`,
      parsed.error,
    )
  }
  const d = parsed.data
  const seen = new Set<string>()
  for (const e of d.mnList) {
    if (seen.has(e.proRegTxHash))
      throw invalid('DAPI sent a masternode list that names one masternode twice')
    seen.add(e.proRegTxHash)
    if (e.nType === 1 && e.platformNodeID === undefined) {
      throw invalid('DAPI sent an evonode with no Platform node ID')
    }
  }
  let payload: { height: number; merkleRootMNList: string }
  try {
    payload = readCoinbasePayload(hexToBytes(d.cbTx))
  } catch (cause) {
    throw invalid(
      `DAPI sent a masternode list with an unreadable coinbase: ${(cause as Error).message}`,
      cause,
    )
  }
  return {
    diff: {
      baseBlockHash: d.baseBlockHash,
      blockHash: d.blockHash,
      updated: d.mnList.map(toEntry),
      removed: d.deletedMNs,
    },
    height: payload.height,
    merkleRootMNList: d.merkleRootMNList,
    rootMatchesCoinbase: payload.merkleRootMNList === d.merkleRootMNList,
  }
}
