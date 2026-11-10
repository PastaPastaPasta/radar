import type * as Wasm from '@radar/core-decode'
import type { NetworkId } from '@/lib/network'
import type { CoreTxType } from '@/lib/tx-types'
import { isDevnet } from '@/lib/network'
import type { DecodedBlock, DecodedTx } from './types'

export type WasmNetwork = Wasm.Network

export function wasmNetwork(net: NetworkId): WasmNetwork {
  return isDevnet(net) ? 'devnet' : net
}

const TX_TYPES: Partial<Record<Wasm.TxTypeName, CoreTxType>> = {
  classic: 'transfer',
  proRegTx: 'pro-reg',
  proUpServTx: 'pro-up-serv',
  proUpRegTx: 'pro-up-reg',
  proUpRevTx: 'pro-up-rev',
  cbTx: 'coinbase',
  qcTx: 'quorum-commitment',
  mnhfTx: 'mnhf-signal',
  assetLockTx: 'asset-lock',
  assetUnlockTx: 'asset-unlock',
}

/**
 * The badge type of a transaction. A classic coinbase is `coinbase` too. Types Dash Core does not have yet
 * (DIP-26 shared-masternode transactions) have no badge and read as `transfer`; their `payload.kind` is the exact type.
 */
export function coreTxType(tx: Pick<Wasm.DecodedTx, 'txTypeName' | 'isCoinbase'>): CoreTxType {
  if (tx.isCoinbase) return 'coinbase'
  return TX_TYPES[tx.txTypeName] ?? 'transfer'
}

/** Payload fields that hold duffs, as paths from the payload root. A `[]` segment maps over an array. */
const DUFF_FIELDS: Record<string, string[]> = {
  cbTx: ['creditPoolBalance'],
  assetLockTx: ['totalCredit', 'creditOutputs.[].value'],
  assetUnlockTx: ['fee'],
  proRegTx: ['sharedCollateral.shares.[].amount', 'sharedCollateral.earlyPenalty'],
}

function toBigInt(node: unknown, path: string[]): unknown {
  const [head, ...rest] = path
  if (head === undefined) return typeof node === 'number' ? BigInt(node) : node
  if (head === '[]') return Array.isArray(node) ? node.map((n) => toBigInt(n, rest)) : node
  if (node === null || typeof node !== 'object') return node
  const obj = node as Record<string, unknown>
  if (!(head in obj)) return node
  return { ...obj, [head]: toBigInt(obj[head], rest) }
}

/** The decoder's payload with every duff amount as a `bigint`, like amounts everywhere else. */
function mapPayload(payload: Wasm.TxPayload | null): Record<string, unknown> | undefined {
  if (!payload) return undefined
  let out: unknown = payload
  for (const field of DUFF_FIELDS[payload.kind] ?? []) out = toBigInt(out, field.split('.'))
  return out as Record<string, unknown>
}

export interface TxPlace {
  blockHash?: string
  height?: number
  time?: number
}

export function mapTx(tx: Wasm.DecodedTx, place: TxPlace = {}): DecodedTx {
  return {
    txid: tx.txid,
    type: coreTxType(tx),
    version: tx.version,
    lockTime: tx.lockTime,
    size: tx.size,
    inputs: tx.inputs.map((i, n) => ({
      txid: i.prevTxid,
      vout: i.vout,
      scriptSig: i.scriptSigHex,
      sequence: i.sequence,
      ...(tx.isCoinbase && n === 0 && tx.coinbase ? { coinbase: tx.coinbase.scriptSigHex } : {}),
    })),
    outputs: tx.outputs.map((o) => ({
      value: BigInt(o.value),
      scriptPubKey: o.scriptPubKeyHex,
      ...(o.address ? { address: o.address } : {}),
    })),
    payload: mapPayload(tx.payload),
    ...place,
  }
}

/**
 * The height a block says it has: the coinbase transaction's own field from DIP-3 on, BIP-34's
 * height push in the coinbase script before that, 0 for the genesis block.
 */
export function blockHeightOf(block: Wasm.DecodedBlock): number | undefined {
  if (/^0+$/.test(block.prevBlockHash)) return 0
  const coinbase = block.txs[0]
  if (coinbase?.payload?.kind === 'cbTx') return coinbase.payload.height
  const script = coinbase?.coinbase?.scriptSigHex
  if (!script) return undefined
  const bytes = Uint8Array.from(script.match(/../g)?.map((h) => parseInt(h, 16)) ?? [])
  const op = bytes[0]
  if (op === undefined) return undefined
  if (op >= 0x51 && op <= 0x60) return op - 0x50
  if (op < 1 || op > 5 || bytes.length < 1 + op) return undefined
  let height = 0
  for (let i = op; i >= 1; i--) height = height * 256 + bytes[i]!
  return height
}

export function mapBlock(block: Wasm.DecodedBlock, height: number): DecodedBlock {
  const time = block.time * 1000
  const place: TxPlace = { blockHash: block.hash, height, time }
  return {
    hash: block.hash,
    height,
    version: block.version,
    prevHash: block.prevBlockHash,
    merkleRoot: block.merkleRoot,
    time,
    bits: block.bits.toString(16).padStart(8, '0'),
    nonce: block.nonce,
    size: block.size,
    txs: block.txs.map((t) => mapTx(t, place)),
    chainLocked: false,
  }
}
