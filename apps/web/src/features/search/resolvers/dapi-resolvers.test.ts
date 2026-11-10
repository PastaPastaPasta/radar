import { describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { classify } from '../classify'
import { dapiBlock } from './dapi-block'
import { dapiTx } from './dapi-tx'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const ctx = () => ({ net: 'mainnet' as const, signal: new AbortController().signal })
const TX = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const BLOCK_HASH = '0000000000000027cf3cde6fa7d6361587cd5ac4f211ceb6b7bfaf1ba4e01ce4'
const NO_SUCH = '0000000000000000000000000000000000000000000000000000000000000001'

describe('DAPI search resolvers', () => {
  it('opens a block by height @IN-10', async () => {
    const hits = await dapiBlock.resolve(classify('2570085', 'mainnet'), ctx())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'block',
      id: '2570085',
      title: 'Core block 2,570,085',
      href: { to: '/block/$id', params: { id: '2570085' } },
      rank: 100,
    })
    expect(hits[0]?.stamp.source).toBe('dapi')
  })

  it('opens a block by hash @IN-10', async () => {
    const hits = await dapiBlock.resolve(classify(BLOCK_HASH, 'mainnet'), ctx())
    expect(hits[0]).toMatchObject({
      kind: 'block',
      id: BLOCK_HASH,
      title: 'Core block 2,570,084',
      href: { to: '/block/$id', params: { id: BLOCK_HASH } },
    })
  })

  it('has no block for a height beyond the tip @IN-10', async () => {
    expect(await dapiBlock.resolve(classify('2670085', 'mainnet'), ctx())).toEqual([])
  })

  it('opens a transaction by id @IN-10', async () => {
    const hits = await dapiTx.resolve(classify(TX, 'mainnet'), ctx())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'tx',
      id: TX,
      href: { to: '/tx/$txid', params: { txid: TX } },
      rank: 100,
    })
    expect(hits[0]?.subtitle).toContain('2,570,010')
  })

  it('has no transaction for an id that does not exist @IN-10', async () => {
    expect(await dapiTx.resolve(classify(NO_SUCH, 'mainnet'), ctx())).toEqual([])
  })

  it('claims only heights and 64-character hashes @IN-10', () => {
    for (const nonsense of ['hello world', 'zz'.repeat(32), '12ab']) {
      const classes = classify(nonsense, 'mainnet').classes
      expect(dapiBlock.accepts.some((k) => classes.includes(k))).toBe(false)
      expect(dapiTx.accepts.some((k) => classes.includes(k))).toBe(false)
    }
  })
})
