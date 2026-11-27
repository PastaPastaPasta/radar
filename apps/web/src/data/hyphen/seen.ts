import type { NetworkId } from '@/lib/network'
import type { Sourced } from '../envelope'
import { hyKeys } from '../query/keys'
import type { HyBlockDetail, HyTxDetail } from './schemas'

/** The query keys of `hyQueries.block` and `hyQueries.tx`, here so the query client can use them without the Hyphen client. */
export const hyBlockKey = (net: NetworkId, hashOrHeight: string | number) =>
  hyKeys(net, 'block', { id: String(hashOrHeight).toLowerCase() })
export const hyTxKey = (net: NetworkId, txid: string) =>
  hyKeys(net, 'tx', { txid: txid.toLowerCase() })

/** A block or tx detail Hyphen answered, with every id it answers to. */
export type HyphenDetail =
  | { kind: 'block'; ids: readonly string[]; read: Sourced<HyBlockDetail | null> }
  | { kind: 'tx'; ids: readonly string[]; read: Sourced<HyTxDetail | null> }

let listener: ((net: NetworkId, seen: HyphenDetail) => void) | undefined

/**
 * Hands each detail Hyphen answers to whoever caches reads (the query client, `app/query-client.ts`). A Core page reads
 * the detail inside the Core client, outside the query cache, and its Hyphen section then asks for the same detail by
 * hash or txid; that second read would cost the zone's rate limit a request for an answer the page already has.
 */
export function onHyphenDetail(fn: ((net: NetworkId, seen: HyphenDetail) => void) | undefined) {
  listener = fn
}

export function sawHyphenDetail(net: NetworkId, seen: HyphenDetail): void {
  listener?.(net, seen)
}
