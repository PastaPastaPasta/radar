import { useQueries, useQuery } from '@tanstack/react-query'
import { viewKeys } from '@/data/query/keys'
import { sdkBatchers } from '@/data/sdk/batchers'
import { useNetwork } from '@/features/entity'
import { base58Encode } from '@/lib/base58'
import { hexToBytes } from '@/lib/hex'

/** An asset lock funds at most this many identities Radar looks for, so a crafted payload cannot start a hundred reads. */
const MAX_OUTPUTS = 8

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

/**
 * The id Platform gives the identity an asset lock's credit output `index` creates: the double SHA-256 of the output's
 * outpoint, the transaction id in the byte order Core keeps it (the reverse of the id as shown) and the output number
 * as four little-endian bytes. It is arithmetic, not a lookup: the identity is real only once Platform answers for it.
 */
export async function fundedIdentityId(txid: string, index: number): Promise<string> {
  const outpoint = new Uint8Array(36)
  outpoint.set(hexToBytes(txid).reverse(), 0)
  new DataView(outpoint.buffer).setUint32(32, index, true)
  return base58Encode(await sha256(await sha256(outpoint)))
}

export interface FundedIdentity {
  index: number
  id: string
}

/**
 * The identities an asset lock created, found by deriving each credit output's identity id and asking Platform's SDK
 * (proof-checked) whether it exists. A lock that tops up an identity that already existed derives an id nothing
 * holds, so it lists none. `ready` is false until every credit output has been asked; `failed` is true when a read errored, so an empty list is not read as "none".
 */
export function useFundedIdentities(txid: string, outputCount: number) {
  const net = useNetwork()
  const count = Math.min(outputCount, MAX_OUTPUTS)
  const derived = useQuery({
    queryKey: viewKeys(net, 'entity-funded-ids', { txid, count }),
    queryFn: () => Promise.all(Array.from({ length: count }, (_, i) => fundedIdentityId(txid, i))),
    staleTime: Infinity,
    enabled: count > 0,
  })
  const ids = derived.data ?? []
  const balances = useQueries({
    queries: ids.map((id) => sdkBatchers.identityBalance.queryOptions(net, id)),
  })
  const found: FundedIdentity[] = ids.flatMap((id, index) =>
    balances[index]?.data?.data == null ? [] : [{ index, id }],
  )
  const ready = count === 0 || (derived.isSuccess && balances.every((b) => !b.isPending))
  const failed = derived.isError || balances.some((b) => b.isError)
  return { found, ready, failed, source: balances.find((b) => b.data)?.data }
}
