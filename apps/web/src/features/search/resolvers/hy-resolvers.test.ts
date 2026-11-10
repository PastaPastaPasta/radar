import { afterEach, describe, expect, it, vi } from 'vitest'
import { hyphen } from '@/data/hyphen/client'
import { classify } from '../classify'
import { planResolvers } from '../useSearch'
import { hyAddress } from './hy-address'
import { hySearch } from './hy-search'
import { resolvers } from './index'

const ctx = (net: 'mainnet' | 'testnet' = 'mainnet') => ({
  net,
  signal: new AbortController().signal,
})

const PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident'
const FIVE_WORDS = 'abandon ability able about above'
const XPRV =
  'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'
const TXID = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const BLOCK = '0000000000000007c8c40d75c0695e77a4d7219d80a363f8896c1d3c4c1f9ac0'
const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const PROPOSAL = '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c'

afterEach(() => vi.restoreAllMocks())

describe('Hyphen resolvers are registered', () => {
  it('adds hy-search and hy-address next to the local ones @HY-14', () => {
    const ids = resolvers.map((r) => r.id)
    expect(ids).toContain('hy-search')
    expect(ids).toContain('hy-address')
    expect(ids).toContain('local-core-address')
  })
})

describe('Hyphen resolvers never receive a secret @HY-14', () => {
  const secrets: [string, string][] = [
    ['a recovery phrase', PHRASE],
    ['an extended private key', XPRV],
    ['five words of a phrase', FIVE_WORDS],
    ['a quoted partial phrase', `"${FIVE_WORDS}`],
  ]

  it.each(secrets)('plans neither for %s', (_name, input) => {
    const c = classify(input, 'mainnet')
    expect(c.warning).toBeDefined()
    const ids = planResolvers(c, 'mainnet', 'page').map((r) => r.id)
    expect(ids).not.toContain('hy-search')
    expect(ids).not.toContain('hy-address')
    for (const r of planResolvers(c, 'mainnet', 'palette')) expect(r.cost).toBe('local')
  })

  it.each(secrets)('and answers nothing, without a request, if called with %s anyway', async (_name, input) => {
    const search = vi.spyOn(hyphen, 'search')
    const address = vi.spyOn(hyphen, 'address')
    const proposal = vi.spyOn(hyphen, 'proposal')
    const c = classify(input, 'mainnet')
    const forced = { ...c, classes: ['hex64', 'text', 'dpns', 'core-address'] as typeof c.classes }
    expect(await hySearch.resolve(forced, ctx())).toEqual([])
    expect(await hyAddress.resolve(forced, ctx())).toEqual([])
    expect(search).not.toHaveBeenCalled()
    expect(address).not.toHaveBeenCalled()
    expect(proposal).not.toHaveBeenCalled()
  })

  it('plans both for an ordinary hash and address', () => {
    expect(planResolvers(classify(TXID, 'mainnet'), 'mainnet', 'palette').map((r) => r.id)).toContain(
      'hy-search',
    )
    expect(
      planResolvers(classify(ADDRESS, 'mainnet'), 'mainnet', 'palette').map((r) => r.id),
    ).toContain('hy-address')
  })
})

describe('hy-search', () => {
  it('finds a transaction by its hash @HY-14', async () => {
    const hits = await hySearch.resolve(classify(TXID, 'mainnet'), ctx())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ kind: 'tx', id: TXID, rank: 100 })
    expect(hits[0]?.href).toEqual({ to: '/tx/$txid', params: { txid: TXID } })
    expect(hits[0]?.stamp.source).toBe('hyphen')
  })

  it('finds a block by its hash @HY-14', async () => {
    const hits = await hySearch.resolve(classify(BLOCK, 'mainnet'), ctx())
    expect(hits[0]).toMatchObject({ kind: 'block', id: BLOCK })
    expect(hits[0]?.href).toEqual({ to: '/block/$id', params: { id: BLOCK } })
  })

  it('does not search for text shorter than Hyphen accepts @HY-14', async () => {
    const search = vi.spyOn(hyphen, 'search')
    expect(await hySearch.resolve(classify('abc', 'mainnet'), ctx())).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('does not search a devnet @HY-19', async () => {
    const search = vi.spyOn(hyphen, 'search')
    const c = classify(TXID, 'mainnet')
    expect(await hySearch.resolve(c, { ...ctx(), net: 'devnet-ruby' })).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('names a proposal found by its text @HY-14', async () => {
    const hits = await hySearch.resolve(classify('DashDaoGrowthEngine', 'mainnet'), ctx())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ kind: 'proposal', id: PROPOSAL, title: 'DashDaoGrowthEngine', rank: 50 })
    expect(hits[0]?.href).toEqual({ to: '/governance/$hash', params: { hash: PROPOSAL } })
  })
})

describe('hy-address', () => {
  it('says what is at the address: balance and transactions @HY-14', async () => {
    const hits = await hyAddress.resolve(classify(ADDRESS, 'mainnet'), ctx())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ kind: 'address', id: ADDRESS, rank: 100 })
    expect(String(hits[0]?.subtitle)).toMatch(/992,908.*\sDASH · 189 transactions/)
    expect(hits[0]?.stamp.source).toBe('hyphen')
  })

  it('still offers an address Hyphen has not seen, and says so @HY-14', async () => {
    const hits = await hyAddress.resolve(
      classify('XbKzysY6LYGbsGwNG8B7K1BRoA1ffLodAT', 'mainnet'),
      ctx(),
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]?.subtitle).toBe('Core address · no activity seen')
  })
})
