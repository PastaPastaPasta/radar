import { msg, t } from '@lingui/core/macro'
import { stampOf } from '@/data/envelope'
import { base58Encode } from '@/lib/base58'
import { hexToBytes } from '@/lib/hex'
import { wellKnownLabel, wellKnownTokens } from '@/lib/well-known'
import type { Resolver } from '../types'
import { shortId } from './helpers'

/** Identity ids come as base58 text or as 64 hex characters. */
function identityId(c: { classes: string[]; normalized: string }): string {
  return c.classes.includes('base58-id') ? c.normalized : base58Encode(hexToBytes(c.normalized))
}

/** An identity by ID, with its DPNS name when it has one; both are proof-checked reads. */
export const sdkIdentity: Resolver = {
  id: 'sdk-identity',
  accepts: ['base58-id', 'hex64'],
  cost: 'sdk',
  what: msg`Identities`,
  async resolve(c, { net, signal }) {
    const id = identityId(c)
    const { sdk } = await import('@/data/sdk/client')
    const found = await sdk.call(net, 'identities.fetch', { id }, signal)
    if (!found.data) return []
    const { dpnsName } = await import('@/data/sdk/batchers')
    const name = await dpnsName.fetch(net, id, signal).then(
      (n) => n.data,
      () => null,
    )
    const known = wellKnownLabel(net, 'identity', id)
    return [
      {
        kind: 'identity',
        id,
        title: name ?? known ?? t`Identity ${shortId(id)}`,
        subtitle: name || known ? shortId(id) : undefined,
        href: { to: '/identity/$id', params: { id } },
        stamp: stampOf(found),
        rank: 100,
      },
    ]
  },
}

/** A data contract by ID, through the contract batcher. */
export const sdkContract: Resolver = {
  id: 'sdk-contract',
  accepts: ['base58-id'],
  cost: 'sdk',
  what: msg`Data contracts`,
  async resolve(c, { net, signal }) {
    const { contractMeta } = await import('@/data/sdk/batchers')
    const found = await contractMeta.fetch(net, c.normalized, signal)
    if (!found.data) return []
    const owner = shortId(found.data.ownerId)
    return [
      {
        kind: 'contract',
        id: c.normalized,
        title:
          wellKnownLabel(net, 'contract', c.normalized) ?? t`Contract ${shortId(c.normalized)}`,
        subtitle: t`Owned by ${owner}`,
        href: { to: '/contract/$id', params: { id: c.normalized } },
        stamp: stampOf(found),
        rank: 100,
      },
    ]
  },
}

/** A token by ID: the contract and position it belongs to. */
export const sdkToken: Resolver = {
  id: 'sdk-token',
  accepts: ['base58-id'],
  cost: 'sdk',
  what: msg`Tokens`,
  async resolve(c, { net, signal }) {
    const { sdk } = await import('@/data/sdk/client')
    const found = await sdk.call(net, 'tokens.contractInfo', { tokenId: c.normalized }, signal)
    if (!found.data) return []
    const known = wellKnownTokens(net).find((tok) => tok.id === c.normalized)
    const contract = shortId(found.data.contractId)
    const position = found.data.position
    return [
      {
        kind: 'token',
        id: c.normalized,
        title: known?.symbol ?? t`Token ${shortId(c.normalized)}`,
        subtitle: t`Contract ${contract}, position ${position}`,
        href: { to: '/token/$id', params: { id: c.normalized } },
        stamp: stampOf(found),
        rank: 100,
      },
    ]
  },
}

/** A document, only from a pasted `contract/type/id`: Platform has no lookup of a document by its ID alone. */
export const sdkDocument: Resolver = {
  id: 'sdk-document',
  accepts: ['document-path'],
  cost: 'sdk',
  what: msg`Documents`,
  async resolve(c, { net, signal }) {
    const [contractId, type, id] = c.normalized.split('/') as [string, string, string]
    const { sdk } = await import('@/data/sdk/client')
    const found = await sdk.call(net, 'documents.get', { contractId, type, id }, signal)
    if (!found.data) return []
    const contract = shortId(contractId)
    return [
      {
        kind: 'document',
        id: `${contractId}/${type}/${id}`,
        title: t`Document ${shortId(id)}`,
        subtitle: t`${type} in contract ${contract}`,
        href: { to: '/document/$contract/$type/$id', params: { contract: contractId, type, id } },
        stamp: stampOf(found),
        rank: 100,
      },
    ]
  },
}
