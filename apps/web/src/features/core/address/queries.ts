import type { NetworkId } from '@/lib/network'
import { hyphen } from '@/data/hyphen/client'
import { hyQueries } from '@/data/hyphen/queries'
import { hyKeys } from '@/data/query/keys'
import { cursorPages } from '../hy-shared/queries'

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
  txs: (net: NetworkId, address: string) =>
    cursorPages({
      key: addressKeys(net, address).txs,
      fetchPage: (cursor, signal) =>
        hyphen.addressTxs(net, address, { limit: HISTORY_LIMIT, cursor }, signal),
    }),
  utxos: (net: NetworkId, address: string) => hyQueries.addressUtxos(net, address, { limit: UTXO_LIMIT }),
}
