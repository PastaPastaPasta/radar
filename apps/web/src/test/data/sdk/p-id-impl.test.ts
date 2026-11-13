import { describe, expect, it, vi } from 'vitest'
import { pIdImpl, type PIdReads } from '@/data/sdk/worker/impl/p-id'
import { P_ID_CLASSES } from '@/data/sdk/methods/p-id'
import { fakeIdentity, proved } from './fakes'

const ID = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'
const OTHER = '81x7N39zKLhYDpYg6vk9AUjapc8VMxuDDZGHSMxPna5m'
const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

const reads = (over: Partial<Record<keyof PIdReads, unknown>>) => over as unknown as PIdReads

const key = (over: Record<string, unknown> = {}) => ({
  keyId: 4,
  keyTypeNumber: 0,
  purposeNumber: 1,
  securityLevelNumber: 3,
  isReadOnly: false,
  data: '02ab',
  free: vi.fn(),
  ...over,
})

describe('identity keys', () => {
  it('asks for every key, and for named ones when ids are given', async () => {
    const getKeysWithProof = vi.fn(() => Promise.resolve(proved([key()])))
    const sdk = reads({ identities: { getKeysWithProof } })
    await pIdImpl['identities.getKeys'](sdk, { id: ID })
    expect(getKeysWithProof).toHaveBeenLastCalledWith({ identityId: ID, request: { type: 'all' } })
    await pIdImpl['identities.getKeys'](sdk, { id: ID, keyIds: [1, 4] })
    expect(getKeysWithProof).toHaveBeenLastCalledWith({
      identityId: ID,
      request: { type: 'specific', specificKeyIds: [1, 4] },
    })
  })

  it('turns a key into plain data: bytes from hex, disabled time, expiry and contract bounds', async () => {
    const wasmKey = key({
      data: '02ab',
      disabledAt: 1234n,
      expiresAt: 99n,
      contractBounds: {
        toJSON: () => ({ $type: 'documentType', id: CONTRACT, documentTypeName: 'profile' }),
      },
    })
    const out = await pIdImpl['identities.getKeys'](
      reads({ identities: { getKeysWithProof: () => Promise.resolve(proved([wasmKey])) } }),
      { id: ID },
    )
    expect(out.data).toEqual([
      {
        id: 4,
        type: 0,
        purpose: 1,
        securityLevel: 3,
        readOnly: false,
        data: Uint8Array.from([0x02, 0xab]),
        disabledAt: 1234,
        expiresAt: 99,
        contractBounds: { type: 'documentType', id: CONTRACT, documentTypeName: 'profile' },
      },
    ])
    expect(out.response).toBeDefined()
    expect(wasmKey.free).toHaveBeenCalled()
  })

  it('keeps a key with the bytes the SDK already hands over', async () => {
    const out = await pIdImpl['identities.getKeys'](
      reads({
        identities: {
          getKeysWithProof: () =>
            Promise.resolve(proved([key({ data: Uint8Array.from([1, 2, 3]) })])),
        },
      }),
      { id: ID },
    )
    expect(out.data[0]?.data).toEqual(Uint8Array.from([1, 2, 3]))
  })

  it('returns only the asked identity’s keys bound to a contract', async () => {
    const contractKeysWithProof = vi.fn(() =>
      Promise.resolve(
        proved([
          { identityId: OTHER, keys: [key({ keyId: 9 })], free: vi.fn() },
          { identityId: ID, keys: [key({ keyId: 5 })], free: vi.fn() },
        ]),
      ),
    )
    const out = await pIdImpl['identities.contractKeys'](
      reads({ identities: { contractKeysWithProof } }),
      { id: ID, contractId: CONTRACT, purposes: [0] },
    )
    expect(contractKeysWithProof).toHaveBeenCalledWith({
      identityIds: [ID],
      contractId: CONTRACT,
      purposes: [0],
    })
    expect(out.data.map((k) => k.id)).toEqual([5])
  })
})

describe('nonces, balance and revision', () => {
  it('answers a nonce, and null for an identity with none', async () => {
    const nonceWithProof = vi.fn(() => Promise.resolve(proved<bigint | undefined>(12n)))
    const sdk = reads({ identities: { nonceWithProof } })
    expect((await pIdImpl['identities.nonce'](sdk, { id: ID })).data).toBe(12n)
    nonceWithProof.mockResolvedValueOnce(proved<bigint | undefined>(undefined))
    expect((await pIdImpl['identities.nonce'](sdk, { id: ID })).data).toBe(null)
  })

  it('answers a contract nonce for the identity and contract asked', async () => {
    const contractNonceWithProof = vi.fn(() => Promise.resolve(proved<bigint | undefined>(3n)))
    const out = await pIdImpl['identities.contractNonce'](
      reads({ identities: { contractNonceWithProof } }),
      { id: ID, contractId: CONTRACT },
    )
    expect(contractNonceWithProof).toHaveBeenCalledWith(ID, CONTRACT)
    expect(out.data).toBe(3n)
  })

  it('answers balance and revision together, null when the identity is absent', async () => {
    const free = vi.fn()
    const balanceAndRevisionWithProof = vi
      .fn()
      .mockResolvedValueOnce(proved({ balance: 500n, revision: 4n, free }))
      .mockResolvedValueOnce(proved(undefined))
    const sdk = reads({ identities: { balanceAndRevisionWithProof } })
    const found = await pIdImpl['identities.balanceAndRevision'](sdk, { id: ID })
    expect(found.data).toEqual({ balance: 500n, revision: 4 })
    expect(found.response).toBeDefined()
    expect(free).toHaveBeenCalled()
    expect((await pIdImpl['identities.balanceAndRevision'](sdk, { id: ID })).data).toBe(null)
  })
})

