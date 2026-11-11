import type { DecodedTx } from '@/data/core/types'
import type { HyAddressTx, HyTxDetail } from '@/data/hyphen/schemas'

export interface Spender {
  txid: string
  /** The input of the spending transaction that consumes the output. */
  vin: number
}

/**
 * What the page may say about one output. Hyphen's flag is a statement about its index at one height, so
 * "unspent" is only offered while that index is within `UNSPENT_LAG_BLOCKS` of the chain; past that the
 * output could have been spent since and the honest answer is "unknown".
 */
export type OutputSpend =
  | { state: 'spent'; by?: Spender; resolving?: boolean }
  | { state: 'unspent'; asOf?: number; behind: number }
  | { state: 'unspendable' }
  | {
      state: 'unknown'
      reason: 'loading' | 'unconfirmed' | 'no-index' | 'not-reported' | 'behind'
      behind?: number
    }

export const UNSPENT_LAG_BLOCKS = 3

/**
 * What an address's current UTXO list says about the outputs of one transaction. `found` holds the indexes
 * of its outputs that are still in the list; when the list was read to its end (`complete`), the others
 * have been spent.
 */
export interface AddressUtxos {
  asOf: number | undefined
  found: ReadonlySet<number>
  complete: boolean
}

/** An OP_RETURN output can never be spent. */
export const isUnspendable = (scriptPubKey: string): boolean => scriptPubKey.startsWith('6a')

export interface SpendInput {
  tx: Pick<DecodedTx, 'outputs'> & Partial<Pick<DecodedTx, 'height'>>
  mined: boolean
  /**
   * Hyphen's transaction page, or what we know about why there is none. Hyphen serves a mined transaction as
   * immutable, so its `spent` flags are only as fresh as the first time anyone asked.
   */
  hy: { detail: HyTxDetail | null | undefined; asOfHeight: number | undefined } | undefined
  hyLoading: boolean
  /** The chain tip as DAPI or the live feed reports it. */
  tipHeight: number | undefined
  /** Spenders found so far, by output index; `null` where the lookup finished without finding one. */
  spenders: ReadonlyMap<number, Spender | null | 'resolving'>
  /** Current UTXO lists of the output addresses, which are read afresh; absent where none was asked for. */
  utxos?: ReadonlyMap<string, AddressUtxos | 'resolving' | null>
}

/** True where the transaction page's own `spent: true` flag is the answer: a spend cannot be undone. */
export const flaggedSpent = (hy: SpendInput['hy'], n: number): boolean =>
  hy?.detail?.vout.find((v) => v.n === n)?.spent === true

export function outputSpends({
  tx,
  mined,
  hy,
  hyLoading,
  tipHeight,
  spenders,
  utxos,
}: SpendInput): OutputSpend[] {
  const spentBy = (n: number): OutputSpend => {
    const found = spenders.get(n)
    if (found === 'resolving') return { state: 'spent', resolving: true }
    return found ? { state: 'spent', by: found } : { state: 'spent' }
  }
  return tx.outputs.map((o, n): OutputSpend => {
    if (isUnspendable(o.scriptPubKey)) return { state: 'unspendable' }
    if (!mined) return { state: 'unknown', reason: 'unconfirmed' }
    if (!hy?.detail) return { state: 'unknown', reason: hyLoading ? 'loading' : 'no-index' }
    const flag = hy.detail.vout.find((v) => v.n === n)?.spent
    if (flag) return spentBy(n)
    const view = o.address ? utxos?.get(o.address) : undefined
    if (view === 'resolving') return { state: 'unknown', reason: 'loading' }
    if (view) {
      if (view.asOf === undefined) return { state: 'unknown', reason: 'not-reported' }
      const behind = tipHeight === undefined ? 0 : Math.max(0, tipHeight - view.asOf)
      if (view.found.has(n)) {
        return behind > UNSPENT_LAG_BLOCKS
          ? { state: 'unknown', reason: 'behind', behind }
          : { state: 'unspent', asOf: view.asOf, behind }
      }
      if (view.complete && tx.height !== undefined && view.asOf >= tx.height) return spentBy(n)
      return behind > 0
        ? { state: 'unknown', reason: 'behind', behind }
        : { state: 'unknown', reason: 'not-reported' }
    }
    const asOf = hy.asOfHeight
    if (flag == null || asOf === undefined) return { state: 'unknown', reason: 'not-reported' }
    const behind = tipHeight === undefined ? 0 : Math.max(0, tipHeight - asOf)
    return behind > UNSPENT_LAG_BLOCKS
      ? { state: 'unknown', reason: 'behind', behind }
      : { state: 'unspent', asOf, behind }
  })
}

export interface SpenderDeps {
  addressTxs(
    address: string,
    cursor: string | undefined,
    signal?: AbortSignal,
  ): Promise<{ items: HyAddressTx[]; nextCursor?: string }>
  /** The inputs of a transaction, or null when the source has no such transaction. */
  inputsOf(
    txid: string,
    signal?: AbortSignal,
  ): Promise<{ n: number; txHash?: string | null; vout?: number | null }[] | null>
}

/** Pages of an address's history read, and candidate transactions opened, before giving up on finding a spender. */
export const SPENDER_MAX_PAGES = 3
export const SPENDER_MAX_CANDIDATES = 8

/**
 * Hyphen says an output is spent but not by what. Its address history lists every transaction that moved
 * coins out of the address, so the spender is a later one whose inputs name the output. Each page of history
 * is tried oldest first, since the spender is usually the next time the address paid anything. `null` when the
 * history does not show it (a very busy address, or no address on the output).
 */
export async function findSpender(
  deps: SpenderDeps,
  out: { txid: string; vout: number; address: string | undefined; height: number },
  signal?: AbortSignal,
): Promise<Spender | null> {
  if (!out.address) return null
  let cursor: string | undefined
  let opened = 0
  for (let page = 0; page < SPENDER_MAX_PAGES; page++) {
    const { items, nextCursor } = await deps.addressTxs(out.address, cursor, signal)
    const candidates = items
      .filter((i) => i.txHash !== out.txid && i.blockHeight >= out.height && i.direction === 'out')
      .sort((a, b) => a.blockHeight - b.blockHeight || (a.blockPos ?? 0) - (b.blockPos ?? 0))
    for (const candidate of candidates) {
      if (opened++ >= SPENDER_MAX_CANDIDATES) return null
      const inputs = await deps.inputsOf(candidate.txHash, signal)
      const hit = inputs?.find((i) => i.txHash === out.txid && i.vout === out.vout)
      if (hit) return { txid: candidate.txHash, vin: hit.n }
    }
    const oldest = items.at(-1)
    if (!nextCursor || !oldest || oldest.blockHeight < out.height) return null
    cursor = nextCursor
  }
  return null
}

/** Runs at most `limit` tasks at once; a finishing task hands its slot to the next waiting one. */
export function limiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: (() => void)[] = []
  return async (task) => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve))
    else active++
    try {
      return await task()
    } finally {
      const handOver = waiting.shift()
      if (handOver) handOver()
      else active--
    }
  }
}
