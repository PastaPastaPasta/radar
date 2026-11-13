import { mapSourced, type Sourced } from '../envelope'
import { createBatcher } from '../query/batch'
import { sdk } from './client'
import type {
  ContractDto,
  DocumentDto,
  PlatformAddressInfoDto,
  TokenStatusDto,
} from './methods/shared'
import type { NetworkId } from '@/lib/network'

/** Drive's cap on the values of one `in` clause, and on the rows of one query. */
const DRIVE_MAX = 100
/** The DPNS data contract has the same id on every network. */
export const DPNS_CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const DPNS_FANOUT = 4

/** Fills a result map so that every asked key has an entry, and keeps the stamp of the answer. */
function keyed<V>(keys: string[], answer: Sourced<Map<string, V | null>>) {
  return mapSourced(answer, (m) => new Map(keys.map((k) => [k, m.get(k) ?? null])))
}

export const identityBalance = createBatcher<string, bigint>({
  name: 'identity-balance',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  run: async (net, ids) => keyed(ids, await sdk.call(net, 'identities.balances', { ids })),
})

export const contractMeta = createBatcher<string, ContractDto>({
  name: 'contract-meta',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  dataClass: 'structural',
  run: async (net, ids) => keyed(ids, await sdk.call(net, 'contracts.getMany', { ids })),
})

export const tokenStatus = createBatcher<string, TokenStatusDto>({
  name: 'token-status',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  keyParam: 'tokenId',
  run: async (net, tokenIds) =>
    keyed(tokenIds, await sdk.call(net, 'tokens.statuses', { tokenIds })),
})

export interface TokenBalanceKey {
  tokenId: string
  identityId: string
}

/** One `tokens.balances` call per token in the batch; the stamp is the oldest of them. */
export const tokenBalance = createBatcher<TokenBalanceKey, bigint>({
  name: 'token-balance',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  keyParam: 'key',
  run: async (net, keys) => {
    const byToken = new Map<string, string[]>()
    for (const k of keys) byToken.set(k.tokenId, [...(byToken.get(k.tokenId) ?? []), k.identityId])
    const answers = await Promise.all(
      [...byToken].map(async ([tokenId, identityIds]) => ({
        tokenId,
        answer: await sdk.call(net, 'tokens.balances', { tokenId, identityIds }),
      })),
    )
    const first = answers[0]!.answer
    const oldest = answers.reduce((a, b) => (b.answer.asOf < a.asOf ? b.answer : a), first)
    const balances = new Map<TokenBalanceKey, bigint | null>()
    for (const k of keys) {
      const hit = answers.find((a) => a.tokenId === k.tokenId)!.answer.data
      balances.set(k, hit.get(k.identityId) ?? null)
    }
    return { ...oldest, data: balances }
  },
})

export const platformAddressInfo = createBatcher<string, PlatformAddressInfoDto>({
  name: 'platform-address-info',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  keyParam: 'address',
  run: async (net, addresses) =>
    keyed(addresses, await sdk.call(net, 'addresses.getMany', { addresses })),
})

/** The label of a DPNS `domain` document, as the name shown for its owner. */
const nameOf = (doc: DocumentDto): string | undefined => {
  const { label, normalizedParentDomainName: parent } = doc.data
  return typeof label === 'string' && typeof parent === 'string' ? `${label}.${parent}` : undefined
}

/**
 * DPNS names for many identities in one `domain` query on the `records.identity` index; an identity with several
 * names gets the oldest. Identities the query's row limit may have cut off fall back to `dpns.usernames`, at most
 * four in flight.
 */
async function dpnsNames(
  net: NetworkId,
  identityIds: string[],
): Promise<Sourced<Map<string, string | null>>> {
  const docs = await sdk.call(net, 'documents.query', {
    contractId: DPNS_CONTRACT,
    type: 'domain',
    where: [['records.identity', 'in', identityIds]],
    orderBy: [['records.identity', 'asc']],
    limit: DRIVE_MAX,
  })
  const names = new Map<string, { name: string; at: number }>()
  for (const doc of docs.data) {
    const owner = doc.data.records
    const id =
      owner && typeof owner === 'object' ? (owner as { identity?: unknown }).identity : undefined
    const name = nameOf(doc)
    if (typeof id !== 'string' || !name) continue
    const at = doc.createdAt ?? Number.MAX_SAFE_INTEGER
    const held = names.get(id)
    if (!held || at < held.at) names.set(id, { name, at })
  }
  const out = new Map<string, string | null>(
    identityIds.map((id) => [id, names.get(id)?.name ?? null]),
  )
  if (docs.data.length >= DRIVE_MAX) {
    const cut = identityIds.filter((id) => !names.has(id))
    for (let i = 0; i < cut.length; i += DPNS_FANOUT) {
      await Promise.all(
        cut.slice(i, i + DPNS_FANOUT).map(async (identityId) => {
          const r = await sdk.call(net, 'dpns.usernames', { identityId, limit: 1 })
          out.set(identityId, r.data[0] ?? null)
        }),
      )
    }
  }
  return mapSourced(docs, () => out)
}

export const dpnsName = createBatcher<string, string>({
  name: 'dpns-name',
  source: 'sdk',
  maxBatch: 25,
  dataClass: 'structural',
  keyParam: 'identityId',
  run: dpnsNames,
})

export const sdkBatchers = {
  identityBalance,
  contractMeta,
  tokenStatus,
  tokenBalance,
  platformAddressInfo,
  dpnsName,
}
