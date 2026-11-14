import { describe, expect, it } from 'vitest'
import { encodeValue } from '../fixtures/sdk-codec'
import type { SdkFixture } from '../fixtures/sdk-load'
import { systemContract } from '@/lib/well-known'
import type { DocumentDto, DocumentsQueryArgs } from '@/data/sdk/methods/shared'
import { takeFixtureMisses } from './handlers/fixtures'
import { FixtureSdkTransport } from './sdk-transport'

const A = '3EvYxmAnGyAvy8mCzBqxjFPRBn1vTqtZ2zHYBdY1Ssd1'
const B = '4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6'
const C = 'rUnsWrFu3PKyRMGk2mxmZVBPbQuZx2qtHeFjURoQevX'
const D = 'HY1keaRK5bcDmujNCQq5pxNyvAiHHpoHQgLN5ppiu4kh'
const dpns = systemContract('dpns').id

const meta = (height: number) => ({ height, chainId: 'dash-testnet-51' })

function recording(
  method: string,
  args: unknown,
  data: unknown,
  at: string,
  extra: Record<string, unknown> = {},
): SdkFixture {
  return {
    method,
    args,
    recordedAt: at,
    result: encodeValue({
      ok: true,
      data,
      proved: true,
      meta: meta(Date.parse(at) % 1000),
      ...extra,
    }),
  }
}

function transport(...fixtures: SdkFixture[]) {
  const newestFirst = [...fixtures].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
  return new FixtureSdkTransport((method) =>
    Promise.resolve(newestFirst.filter((f) => f.method === method)),
  )
}

const contract = (id: string, version = 1) => ({
  id,
  ownerId: 'owner',
  version,
  documentSchemas: { note: { type: 'object' } },
})

const domain = (id: string, identity: string, label: string, createdAt: number): DocumentDto => ({
  id,
  ownerId: identity,
  contractId: dpns,
  type: 'domain',
  revision: 1n,
  createdAt,
  updatedAt: null,
  transferredAt: null,
  createdAtBlockHeight: null,
  updatedAtBlockHeight: null,
  transferredAtBlockHeight: null,
  createdAtCoreBlockHeight: null,
  updatedAtCoreBlockHeight: null,
  transferredAtCoreBlockHeight: null,
  data: { label, parentDomainName: 'dash', records: { identity } },
})

const domainQuery = (ids: string[], limit = 100): DocumentsQueryArgs => ({
  contractId: dpns,
  type: 'domain',
  where: [['records.identity', 'in', ids]],
  orderBy: [['records.identity', 'asc']],
  limit,
})

describe('FixtureSdkTransport composing contracts.getMany', () => {
  const t = () =>
    transport(
      recording(
        'contracts.getMany',
        { ids: [A, B] },
        new Map([
          [A, contract(A)],
          [B, null],
        ]),
        '2026-11-01T00:00:00Z',
      ),
      recording(
        'contracts.fetch',
        { id: C },
        { ...contract(C), keepsHistory: false, config: {}, indices: {}, tokens: [], groups: [] },
        '2026-11-02T00:00:00Z',
      ),
      recording('contracts.fetch', { id: D }, null, '2026-11-03T00:00:00Z', { meta: undefined }),
    )

  it('answers a regrouped batch from getMany and fetch recordings, with absence kept', async () => {
    const answer = await t().call('testnet', 'contracts.getMany', { ids: [C, B, A] })
    expect(answer).toMatchObject({ ok: true, proved: true })
    const map = (answer as { data: Map<string, unknown> }).data
    expect([...map.keys()]).toEqual([C, B, A])
    expect(map.get(C)).toEqual(contract(C))
    expect(map.get(B)).toBeNull()
    expect(map.get(A)).toEqual(contract(A))
    expect(takeFixtureMisses()).toEqual([])
  })

  it('takes the stamp of the newest recording it used', async () => {
    const answer = (await t().call('testnet', 'contracts.getMany', { ids: [A, C] })) as {
      meta: { height: number }
    }
    expect(answer.meta.height).toBe(Date.parse('2026-11-02T00:00:00Z') % 1000)
  })

  it('answers an id that a fetch recorded as absent with null', async () => {
    const answer = (await t().call('testnet', 'contracts.getMany', { ids: [D] })) as {
      data: Map<string, unknown>
    }
    expect(answer.data.get(D)).toBeNull()
  })

  it('misses when one id is not recorded', async () => {
    const answer = await t().call('testnet', 'contracts.getMany', {
      ids: [A, 'Dpns11111111111111111111111111111111111111'],
    })
    expect(answer).toMatchObject({ ok: false, error: { kind: 'network' } })
    expect(takeFixtureMisses()).toHaveLength(1)
  })
})

