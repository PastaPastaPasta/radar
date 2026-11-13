import { describe, expect, it, vi } from 'vitest'
import { pChainImpl, type PChainReads } from '@/data/sdk/worker/impl/p-chain'
import { proved } from './fakes'

const ID = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'
const reads = (over: Partial<PChainReads>) => over as unknown as PChainReads
const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill)
const hex = (n: number, fill: string) => fill.repeat(n)

describe('prefunded specialised balance', () => {
  it('maps a balance under the id asked and frees the wasm object', async () => {
    const free = vi.fn()
    const prefundedSpecializedBalanceWithProof = vi.fn(() =>
      Promise.resolve(proved({ balance: 12_345n, free })),
    )
    const out = await pChainImpl['system.prefundedSpecializedBalance'](
      reads({ system: { prefundedSpecializedBalanceWithProof } }),
      { id: ID },
    )
    expect(prefundedSpecializedBalanceWithProof).toHaveBeenCalledWith(ID)
    expect(out.data).toEqual({ id: ID, balance: 12_345n })
    expect(out.response).toBeDefined()
    expect(free).toHaveBeenCalled()
  })

  it('answers null with its proof when the SDK proves there is none', async () => {
    const out = await pChainImpl['system.prefundedSpecializedBalance'](
      reads({
        system: { prefundedSpecializedBalanceWithProof: () => Promise.resolve(proved(undefined)) },
      }),
      { id: ID },
    )
    expect(out.data).toBe(null)
    expect(out.response).toBeDefined()
  })

  it('answers null, unproved, when the SDK throws NotFound instead', async () => {
    const out = await pChainImpl['system.prefundedSpecializedBalance'](
      reads({
        system: {
          prefundedSpecializedBalanceWithProof: () =>
            Promise.reject(Object.assign(new Error('nope'), { name: 'NotFound' })),
        },
      }),
      { id: ID },
    )
    expect(out).toEqual({ data: null })
  })

  it('rethrows any other failure', async () => {
    await expect(
      pChainImpl['system.prefundedSpecializedBalance'](
        reads({
          system: { prefundedSpecializedBalanceWithProof: () => Promise.reject(new Error('boom')) },
        }),
        { id: ID },
      ),
    ).rejects.toThrow('boom')
  })
})

describe('shielded pool', () => {
  it('reads the pool state, and null when there is none', async () => {
    const full = reads({
      shielded: { poolStateWithProof: () => Promise.resolve(proved(5n)) } as never,
    })
    expect((await pChainImpl['shielded.poolState'](full, {})).data).toBe(5n)
    const empty = reads({
      shielded: { poolStateWithProof: () => Promise.resolve(proved(undefined)) } as never,
    })
    expect((await pChainImpl['shielded.poolState'](empty, {})).data).toBe(null)
  })

  it('writes anchors in hex', async () => {
    const out = await pChainImpl['shielded.anchors'](
      reads({
        shielded: {
          anchorsWithProof: () => Promise.resolve(proved([bytes(32, 0xab), bytes(32, 0x01)])),
        } as never,
      }),
      {},
    )
    expect(out.data).toEqual([hex(32, 'ab'), hex(32, '01')])
  })

  it('writes the most recent anchor in hex, or null', async () => {
    const some = reads({
      shielded: {
        mostRecentAnchorWithProof: () => Promise.resolve(proved(bytes(32, 0xcd))),
      } as never,
    })
    expect((await pChainImpl['shielded.mostRecentAnchor'](some, {})).data).toBe(hex(32, 'cd'))
    const none = reads({
      shielded: { mostRecentAnchorWithProof: () => Promise.resolve(proved(null)) } as never,
    })
    expect((await pChainImpl['shielded.mostRecentAnchor'](none, {})).data).toBe(null)
  })

  it('numbers the notes from the start index, converts every field to hex and frees each note', async () => {
    const free = vi.fn()
    const note = (fill: number) => ({
      cmx: bytes(32, fill),
      cvNet: bytes(32, fill + 1),
      encryptedNote: bytes(4, fill + 2),
      nullifier: bytes(32, fill + 3),
      free,
    })
    const encryptedNotesWithProof = vi.fn(() => Promise.resolve(proved([note(0x10), note(0x20)])))
    const out = await pChainImpl['shielded.encryptedNotes'](
      reads({ shielded: { encryptedNotesWithProof } as never }),
      { startIndex: 40, count: 2 },
    )
    expect(encryptedNotesWithProof).toHaveBeenCalledWith(40n, 2)
    expect(out.data).toEqual([
      {
        index: 40,
        cmx: hex(32, '10'),
        cvNet: hex(32, '11'),
        encryptedNote: hex(4, '12'),
        nullifier: hex(32, '13'),
      },
      {
        index: 41,
        cmx: hex(32, '20'),
        cvNet: hex(32, '21'),
        encryptedNote: hex(4, '22'),
        nullifier: hex(32, '23'),
      },
    ])
    expect(free).toHaveBeenCalledTimes(2)
  })

  it('sends nullifiers as bytes and answers an entry for each one asked', async () => {
    const free = vi.fn()
    const spent = hex(32, 'aa')
    const unspent = hex(32, 'bb')
    const nullifiersWithProof = vi.fn(() =>
      Promise.resolve(
        proved([
          { isSpent: true, nullifier: bytes(32, 0xaa), free },
          { isSpent: false, nullifier: bytes(32, 0xbb), free },
        ]),
      ),
    )
    const out = await pChainImpl['shielded.nullifiers'](
      reads({ shielded: { nullifiersWithProof } as never }),
      { nullifiers: [spent, unspent, hex(32, 'cc')] },
    )
    expect(nullifiersWithProof).toHaveBeenCalledWith([
      bytes(32, 0xaa),
      bytes(32, 0xbb),
      bytes(32, 0xcc),
    ])
    expect(out.data).toEqual(
      new Map([
        [spent, true],
        [unspent, false],
        [hex(32, 'cc'), false],
      ]),
    )
    expect(free).toHaveBeenCalledTimes(2)
  })
})
