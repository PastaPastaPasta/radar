import { describe, expect, it, vi } from 'vitest'
import { sharedImpl, type SharedReads } from '@/data/sdk/worker/impl/shared'
import { base58Encode } from '@/lib/base58'
import { hexToBytes } from '@/lib/hex'
import { fakeIdentity, proved } from './fakes'

const ID = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'
const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const ABSENT = '11111111111111111111111111111111'
const PROTX_HEX = '001cb9381b08d784f4c1e1e220906874ea9e88f7124ebdf8baf0782007afad4f'
const PROTX_ID = base58Encode(hexToBytes(PROTX_HEX))
const safe = (name: string) =>
  Promise.resolve(name.toLowerCase().replace(/o/g, '0').replace(/[il]/g, '1'))

/** A facade where only the named group exists: any other call is a bug in the implementation under test. */
const reads = (over: Partial<Record<keyof SharedReads, unknown>>) => over as unknown as SharedReads

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'doc1',
  ownerId: ID,
  dataContractId: CONTRACT,
  documentTypeName: 'domain',
  revision: 2n,
  createdAt: 1_700_000_000_000n,
  updatedAt: undefined,
  createdAtBlockHeight: 400n,
  createdAtCoreBlockHeight: 2_000_000,
  properties: { label: 'alice', records: { identity: ID } },
  free: vi.fn(),
  ...over,
})

describe('identities and names', () => {
  it('finds an identity by public key hash, and null when none holds it', async () => {
    const found = reads({
      identities: { byPublicKeyHashWithProof: () => Promise.resolve(proved(fakeIdentity(ID, 7n))) },
    })
    const out = await sharedImpl['identities.byPublicKeyHash'](found, { pkh: 'ab'.repeat(20) })
    expect(out.data).toMatchObject({ id: ID, balance: 7n })
    expect(out.response).toBeDefined()
    const none = reads({
      identities: { byPublicKeyHashWithProof: () => Promise.resolve(proved(undefined)) },
    })
    expect(
      (await sharedImpl['identities.byPublicKeyHash'](none, { pkh: 'ab'.repeat(20) })).data,
    ).toBe(null)
  })

  it('lists an identity’s names with the limit it was given', async () => {
    const usernamesWithProof = vi.fn(() => Promise.resolve(proved(['alice.dash', 'al.dash'])))
    const out = await sharedImpl['dpns.usernames'](reads({ dpns: { usernamesWithProof } }), {
      identityId: ID,
      limit: 5,
    })
    expect(usernamesWithProof).toHaveBeenCalledWith({ identityId: ID, limit: 5 })
    expect(out.data).toEqual(['alice.dash', 'al.dash'])
  })

  it('looks a name up by its homograph-safe form and answers with the name as asked', async () => {
    const info = { username: 'pshenm1c.dash', identityId: ID, documentId: 'doc1', free: vi.fn() }
    const lookup = vi.fn((name: string) =>
      Promise.resolve(proved(name === 'pshenm1c.dash' ? info : null)),
    )
    const out = await sharedImpl['dpns.getUsernameByName'](
      reads({ dpns: { getUsernameByNameWithProof: lookup, convertToHomographSafe: safe } }),
      { name: 'Pshenmic.dash' },
    )
    expect(lookup).toHaveBeenCalledWith('pshenm1c.dash')
    expect(out.data).toMatchObject({ username: 'Pshenmic.dash', identityId: ID })
  })

  it('maps a name to its owner and document, or null', async () => {
    const free = vi.fn()
    const info = { username: 'alice.dash', identityId: ID, documentId: 'doc1', free }
    const lookup = vi.fn(() => Promise.resolve(proved(info)))
    const hit = reads({
      dpns: { getUsernameByNameWithProof: lookup, convertToHomographSafe: safe },
    })
    expect((await sharedImpl['dpns.getUsernameByName'](hit, { name: 'alice.dash' })).data).toEqual({
      username: 'alice.dash',
      identityId: ID,
      documentId: 'doc1',
    })
    expect(free).toHaveBeenCalled()
    const miss = reads({
      dpns: {
        getUsernameByNameWithProof: () => Promise.resolve(proved(undefined)),
        convertToHomographSafe: safe,
      },
    })
    expect((await sharedImpl['dpns.getUsernameByName'](miss, { name: 'nobody.dash' })).data).toBe(
      null,
    )
  })
})

