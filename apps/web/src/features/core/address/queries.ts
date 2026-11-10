import type { NetworkId } from '@/lib/network'
import { hyQueries } from '@/data/hyphen/queries'
import { hyPages } from '@/data/hyphen/pages'
import { hyKeys } from '@/data/query/keys'

export const HISTORY_LIMIT = 25
export const UTXO_LIMIT = 25

/** Key prefixes for everything the address page reads, so a new block can refresh them together. */
export function addressKeys(net: NetworkId, address: string) {
  return {
    summary: hyKeys(net, 'address', { address }),
    txs: hyKeys(net, 'address-txs-pages', { address }),
    utxos: hyKeys(net, 'address-utxos', { address }),
  }
}

export const addressQueries = {
  summary: hyQueries.address,
  txs: (net: NetworkId, address: string) => hyPages.addressTxs(net, address, HISTORY_LIMIT),
  utxos: (net: NetworkId, address: string) =>
    hyQueries.addressUtxos(net, address, { limit: UTXO_LIMIT }),
}
