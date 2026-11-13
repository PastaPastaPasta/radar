import { describe, expect, it, vi } from 'vitest'
import { proved } from '@/test/data/sdk/fakes'
import { toolsImpl, type ToolsReads } from './tools'

const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const reads = (over: Partial<Record<keyof ToolsReads, unknown>>) => over as unknown as ToolsReads

describe('aggregates', () => {
  it('counts with the SDK spelling of the query and keeps each group', async () => {
    const countWithProof = vi.fn(() =>
      Promise.resolve(
        proved(
          new Map([
            ['a', 3n],
            ['b', 9n],
          ]),
        ),
      ),
    )
    const out = await toolsImpl['documents.count'](reads({ documents: { countWithProof } }), {
      contractId: CONTRACT,
      type: 'domain',
      where: [['normalizedParentDomainName', 'in', ['a', 'b']]],
      orderBy: [['normalizedParentDomainName', 'asc']],
      groupBy: ['normalizedParentDomainName'],
      limit: 500,
    })
    expect(countWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      documentTypeName: 'domain',
      where: [['normalizedParentDomainName', 'in', ['a', 'b']]],
      orderBy: [['normalizedParentDomainName', 'asc']],
      groupBy: ['normalizedParentDomainName'],
      limit: 100,
    })
    expect(out.data).toEqual([
      { key: 'a', count: 3n },
      { key: 'b', count: 9n },
    ])
    expect(out.response).toBeDefined()
  })

  it('leaves out an empty groupBy and a limit nobody asked for', async () => {
    const countWithProof = vi.fn(() => Promise.resolve(proved(new Map([['', 7n]]))))
    const out = await toolsImpl['documents.count'](reads({ documents: { countWithProof } }), {
      contractId: CONTRACT,
      type: 'domain',
      groupBy: [],
    })
    expect(countWithProof).toHaveBeenCalledWith({
      dataContractId: CONTRACT,
      documentTypeName: 'domain',
    })
    expect(out.data).toEqual([{ key: '', count: 7n }])
  })

  it('sums and averages a property', async () => {
    const sumWithProof = vi.fn(() => Promise.resolve(proved(new Map([['', 12n]]))))
    const averageWithProof = vi.fn(() =>
      Promise.resolve(proved(new Map([['x', { count: 4n, sum: 10n }]]))),
    )
    const documents = { sumWithProof, averageWithProof }
    const args = { contractId: CONTRACT, type: 'grade', property: 'score' }
    const sum = await toolsImpl['documents.sum'](reads({ documents }), args)
    const avg = await toolsImpl['documents.average'](reads({ documents }), args)
    expect(sumWithProof).toHaveBeenCalledWith(
      { dataContractId: CONTRACT, documentTypeName: 'grade' },
      'score',
    )
    expect(sum.data).toEqual([{ key: '', sum: 12n }])
    expect(avg.data).toEqual([{ key: 'x', count: 4n, sum: 10n }])
  })
})

describe('contracts.serialized', () => {
  it('serializes at the protocol version of the proof and lists the document types', async () => {
    const toBytes = vi.fn(() => new Uint8Array([9, 8, 7]))
    const free = vi.fn()
    const contract = {
      toBytes,
      toJSON: () => ({ documentSchemas: { domain: {}, preorder: {} } }),
      free,
    }
    const fetchWithProof = vi.fn(() => Promise.resolve(proved(contract, { protocolVersion: 14 })))
    const out = await toolsImpl['contracts.serialized'](reads({ contracts: { fetchWithProof } }), {
      id: CONTRACT,
    })
    expect(toBytes).toHaveBeenCalledWith(14)
    expect(out.data).toEqual({
      id: CONTRACT,
      bytes: new Uint8Array([9, 8, 7]),
      documentTypes: ['domain', 'preorder'],
    })
    expect(free).toHaveBeenCalled()
  })

  it('answers null for a contract that is not there, unproved', async () => {
    const fetchWithProof = vi.fn(() =>
      Promise.reject(Object.assign(new Error('x'), { name: 'NotFound' })),
    )
    const out = await toolsImpl['contracts.serialized'](reads({ contracts: { fetchWithProof } }), {
      id: CONTRACT,
    })
    expect(out.data).toBeNull()
    expect(out.response).toBeUndefined()
  })
})

describe('system.pathElements', () => {
  it('sends hex segments as bytes and answers every byte string in hex', async () => {
    const free = vi.fn()
    const pathElementsWithProof = vi.fn(() =>
      Promise.resolve(
        proved([
          {
            key: new Uint8Array([0x44]),
            pathBytes: [new Uint8Array([0x68])],
            elementType: 'item',
            valueBytes: new Uint8Array([1, 2]),
            sum: undefined,
            referenceTarget: undefined,
            free,
          },
          {
            key: new Uint8Array([0x20]),
            pathBytes: [],
            elementType: 'tree',
            valueBytes: undefined,
            sum: 5n,
            referenceTarget: [new Uint8Array([0xff])],
          },
        ]),
      ),
    )
    const out = await toolsImpl['system.pathElements'](
      reads({ system: { pathElementsWithProof } }),
      {
        path: ['68'],
        keys: ['44', '20'],
      },
    )
    expect(pathElementsWithProof).toHaveBeenCalledWith(
      [new Uint8Array([0x68])],
      [new Uint8Array([0x44]), new Uint8Array([0x20])],
    )
    expect(out.data).toEqual([
      {
        path: ['68'],
        key: '44',
        elementType: 'item',
        value: '0102',
        sum: null,
        referenceTarget: null,
      },
      { path: [], key: '20', elementType: 'tree', value: null, sum: 5n, referenceTarget: ['ff'] },
    ])
    expect(free).toHaveBeenCalled()
  })

  it('refuses a segment that is not hex', async () => {
    await expect(
      toolsImpl['system.pathElements'](reads({ system: { pathElementsWithProof: vi.fn() } }), {
        path: ['zz'],
        keys: [],
      }),
    ).rejects.toThrow(/hex/i)
  })
})