describe('documents', () => {
  it('passes the query through, caps the limit at 100 and maps each document', async () => {
    const d = doc()
    const queryWithProof = vi.fn(() =>
      Promise.resolve(
        proved(
          new Map<string, unknown>([
            ['doc1', d],
            ['gone', undefined],
          ]),
        ),
      ),
    )
    const out = await sharedImpl['documents.query'](reads({ documents: { queryWithProof } }), {
      contractId: CONTRACT,
      type: 'domain',
      where: [['normalizedLabel', 'startsWith', 'ali']],
      orderBy: [['normalizedLabel', 'asc']],
      limit: 500,
      startAfter: 'doc0',
    })
    expect(queryWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      documentTypeName: 'domain',
      where: [['normalizedLabel', 'startsWith', 'ali']],
      orderBy: [['normalizedLabel', 'asc']],
      limit: 100,
      startAfter: 'doc0',
    })
    expect(out.data).toEqual([
      {
        id: 'doc1',
        ownerId: ID,
        contractId: CONTRACT,
        type: 'domain',
        revision: 2n,
        createdAt: 1_700_000_000_000,
        updatedAt: null,
        transferredAt: null,
        createdAtBlockHeight: 400,
        updatedAtBlockHeight: null,
        transferredAtBlockHeight: null,
        createdAtCoreBlockHeight: 2_000_000,
        updatedAtCoreBlockHeight: null,
        transferredAtCoreBlockHeight: null,
        data: { label: 'alice', records: { identity: ID } },
      },
    ])
    expect(d.free).toHaveBeenCalled()
  })

  it('asks for 100 rows when no limit is given', async () => {
    const queryWithProof = vi.fn(() => Promise.resolve(proved(new Map())))
    await sharedImpl['documents.query'](reads({ documents: { queryWithProof } }), {
      contractId: CONTRACT,
      type: 'domain',
    })
    expect(queryWithProof).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
  })

  it('gets one document, or null', async () => {
    const hit = reads({ documents: { getWithProof: () => Promise.resolve(proved(doc())) } })
    const args = { contractId: CONTRACT, type: 'domain', id: 'doc1' }
    expect((await sharedImpl['documents.get'](hit, args)).data).toMatchObject({ id: 'doc1' })
    const miss = reads({ documents: { getWithProof: () => Promise.resolve(proved(undefined)) } })
    expect((await sharedImpl['documents.get'](miss, args)).data).toBe(null)
  })
})