describe('FixtureSdkTransport composing documents.query', () => {
  const a1 = domain('d1', A, 'aaa', 30)
  const a2 = domain('d2', A, 'aab', 10)
  const b1 = domain('d3', B, 'bbb', 20)
  const c1 = domain('d4', C, 'ccc', 40)
  const t = () =>
    transport(
      recording('documents.query', domainQuery([A, B]), [a1, a2, b1], '2026-11-01T00:00:00Z'),
      recording('documents.query', domainQuery([A, C]), [a1, c1], '2026-11-02T00:00:00Z'),
      recording(
        'documents.query',
        {
          contractId: dpns,
          type: 'domain',
          where: [['records.identity', '==', D]],
          limit: 5,
        } satisfies DocumentsQueryArgs,
        [],
        '2026-11-03T00:00:00Z',
      ),
    )

  it('unions, dedupes and orders a regrouped batch', async () => {
    const answer = (await t().call('testnet', 'documents.query', domainQuery([C, B, A]))) as {
      data: DocumentDto[]
    }
    expect(answer.data.map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4'])
    expect(takeFixtureMisses()).toEqual([])
  })

  it('narrows to the asked values only', async () => {
    const answer = (await t().call('testnet', 'documents.query', domainQuery([B]))) as {
      data: DocumentDto[]
    }
    expect(answer.data.map((d) => d.id)).toEqual(['d3'])
  })

  it('orders by the call and cuts to its limit', async () => {
    const answer = (await t().call('testnet', 'documents.query', {
      ...domainQuery([A, B, C]),
      orderBy: [['$createdAt', 'desc']],
      limit: 3,
    })) as { data: DocumentDto[] }
    expect(answer.data.map((d) => d.id)).toEqual(['d4', 'd1', 'd3'])
  })

  it('takes a value covered by an == recording, as an empty set', async () => {
    const answer = (await t().call('testnet', 'documents.query', domainQuery([A, D]))) as {
      data: DocumentDto[]
    }
    expect(answer.data.map((d) => d.id)).toEqual(['d1', 'd2'])
  })

  it('stamps with the newest recording used', async () => {
    const answer = (await t().call('testnet', 'documents.query', domainQuery([A, B]))) as {
      meta: { height: number }
    }
    expect(answer.meta.height).toBe(Date.parse('2026-11-01T00:00:00Z') % 1000)
    const both = (await t().call('testnet', 'documents.query', domainQuery([B, C]))) as {
      meta: { height: number }
    }
    expect(both.meta.height).toBe(Date.parse('2026-11-02T00:00:00Z') % 1000)
  })

  it('misses when one value is uncovered, and for a query it cannot compose', async () => {
    const miss = await t().call(
      'testnet',
      'documents.query',
      domainQuery([A, 'Zz11111111111111111111111111111111111111']),
    )
    expect(miss).toMatchObject({ ok: false })
    const other = await t().call('testnet', 'documents.query', {
      ...domainQuery([A]),
      type: 'other',
    })
    expect(other).toMatchObject({ ok: false })
    const extra = await t().call('testnet', 'documents.query', {
      ...domainQuery([A]),
      where: [
        ['records.identity', 'in', [A]],
        ['label', '==', 'aaa'],
      ],
    })
    expect(extra).toMatchObject({ ok: false })
    expect(takeFixtureMisses()).toHaveLength(3)
  })
})

describe('FixtureSdkTransport composing dpns.usernames', () => {
  const a1 = domain('d1', A, 'second', 30)
  const a2 = domain('d2', A, 'first', 10)
  const t = () =>
    transport(
      recording(
        'dpns.usernames',
        { identityId: B, limit: 10 },
        ['bob.dash', 'bobby.dash'],
        '2026-11-01T00:00:00Z',
      ),
      recording(
        'dpns.usernames',
        { identityId: C, limit: 1 },
        ['carol.dash'],
        '2026-11-01T00:00:00Z',
      ),
      recording('dpns.usernames', { identityId: D, limit: 1 }, [], '2026-11-01T00:00:00Z'),
      recording('documents.query', domainQuery([A]), [a1, a2], '2026-11-02T00:00:00Z'),
    )

  it('cuts a recording with another limit', async () => {
    const answer = (await t().call('testnet', 'dpns.usernames', { identityId: B, limit: 1 })) as {
      data: string[]
    }
    expect(answer.data).toEqual(['bob.dash'])
  })

  it('serves a recorded limit-1 answer and an empty one', async () => {
    expect(
      (
        (await t().call('testnet', 'dpns.usernames', { identityId: C, limit: 1 })) as {
          data: string[]
        }
      ).data,
    ).toEqual(['carol.dash'])
    expect(
      (
        (await t().call('testnet', 'dpns.usernames', { identityId: D, limit: 5 })) as {
          data: string[]
        }
      ).data,
    ).toEqual([])
  })

  it('builds names from the domain documents, oldest first, cut to the limit', async () => {
    const all = (await t().call('testnet', 'dpns.usernames', { identityId: A })) as {
      data: string[]
      meta: { height: number }
    }
    expect(all.data).toEqual(['first.dash', 'second.dash'])
    expect(all.meta.height).toBe(Date.parse('2026-11-02T00:00:00Z') % 1000)
    const one = (await t().call('testnet', 'dpns.usernames', { identityId: A, limit: 1 })) as {
      data: string[]
    }
    expect(one.data).toEqual(['first.dash'])
  })

  it('misses for an identity nothing covers, and for a recording cut short of the ask', async () => {
    expect(
      await t().call('testnet', 'dpns.usernames', {
        identityId: 'Zz11111111111111111111111111111111111111',
        limit: 1,
      }),
    ).toMatchObject({ ok: false })
    expect(await t().call('testnet', 'dpns.usernames', { identityId: C, limit: 5 })).toMatchObject({
      ok: false,
    })
    expect(takeFixtureMisses()).toHaveLength(2)
  })
})

describe('FixtureSdkTransport composing epoch.evonodesProposedBlocksByIds', () => {
  const H1 = 'a'.repeat(64)
  const H2 = 'b'.repeat(64)
  const H3 = 'c'.repeat(64)
  const t = () =>
    transport(
      recording(
        'epoch.evonodesProposedBlocksByIds',
        { epoch: 88, proTxHashes: [H1, H2] },
        new Map([[H1, 4n]]),
        '2026-11-01T00:00:00Z',
      ),
      recording(
        'epoch.evonodesProposedBlocksByIds',
        { epoch: 87, proTxHashes: [H3] },
        new Map([[H3, 9n]]),
        '2026-11-02T00:00:00Z',
      ),
    )

  it('answers a regrouped batch, keeping an asked hash with no blocks out of the map', async () => {
    const answer = (await t().call('mainnet', 'epoch.evonodesProposedBlocksByIds', {
      epoch: 88,
      proTxHashes: [H2, H1],
    })) as { data: Map<string, bigint> }
    expect([...answer.data]).toEqual([[H1, 4n]])
    expect(takeFixtureMisses()).toEqual([])
  })

  it('misses for a hash recorded only in another epoch', async () => {
    const answer = await t().call('mainnet', 'epoch.evonodesProposedBlocksByIds', {
      epoch: 88,
      proTxHashes: [H1, H3],
    })
    expect(answer).toMatchObject({ ok: false, error: { kind: 'network' } })
    expect(takeFixtureMisses()).toHaveLength(1)
  })
})
