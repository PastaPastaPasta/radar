import { local, mapSourced, type Sourced } from '../envelope'
import { SourceError } from '../errors'
import { createBatcher } from '../query/batch'
import { sdk } from './client'
import type {
  ContractDto,
  DocumentDto,
  PlatformAddressInfoDto,
  TokenStatusDto,
} from './methods/shared'
import { isPlatformId } from '@/lib/base58'
import { decodePlatformAddress } from '@/lib/bech32'
import { systemContract } from '@/lib/well-known'
import type { NetworkId } from '@/lib/network'

/** Drive's cap on the values of one `in` clause, and on the rows of one query. */
const DRIVE_MAX = 100
/** The DPNS data contract has the same id on every network. */
export const DPNS_CONTRACT = systemContract('dpns').id
/** Most SDK calls one batch has in flight at a time. */
const FANOUT = 4

type Answer<K, V> = Sourced<Map<K, V | null | Error>>

/** Fills a result map so that every asked key has an entry, and keeps the stamp of the answer. */
function keyed<V>(keys: string[], answer: Sourced<Map<string, V | null>>) {
  return mapSourced(
    answer,
    (m) => new Map<string, V | null | Error>(keys.map((k) => [k, m.get(k) ?? null])),
  )
}

const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)))

/** The reason a key can't be asked, or undefined. */
type Problem<K> = (key: K) => string | undefined

const problemOf =
  (what: string, isValid: (value: string) => boolean): Problem<string> =>
  (key) =>
    isValid(key) ? undefined : `Not ${what}: ${key.slice(0, 64)}`

const idProblem = problemOf('an ID', isPlatformId)

/**
 * Runs `runValid` on the keys that can be asked, and answers the others with their own error, so one malformed key
 * never fails its neighbours.
 */
async function withValidKeys<K, V>(
  keys: K[],
  problem: Problem<K>,
  runValid: (valid: K[]) => Promise<Answer<K, V>>,
): Promise<Answer<K, V>> {
  const bad = new Map<K, V | null | Error>()
  const valid: K[] = []
  for (const k of keys) {
    const message = problem(k)
    if (message === undefined) valid.push(k)
    else bad.set(k, new SourceError({ source: 'sdk', kind: 'invalid-response', message }))
  }
  if (bad.size === 0) return runValid(valid)
  const answer = valid.length > 0 ? await runValid(valid) : local(new Map<K, V | null | Error>())
  return mapSourced(answer, (m) => new Map([...m, ...bad]))
}

/** Runs `task` over `items`, at most `FANOUT` at a time; each outcome is its own, so one failure leaves the rest. */
async function settledLimited<T, R>(
  items: T[],
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array<PromiseSettledResult<R>>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await task(items[i]!).then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      )
    }
  }
  await Promise.all(Array.from({ length: Math.min(FANOUT, items.length) }, worker))
  return out
}

export const identityBalance = createBatcher<string, bigint>({
  name: 'identity-balance',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  run: (net, ids) =>
    withValidKeys(ids, problemOf('an identity ID', isPlatformId), async (valid) =>
      keyed(valid, await sdk.call(net, 'identities.balances', { ids: valid })),
    ),
})

export const contractMeta = createBatcher<string, ContractDto>({
  name: 'contract-meta',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  dataClass: 'structural',
  run: (net, ids) =>
    withValidKeys(ids, problemOf('a contract ID', isPlatformId), async (valid) =>
      keyed(valid, await sdk.call(net, 'contracts.getMany', { ids: valid })),
    ),
})

export const tokenStatus = createBatcher<string, TokenStatusDto>({
  name: 'token-status',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  keyParam: 'tokenId',
  run: (net, tokenIds) =>
    withValidKeys(tokenIds, problemOf('a token ID', isPlatformId), async (valid) =>
      keyed(valid, await sdk.call(net, 'tokens.statuses', { tokenIds: valid })),
    ),
})

export interface TokenBalanceKey {
  tokenId: string
  identityId: string
}

/**
 * One call per group, at most four at a time: `tokens.identityBalances` per identity when the batch holds fewer
 * identities than tokens, otherwise `tokens.balances` per token. A group that fails fails only its own keys; the stamp
 * is the oldest of the answers.
 */