describe('contracts.fetch', () => {
  const contract = {
    id: CONTRACT,
    ownerId: ID,
    version: 3n,
    free: vi.fn(),
    toJSON: () => ({
      documentSchemas: {
        domain: {
          indices: [
            {
              name: 'parentNameAndLabel',
              properties: [{ normalizedParentDomainName: 'asc' }, { normalizedLabel: 'desc' }],
              unique: true,
              contested: { fieldMatches: [] },
            },
            { name: 'ownerId', properties: [{ $ownerId: 'asc' }] },
            'not an index',
          ],
        },
        note: { type: 'object' },
      },
      config: { keepsHistory: true, readonly: false },
      tokens: { '1': { conventions: { decimals: 8 } }, '0': { baseSupply: 100 } },
      groups: { '0': { members: { [ID]: 2, other: 1 }, requiredPower: 3 } },
    }),
  }

  it('carries schemas, indices, tokens, groups and keepsHistory', async () => {
    const out = await sharedImpl['contracts.fetch'](
      reads({ contracts: { fetchWithProof: () => Promise.resolve(proved(contract)) } }),
      { id: CONTRACT },
    )
    expect(out.data).toMatchObject({
      id: CONTRACT,
      ownerId: ID,
      version: 3,
      keepsHistory: true,
      config: { keepsHistory: true, readonly: false },
      indices: {
        domain: [
          {
            name: 'parentNameAndLabel',
            properties: [
              { field: 'normalizedParentDomainName', order: 'asc' },
              { field: 'normalizedLabel', order: 'desc' },
            ],
            unique: true,
            contested: true,
          },
          {
            name: 'ownerId',
            properties: [{ field: '$ownerId', order: 'asc' }],
            unique: false,
            contested: false,
          },
        ],
        note: [],
      },
      tokens: [
        { position: 0, config: { baseSupply: 100 } },
        { position: 1, config: { conventions: { decimals: 8 } } },
      ],
      groups: [
        {
          position: 0,
          requiredPower: 3,
          members: [
            { id: ID, power: 2 },
            { id: 'other', power: 1 },
          ],
        },
      ],
    })
    expect(Object.keys(out.data!.documentSchemas)).toEqual(['domain', 'note'])
  })

  it('answers null for a contract that does not exist', async () => {
    const out = await sharedImpl['contracts.fetch'](
      reads({ contracts: { fetchWithProof: () => Promise.resolve(proved(undefined)) } }),
      { id: ABSENT },
    )
    expect(out.data).toBe(null)
  })

  it('answers null, unproved, when the SDK throws that the contract is not found', async () => {
    const out = await sharedImpl['contracts.fetch'](
      reads({
        contracts: {
          fetchWithProof: () =>
            Promise.reject(
              Object.assign(new Error('Data contract not found'), { name: 'Generic' }),
            ),
        },
      }),
      { id: ABSENT },
    )
    expect(out).toEqual({ data: null })
  })

  it('does not hide other failures', async () => {
    await expect(
      sharedImpl['contracts.fetch'](
        reads({ contracts: { fetchWithProof: () => Promise.reject(new Error('boom')) } }),
        { id: CONTRACT },
      ),
    ).rejects.toThrow('boom')
  })

  it('has no tokens, groups or history when the contract states none', async () => {
    const bare = { ...contract, toJSON: () => ({ documentSchemas: {} }) }
    const out = await sharedImpl['contracts.fetch'](
      reads({ contracts: { fetchWithProof: () => Promise.resolve(proved(bare)) } }),
      { id: CONTRACT },
    )
    expect(out.data).toMatchObject({ keepsHistory: false, tokens: [], groups: [], indices: {} })
  })
})

