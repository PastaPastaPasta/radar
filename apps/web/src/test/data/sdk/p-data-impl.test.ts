import { describe, expect, it, vi } from 'vitest'
import { pDataImpl, type PDataReads } from '@/data/sdk/worker/impl/p-data'
import { proved } from './fakes'

const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const A = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'
const B = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const C = '81x7N39zKLhYDpYg6vk9AUjapc8VMxuDDZGHSMxPna5m'

const reads = (over: Partial<Record<keyof PDataReads, unknown>>) => over as unknown as PDataReads

const contract = (version: number) => ({
  id: CONTRACT,
  ownerId: A,
  version,
  free: vi.fn(),
  toJSON: () => ({
    documentSchemas: { note: { type: 'object', indices: [] } },
    config: { keepsHistory: true },
  }),
})

const doc = (revision: bigint, updatedAt: number) => ({
  id: 'doc1',
  ownerId: A,
  dataContractId: CONTRACT,
  documentTypeName: 'note',
  revision,
  updatedAt,
  properties: { text: `r${revision}` },
  free: vi.fn(),
})

describe('contracts.getHistory', () => {
  it('lists the versions oldest first, by the time Platform recorded each', async () => {
    const getHistoryWithProof = vi.fn(() =>
      Promise.resolve(
        proved(
          new Map<bigint, ReturnType<typeof contract>>([
            [2000n, contract(2)],
            [1000n, contract(1)],
          ]),
        ),
      ),
    )
    const out = await pDataImpl['contracts.getHistory'](
      reads({ contracts: { getHistoryWithProof } }),
      {
        id: CONTRACT,
        limit: 20,
      },
    )
    expect(getHistoryWithProof).toHaveBeenCalledWith({ dataContractId: CONTRACT, limit: 20 })
    expect(out.data.map((v) => [v.atMs, v.contract.version])).toEqual([
      [1000, 1],
      [2000, 2],
    ])
    expect(out.data[0]?.contract.keepsHistory).toBe(true)
    expect(out.response).toBeDefined()
  })
})

describe('documents.history', () => {
  it('lists revisions oldest first and resumes after the time it is given', async () => {
    const historyWithProof = vi.fn(() =>
      Promise.resolve(
        proved(
          new Map([
            [1000n, doc(1n, 1000)],
            [3000n, doc(3n, 3000)],
            [2000n, doc(2n, 2000)],
          ]),
        ),
      ),
    )
    const out = await pDataImpl['documents.history'](reads({ documents: { historyWithProof } }), {
      contractId: CONTRACT,
      type: 'note',
      id: 'doc1',
      limit: 10,
      startAtMs: 500,
    })
    expect(historyWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      documentTypeName: 'note',
      documentId: 'doc1',
      limit: 10,
      startAtMs: 500,
    })
    expect(out.data.map((r) => r.document.revision)).toEqual([1n, 2n, 3n])
    expect(out.data[2]?.atMs).toBe(3000)
  })
})

describe('groups', () => {
  const group = (members: Record<string, number>, requiredPower: number) => ({
    free: vi.fn(),
    toJSON: () => ({ members, requiredPower }),
  })

  it('lists groups by position, each with its members strongest first', async () => {
    const infosWithProof = vi.fn(() =>
      Promise.resolve(
        proved(
          new Map<number, ReturnType<typeof group> | undefined>([
            [1, group({ [A]: 1 }, 1)],
            [0, group({ [A]: 1, [B]: 3, [C]: 3 }, 4)],
            [2, undefined],
          ]),
        ),
      ),
    )
    const out = await pDataImpl['group.infos'](reads({ group: { infosWithProof } }), {
      contractId: CONTRACT,
      startAtPosition: 0,
      limit: 20,
    })
    expect(infosWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      startAt: { position: 0, included: true },
      limit: 20,
    })
    expect(out.data.map((g) => g.position)).toEqual([0, 1])
    expect(out.data[0]).toMatchObject({ requiredPower: 4 })
    expect(out.data[0]?.members.map((m) => m.power)).toEqual([3, 3, 1])
  })

  it('answers one group, or null when the position is empty', async () => {
    const hit = reads({
      group: { infoWithProof: () => Promise.resolve(proved(group({ [A]: 2 }, 2))) },
    })
    expect(
      (await pDataImpl['group.info'](hit, { contractId: CONTRACT, position: 0 })).data,
    ).toEqual({ position: 0, requiredPower: 2, members: [{ id: A, power: 2 }] })
    const miss = reads({ group: { infoWithProof: () => Promise.resolve(proved(undefined)) } })
    expect((await pDataImpl['group.info'](miss, { contractId: CONTRACT, position: 4 })).data).toBe(
      null,
    )
  })

  it('lists members by power and resumes after a member', async () => {
    const membersWithProof = vi.fn(() =>
      Promise.resolve(
        proved(
          new Map<string, bigint>([
            [A, 1n],
            [B, 5n],
          ]),
        ),
      ),
    )
    const out = await pDataImpl['group.members'](reads({ group: { membersWithProof } }), {
      contractId: CONTRACT,
      position: 0,
      startAfter: C,
      limit: 50,
    })
    expect(membersWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      groupContractPosition: 0,
      startAtMemberId: C,
      limit: 50,
    })
    expect(out.data).toEqual([
      { id: B, power: 5 },
      { id: A, power: 1 },
    ])
  })

  it('lists actions by status with the event, its note and its proposer', async () => {
    const action = {
      proposerId: B,
      tokenContractPosition: 2,
      event: {
        eventName: () => 'Mint',
        publicNote: () => 'monthly',
        toJSON: () => ({ $kind: 'tokenEvent', $type: 'mint', amount: '5' }),
      },
      free: vi.fn(),
    }
    const actionsWithProof = vi.fn(() => Promise.resolve(proved(new Map([['act1', action]]))))
    const out = await pDataImpl['group.actions'](reads({ group: { actionsWithProof } }), {
      contractId: CONTRACT,
      position: 0,
      status: 'closed',
      startAfter: 'act0',
    })
    expect(actionsWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      groupContractPosition: 0,
      status: 'CLOSED',
      startAt: { actionId: 'act0', included: false },
    })
    expect(out.data).toEqual([
      {
        id: 'act1',
        proposerId: B,
        tokenPosition: 2,
        eventName: 'Mint',
        note: 'monthly',
        event: { $kind: 'tokenEvent', $type: 'mint', amount: '5' },
      },
    ])
  })

  it('lists an action’s signers with their power', async () => {
    const actionSignersWithProof = vi.fn(() =>
      Promise.resolve(
        proved(
          new Map<string, bigint>([
            [A, 1n],
            [B, 2n],
          ]),
        ),
      ),
    )
    const out = await pDataImpl['group.actionSigners'](
      reads({ group: { actionSignersWithProof } }),
      { contractId: CONTRACT, position: 0, status: 'active', actionId: 'act1' },
    )
    expect(actionSignersWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      groupContractPosition: 0,
      status: 'ACTIVE',
      actionId: 'act1',
    })
    expect(out.data.map((s) => s.id)).toEqual([B, A])
  })
})