export const tokenBalance = createBatcher<TokenBalanceKey, bigint>({
  name: 'token-balance',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  keyParam: 'key',
  run: (net, keys) =>
    withValidKeys(
      keys,
      (k) => idProblem(k.tokenId) ?? idProblem(k.identityId),
      async (valid) => {
        const byIdentity =
          new Set(valid.map((k) => k.identityId)).size < new Set(valid.map((k) => k.tokenId)).size
        const groups = new Map<string, TokenBalanceKey[]>()
        for (const k of valid) {
          const group = byIdentity ? k.identityId : k.tokenId
          groups.set(group, [...(groups.get(group) ?? []), k])
        }
        const memberGroups = [...groups.values()]
        const outcomes = await settledLimited(memberGroups, (members) =>
          byIdentity
            ? sdk.call(net, 'tokens.identityBalances', {
                identityId: members[0]!.identityId,
                tokenIds: members.map((k) => k.tokenId),
              })
            : sdk.call(net, 'tokens.balances', {
                tokenId: members[0]!.tokenId,
                identityIds: members.map((k) => k.identityId),
              }),
        )
        const balances = new Map<TokenBalanceKey, bigint | null | Error>()
        const stamps: Sourced<unknown>[] = []
        outcomes.forEach((outcome, i) => {
          for (const k of memberGroups[i]!) {
            balances.set(
              k,
              outcome.status === 'rejected'
                ? asError(outcome.reason)
                : (outcome.value.data.get(byIdentity ? k.tokenId : k.identityId) ?? null),
            )
          }
          if (outcome.status === 'fulfilled') stamps.push(outcome.value)
        })
        if (stamps.length === 0) throw [...balances.values()].find((v) => v instanceof Error)
        const oldest = stamps.reduce((a, b) => (b.asOf < a.asOf ? b : a))
        const { data, ...stamp } = oldest
        void data
        return { ...stamp, data: balances }
      },
    ),
})

export const platformAddressInfo = createBatcher<string, PlatformAddressInfoDto>({
  name: 'platform-address-info',
  source: 'sdk',
  maxBatch: DRIVE_MAX,
  keyParam: 'address',
  run: (net, addresses) =>
    withValidKeys(
      addresses,
      problemOf('a Platform address', (a) => decodePlatformAddress(a) !== null),
      async (valid) => keyed(valid, await sdk.call(net, 'addresses.getMany', { addresses: valid })),
    ),
})

/** The label of a DPNS `domain` document, as the name shown for its owner; the top-level `dash` has no parent and no name. */
const nameOf = (doc: DocumentDto): string | undefined => {
  const { label, normalizedParentDomainName: parent } = doc.data
  return typeof label === 'string' && typeof parent === 'string' && parent !== ''
    ? `${label}.${parent}`
    : undefined
}

/**
 * DPNS names for many identities in one `domain` query on the `records.identity` index; an identity with several
 * names gets the oldest. Identities the query's row limit may have cut off fall back to `dpns.usernames`, at most
 * four in flight; one that fails is unresolved while the names the query found stay.
 */
async function dpnsNames(net: NetworkId, identityIds: string[]): Promise<Answer<string, string>> {
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
  const out = new Map<string, string | null | Error>(
    identityIds.map((id) => [id, names.get(id)?.name ?? null]),
  )
  if (docs.data.length >= DRIVE_MAX) {
    const cut = identityIds.filter((id) => !names.has(id))
    const outcomes = await settledLimited(cut, (identityId) =>
      sdk.call(net, 'dpns.usernames', { identityId, limit: 1 }),
    )
    outcomes.forEach((outcome, i) => {
      out.set(
        cut[i]!,
        outcome.status === 'fulfilled' ? (outcome.value.data[0] ?? null) : asError(outcome.reason),
      )
    })
  }
  return mapSourced(docs, () => out)
}

export const dpnsName = createBatcher<string, string>({
  name: 'dpns-name',
  source: 'sdk',
  maxBatch: 25,
  dataClass: 'structural',
  keyParam: 'identityId',
  run: (net, identityIds) =>
    withValidKeys(identityIds, problemOf('an identity ID', isPlatformId), (valid) =>
      dpnsNames(net, valid),
    ),
})

export const sdkBatchers = {
  identityBalance,
  contractMeta,
  tokenStatus,
  tokenBalance,
  platformAddressInfo,
  dpnsName,
}