describe('tokens', () => {
  const TOKEN = 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB'
  const OTHER = '9YxdbQUjJmQsmVPen95HjAU3Esj7tVkWSY2EQWT84ZQP'

  it('maps a token to its contract and position, supply, and null for an unknown token', async () => {
    const info = { contractId: CONTRACT, tokenContractPosition: 2 }
    const t = reads({
      tokens: {
        contractInfoWithProof: () => Promise.resolve(proved(info)),
        totalSupplyWithProof: () => Promise.resolve(proved({ totalSupply: 10n ** 12n })),
      },
    })
    expect((await sharedImpl['tokens.contractInfo'](t, { tokenId: TOKEN })).data).toEqual({
      contractId: CONTRACT,
      position: 2,
    })
    expect((await sharedImpl['tokens.totalSupply'](t, { tokenId: TOKEN })).data).toBe(10n ** 12n)
    const none = reads({
      tokens: {
        contractInfoWithProof: () => Promise.resolve(proved(undefined)),
        totalSupplyWithProof: () => Promise.resolve(proved(undefined)),
      },
    })
    expect((await sharedImpl['tokens.contractInfo'](none, { tokenId: ABSENT })).data).toBe(null)
    expect((await sharedImpl['tokens.totalSupply'](none, { tokenId: ABSENT })).data).toBe(null)
  })

  it('gives every asked token a status, null for the ones the SDK left out', async () => {
    const t = reads({
      tokens: {
        statusesWithProof: () =>
          Promise.resolve(proved(new Map([[TOKEN, { isPaused: true, free: vi.fn() }]]))),
      },
    })
    const out = await sharedImpl['tokens.statuses'](t, { tokenIds: [TOKEN, OTHER] })
    expect(out.data).toEqual(
      new Map([
        [TOKEN, { paused: true }],
        [OTHER, null],
      ]),
    )
  })

  it('reads balances by identity or by token, with null for no balance', async () => {
    const balancesWithProof = vi.fn(() => Promise.resolve(proved(new Map([[ID, 5n]]))))
    const identityBalancesWithProof = vi.fn(() => Promise.resolve(proved(new Map([[TOKEN, 9n]]))))
    const t = reads({ tokens: { balancesWithProof, identityBalancesWithProof } })
    const byToken = await sharedImpl['tokens.balances'](t, {
      tokenId: TOKEN,
      identityIds: [ID, OTHER],
    })
    expect(balancesWithProof).toHaveBeenCalledWith([ID, OTHER], TOKEN)
    expect(byToken.data).toEqual(
      new Map([
        [ID, 5n],
        [OTHER, null],
      ]),
    )
    const byIdentity = await sharedImpl['tokens.identityBalances'](t, {
      identityId: ID,
      tokenIds: [TOKEN, OTHER],
    })
    expect(byIdentity.data).toEqual(
      new Map([
        [TOKEN, 9n],
        [OTHER, null],
      ]),
    )
  })

  it('reads whether an identity’s balance of a token is frozen', async () => {
    const t = reads({
      tokens: {
        identityTokenInfosWithProof: () =>
          Promise.resolve(proved(new Map([[TOKEN, { isFrozen: true }]]))),
      },
    })
    const out = await sharedImpl['tokens.identityTokenInfos'](t, {
      identityId: ID,
      tokenIds: [TOKEN, OTHER],
    })
    expect(out.data).toEqual(
      new Map([
        [TOKEN, { frozen: true }],
        [OTHER, null],
      ]),
    )
  })

  it('calculates a token id locally, with no proof', async () => {
    const calculateId = vi.fn(() => Promise.resolve(TOKEN))
    const out = await sharedImpl['tokens.calculateId'](reads({ tokens: { calculateId } }), {
      contractId: CONTRACT,
      position: 0,
    })
    expect(calculateId).toHaveBeenCalledWith(CONTRACT, 0)
    expect(out).toEqual({ data: TOKEN })
  })
})