describe('non-unique public key hash', () => {
  it('lists the identities and passes the cursor on', async () => {
    const byNonUniquePublicKeyHashWithProof = vi.fn(() =>
      Promise.resolve(proved([fakeIdentity(ID, 7n), fakeIdentity(OTHER, 2n)])),
    )
    const out = await pIdImpl['identities.byNonUniquePublicKeyHash'](
      reads({ identities: { byNonUniquePublicKeyHashWithProof } }),
      { pkh: 'ab'.repeat(20), startAfter: OTHER },
    )
    expect(byNonUniquePublicKeyHashWithProof).toHaveBeenCalledWith('ab'.repeat(20), OTHER)
    expect(out.data.map((i) => i.id)).toEqual([ID, OTHER])
    expect(out.data[0]).toMatchObject({ balance: 7n, revision: 3 })
  })
})

describe('groups and votes', () => {
  it('lists the groups an identity is in, with the contracts it was asked about', async () => {
    const identityGroupsWithProof = vi.fn(() =>
      Promise.resolve(
        proved([
          { dataContractId: CONTRACT, groupContractPosition: 1, role: 'member', power: 3n },
          { dataContractId: OTHER, groupContractPosition: 0, role: 'member', power: undefined },
        ]),
      ),
    )
    const out = await pIdImpl['group.identityGroups'](
      reads({ group: { identityGroupsWithProof } }),
      { identityId: ID, memberContracts: [CONTRACT, OTHER] },
    )
    expect(identityGroupsWithProof).toHaveBeenCalledWith({
      identityId: ID,
      memberDataContracts: [CONTRACT, OTHER],
    })
    expect(out.data).toEqual([
      { contractId: CONTRACT, position: 1, role: 'member', power: 3 },
      { contractId: OTHER, position: 0, role: 'member', power: null },
    ])
  })

  it('turns each vote into its poll and choice, in the order the SDK gave', async () => {
    const vote = (choice: unknown) => ({
      toJSON: () => ({
        votePoll: {
          contractId: CONTRACT,
          documentTypeName: 'domain',
          indexName: 'parentNameAndLabel',
          indexValues: ['dash', 'alice'],
        },
        resourceVoteChoice: choice,
      }),
      free: vi.fn(),
    })
    const votes = new Map<string, ReturnType<typeof vote>>([
      ['VoteA', vote({ $type: 'towardsIdentity', identity: OTHER })],
      ['VoteB', vote({ $type: 'lock' })],
      ['VoteC', vote({ $type: 'abstain' })],
    ])
    const contestedResourceIdentityVotesWithProof = vi.fn(() => Promise.resolve(proved(votes)))
    const out = await pIdImpl['voting.contestedResourceIdentityVotes'](
      reads({ voting: { contestedResourceIdentityVotesWithProof } }),
      { identityId: ID, limit: 25, startAtVoteId: 'VoteZ', startAtIncluded: false },
    )
    expect(contestedResourceIdentityVotesWithProof).toHaveBeenCalledWith({
      identityId: ID,
      limit: 25,
      startAtVoteId: 'VoteZ',
      startAtIncluded: false,
    })
    expect(out.data.map((v) => v.voteId)).toEqual(['VoteA', 'VoteB', 'VoteC'])
    expect(out.data[0]).toEqual({
      voteId: 'VoteA',
      contractId: CONTRACT,
      documentTypeName: 'domain',
      indexName: 'parentNameAndLabel',
      indexValues: ['dash', 'alice'],
      choice: { type: 'towardsIdentity', identityId: OTHER },
    })
    expect(out.data.map((v) => v.choice.type)).toEqual(['towardsIdentity', 'lock', 'abstain'])
  })

  it('answers no votes as an empty list', async () => {
    const out = await pIdImpl['voting.contestedResourceIdentityVotes'](
      reads({
        voting: { contestedResourceIdentityVotesWithProof: () => Promise.resolve(proved(new Map())) },
      }),
      { identityId: ID },
    )
    expect(out.data).toEqual([])
  })
})

describe('data classes', () => {
  it('keeps balances, nonces and votes live and keys and groups structural', () => {
    expect(P_ID_CLASSES['identities.nonce']).toBe('live')
    expect(P_ID_CLASSES['identities.balanceAndRevision']).toBe('live')
    expect(P_ID_CLASSES['voting.contestedResourceIdentityVotes']).toBe('live')
    expect(P_ID_CLASSES['identities.getKeys']).toBe('structural')
    expect(P_ID_CLASSES['group.identityGroups']).toBe('structural')
  })
})
