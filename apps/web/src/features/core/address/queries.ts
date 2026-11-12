import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { mapSourced } from '@/data/envelope'
import { adaptAddress, adaptAddressTx, adaptUtxo } from '@/data/insight/adapt'
import { insPages, insQueries } from '@/data/insight/queries'
import { hyQueries } from '@/data/hyphen/queries'
import { hyPages } from '@/data/hyphen/pages'
import type { InsTxPage } from '@/data/insight/schemas'
import type { HyAddressTx, HyPage, HyUtxo } from '@/data/hyphen/schemas'
import { hyKeys, insKeys } from '@/data/query/keys'
import type { NetworkId } from '@/lib/network'

export const HISTORY_LIMIT = 25
export const UTXO_LIMIT = 25

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

const txRows = (address: string, page: InsTxPage): HyAddressTx[] =>
  page.txs.flatMap((tx) => adaptAddressTx(tx, address) ?? [])

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
  txs: (net: NetworkId, address: string) =>
    infiniteQueryOptions({
      ...insPages.addressTxs(net, address),
      select: (data) => ({
        ...data,
        pages: data.pages.map((p) =>
          mapSourced(p, (page): HyPage<HyAddressTx> => ({ items: txRows(address, page) })),
        ),
      }),
    }),
  utxos: (net: NetworkId, address: string) =>
    queryOptions({
      ...insQueries.addressUtxos(net, address),
      select: (s) =>
        mapSourced(s, (list): HyPage<HyUtxo> => ({
          items: list.slice(0, UTXO_LIMIT).map(adaptUtxo),
          total: list.length,
        })),
    }),
}