describe('epochs and protocol', () => {
  const extended = (index: number) => ({
    toJSON: () => ({
      index,
      firstBlockTime: index * 1000,
      firstBlockHeight: String(index * 10),
      firstCoreBlockHeight: index * 100,
      feeMultiplierPermille: 1000,
      protocolVersion: 12,
    }),
    free: vi.fn(),
  })

  it('lists epochs in the order the SDK gave them and skips the missing', async () => {
    const epochsInfoWithProof = vi.fn(() =>
      Promise.resolve(
        proved(
          new Map<number, unknown>([
            [3, extended(3)],
            [4, undefined],
            [5, extended(5)],
          ]),
        ),
      ),
    )
    const out = await sharedImpl['epoch.epochsInfo'](reads({ epoch: { epochsInfoWithProof } }), {
      startEpoch: 3,
      count: 3,
    })
    expect(epochsInfoWithProof).toHaveBeenCalledWith({ startEpoch: 3, count: 3 })
    expect(out.data.map((e) => e.index)).toEqual([3, 5])
    expect(out.data[0]).toEqual({
      index: 3,
      firstBlockTimeMs: 3000,
      firstBlockHeight: 30,
      firstCoreBlockHeight: 300,
      feeMultiplierPermille: 1000,
      protocolVersion: 12,
    })
  })

  it('names a finalized epoch by its map key and keeps who proposed how many blocks', async () => {
    const info = {
      firstBlockTime: 5_000n,
      firstBlockHeight: 50n,
      firstCoreBlockHeight: 500,
      feeMultiplierPermille: 1000n,
      protocolVersion: 12,
      totalBlocksInEpoch: 400n,
      coreBlockRewards: 11n,
      totalProcessingFees: 12n,
      totalDistributedStorageFees: 13n,
      totalCreatedStorageFees: 14n,
      nextEpochStartCoreBlockHeight: 600,
      // The SDK keys a finalized epoch's proposers by their base58 identifier.
      blockProposers: new Map([[PROTX_ID, 3n]]),
      free: vi.fn(),
    }
    const out = await sharedImpl['epoch.finalizedInfos'](
      reads({
        epoch: { finalizedInfosWithProof: () => Promise.resolve(proved(new Map([[86, info]]))) },
      }),
      { startEpoch: 86, count: 1 },
    )
    expect(out.data).toEqual([
      {
        index: 86,
        firstBlockTimeMs: 5000,
        firstBlockHeight: 50,
        firstCoreBlockHeight: 500,
        feeMultiplierPermille: 1000,
        protocolVersion: 12,
        totalBlocks: 400,
        coreBlockRewards: 11n,
        totalProcessingFees: 12n,
        totalDistributedStorageFees: 13n,
        totalCreatedStorageFees: 14n,
        nextEpochStartCoreBlockHeight: 600,
        blockProposers: new Map([[PROTX_HEX, 3n]]),
      },
    ])
  })

  it('counts proposed blocks by ids and by range', async () => {
    const byIds = vi.fn(() => Promise.resolve(proved(new Map([[PROTX_HEX.toUpperCase(), 2n]]))))
    const byRange = vi.fn(() => Promise.resolve(proved(new Map([[PROTX_ID, 1n]]))))
    const e = reads({
      epoch: {
        evonodesProposedBlocksByIdsWithProof: byIds,
        evonodesProposedBlocksByRangeWithProof: byRange,
      },
    })
    expect(
      (
        await sharedImpl['epoch.evonodesProposedBlocksByIds'](e, {
          epoch: 7,
          proTxHashes: [PROTX_HEX],
        })
      ).data,
    ).toEqual(new Map([[PROTX_HEX, 2n]]))
    expect(byIds).toHaveBeenCalledWith(7, [PROTX_HEX])
    expect(
      (await sharedImpl['epoch.evonodesProposedBlocksByRange'](e, { epoch: 7, limit: 10 })).data,
    ).toEqual(new Map([[PROTX_HEX, 1n]]))
    expect(byRange).toHaveBeenCalledWith({ epoch: 7, limit: 10 })
  })

  it('reads the protocol upgrade state and each evonode’s vote', async () => {
    const state = {
      currentProtocolVersion: 12,
      nextProtocolVersion: 13,
      voteCount: 40,
      free: vi.fn(),
    }
    const none = { currentProtocolVersion: 12, free: vi.fn() }
    const mk = (s: unknown) =>
      reads({ protocol: { versionUpgradeStateWithProof: () => Promise.resolve(proved(s)) } })
    expect((await sharedImpl['protocol.versionUpgradeState'](mk(state), {})).data).toEqual({
      currentProtocolVersion: 12,
      nextProtocolVersion: 13,
      voteCount: 40n,
    })
    expect((await sharedImpl['protocol.versionUpgradeState'](mk(none), {})).data).toEqual({
      currentProtocolVersion: 12,
      nextProtocolVersion: null,
      voteCount: null,
    })
    const votes = reads({
      protocol: {
        versionUpgradeVoteStatusWithProof: () =>
          Promise.resolve(proved(new Map([['aa', { version: 13, free: vi.fn() }]]))),
      },
    })
    expect(
      (await sharedImpl['protocol.versionUpgradeVoteStatus'](votes, { count: 10 })).data,
    ).toEqual(new Map([['aa', 13]]))
  })
})

