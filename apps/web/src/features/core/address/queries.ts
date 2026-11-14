import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { mapSourced } from '@/data/envelope'
import { adaptAddress, adaptAddressTx, adaptPendingTx, adaptUtxo } from '@/data/insight/adapt'
import { insPages, insQueries } from '@/data/insight/queries'
import { hyQueries } from '@/data/hyphen/queries'
import { hyPages } from '@/data/hyphen/pages'
import type { InsTxPage } from '@/data/insight/schemas'
import type { QueryClient } from '@tanstack/react-query'
import type { HyAddressTx, HyPage, HyUtxo } from '@/data/hyphen/schemas'
import { hyKeys, insKeys } from '@/data/query/keys'
import type { NetworkId } from '@/lib/network'

const HISTORY_LIMIT = 25
const UTXO_LIMIT = 25

export type IndexSource = 'hyphen' | 'insight'

/** Key prefixes for everything the address page reads, so a new block can refresh them together. */
export function addressKeys(net: NetworkId, address: string, from: IndexSource = 'hyphen') {
  const keys = from === 'insight' ? insKeys : hyKeys
  return {
    summary: keys(net, 'address', { address }),
    txs: keys(net, 'address-txs-pages', { address }),
    utxos: keys(net, 'address-utxos', { address }),
  }
}

export const txRows = (address: string, page: InsTxPage): HyAddressTx[] =>
  page.txs.flatMap((tx) => adaptAddressTx(tx, address) ?? [])

/** An unconfirmed transaction of the address that the index (not the live feed) reported. */
export interface IndexedPending {
  txid: string
  net: bigint
}

/** Past this many outputs the list is read once rather than again on every block (Insight sends it whole). */
export const UTXO_AUTO_REFRESH_MAX = 2000

/** The address page's reads in Hyphen's shapes; Insight's answers are adapted to them. */
export const addressQueries = {
  summary: hyQueries.address,
  txs: (net: NetworkId, address: string) => hyPages.addressTxs(net, address, HISTORY_LIMIT),
  utxos: (net: NetworkId, address: string) =>
    hyQueries.addressUtxos(net, address, { limit: UTXO_LIMIT }),
}

export const insightAddressQueries = {
  summary: (net: NetworkId, address: string) =>
    queryOptions({
      ...insQueries.address(net, address),
      select: (s) => mapSourced(s, adaptAddress),
    }),
  /**
   * Insight's pages mix the mempool in with the mined history and shift as blocks arrive, so the confirmed rows are
   * deduplicated by transaction id across pages, and unconfirmed transactions are set aside for the pending area.
   */
  txs: (net: NetworkId, address: string) =>
    infiniteQueryOptions({
      ...insPages.addressTxs(net, address),
      select: (data) => {
        const seen = new Set<string>()
        const pending: IndexedPending[] = []
        const pages = data.pages.map((p) =>
          mapSourced(p, (page): HyPage<HyAddressTx> => {
            const fresh = { ...page, txs: page.txs.filter((tx) => !seen.has(tx.txid)) }
            for (const tx of fresh.txs) {
              seen.add(tx.txid)
              const waiting = adaptPendingTx(tx, address)
              if (waiting) pending.push(waiting)
            }
            return { items: txRows(address, fresh) }
          }),
        )
        return {
          pages,
          pageParams: data.pageParams,
          pending,
          pagesTotal: data.pages[0]?.data.pagesTotal,
        }
      },
    }),
  /**
   * The last page of the history: its oldest transaction is when the address was first seen. One request, cached with
   * the others. `pagesTotal` is what the answer itself says the history now spans, which differs from the count asked
   * for when a transaction arrived in between and moved the oldest one onto a later page.
   */
  oldestPage: (net: NetworkId, address: string, pagesTotal: number) =>
    queryOptions({
      ...insQueries.addressTxs(net, address, Math.max(0, pagesTotal - 1)),
      select: (s) =>
        mapSourced(s, (page) => ({ rows: txRows(address, page), pagesTotal: page.pagesTotal })),
    }),
  /** The whole list is read once; the card pages through it in the browser. */
  utxos: (net: NetworkId, address: string) =>
    queryOptions({
      ...insQueries.addressUtxos(net, address),
      select: (s) =>
        mapSourced(s, (list): HyPage<HyUtxo> => ({
          items: list.map(adaptUtxo),
          total: list.length,
        })),
    }),
}

/** The value of an output of the address that the page already knows, from the index it reads, in the shape the live check needs. */
export function knownOutputValue(
  client: QueryClient,
  net: NetworkId,
  address: string,
  from: IndexSource,
  outpoint: string,
): bigint | undefined {
  if (from === 'insight') {
    const list = client.getQueryData(insQueries.addressUtxos(net, address).queryKey)?.data
    return list?.find((u) => `${u.txid}:${u.vout}` === outpoint)?.satoshis
  }
  const items = client.getQueryData(addressQueries.utxos(net, address).queryKey)?.data.items
  return items?.find((u) => `${u.txHash}:${u.vout}` === outpoint)?.value
}

/** Whether a new block should refetch a cached UTXO list. */
export function utxosWorthRefreshing(query: { state: { data: unknown } }): boolean {
  const list = (query.state.data as { data?: unknown } | undefined)?.data
  return !Array.isArray(list) || list.length <= UTXO_AUTO_REFRESH_MAX
}