describe('quorums, polls and addresses', () => {
  it('maps the current quorums without a proof', async () => {
    const free = vi.fn()
    const out = await sharedImpl['system.currentQuorumsInfo'](
      reads({
        system: {
          currentQuorumsInfo: () =>
            Promise.resolve({
              height: 700n,
              quorums: [
                {
                  quorumHash: 'ab',
                  quorumType: 'llmq_100_67',
                  memberCount: 100,
                  threshold: 67,
                  isVerified: true,
                },
              ],
              free,
            }),
        },
      }),
      {},
    )
    expect(out.response).toBeUndefined()
    expect(out.data).toEqual({
      height: 700,
      quorums: [
        {
          quorumHash: 'ab',
          quorumType: 'llmq_100_67',
          memberCount: 100,
          threshold: 67,
          isVerified: true,
        },
      ],
    })
    expect(free).toHaveBeenCalled()
  })

  it('maps vote polls by end date, whether each poll is an object or has toJSON', async () => {
    const poll = {
      toJSON: () => ({
        contractId: CONTRACT,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'alice'],
      }),
    }
    const plain = {
      contractId: CONTRACT,
      documentTypeName: 'domain',
      indexName: 'parentNameAndLabel',
      indexValues: ['dash', 'bob'],
    }
    const votePollsByEndDateWithProof = vi.fn(() =>
      Promise.resolve(
        proved([
          { timestampMs: 1_800_000_000_000n, votePolls: [poll, plain, null], free: vi.fn() },
        ]),
      ),
    )
    const out = await sharedImpl['voting.votePollsByEndDate'](
      reads({ voting: { votePollsByEndDateWithProof } }),
      { startTimeMs: 1, limit: 5 },
    )
    expect(votePollsByEndDateWithProof).toHaveBeenCalledWith({ startTimeMs: 1, limit: 5 })
    expect(out.data).toEqual([
      {
        timestampMs: 1_800_000_000_000,
        polls: [
          {
            contractId: CONTRACT,
            documentTypeName: 'domain',
            indexName: 'parentNameAndLabel',
            indexValues: ['dash', 'alice'],
          },
          {
            contractId: CONTRACT,
            documentTypeName: 'domain',
            indexName: 'parentNameAndLabel',
            indexValues: ['dash', 'bob'],
          },
        ],
      },
    ])
  })

  it('reads Platform addresses one or many, keyed by the address asked about', async () => {
    const A = 'dash1kpn8c0q9rpz09k8cy6pgzyqhln7yy00cdue3kgjx'
    const A_KEY = '00667c3c051844f2d8f82682811017fcfc423df86f'
    const B = 'dash1kqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zy22lqa3'
    const info = { balance: 5n, nonce: 2, free: vi.fn() }
    const a = reads({
      addresses: {
        getWithProof: () => Promise.resolve(proved(info)),
        // The SDK keys its answer by the address in hex (type byte, then the hash), not by the text asked.
        getManyWithProof: () => Promise.resolve(proved(new Map([[A_KEY, info]]))),
      },
    })
    expect((await sharedImpl['addresses.get'](a, { address: A })).data).toEqual({
      address: A,
      balance: 5n,
      nonce: 2n,
    })
    const many = await sharedImpl['addresses.getMany'](a, { addresses: [A, B] })
    expect(many.data).toEqual(
      new Map([
        [A, { address: A, balance: 5n, nonce: 2n }],
        [B, null],
      ]),
    )
    const missing = reads({ addresses: { getWithProof: () => Promise.resolve(proved(undefined)) } })
    expect((await sharedImpl['addresses.get'](missing, { address: B })).data).toBe(null)
  })
})
