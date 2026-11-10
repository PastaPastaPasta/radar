import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { isSourceError } from '@/data/errors'
import { healthRegistry } from '@/data/health'
import { pe } from '@/data/pe/client'
import { contestedResourceKey } from '@/data/pe/params'

const MAIN = 'https://api.pe.dashhq.org'
const IDENTITY = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const TOKEN = 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB'

describe('pe client', () => {
  it('status carries the Tenderdash height and records indexer lag', async () => {
    const out = await pe.status('mainnet')
    expect(out.source).toBe('pe')
    expect(out.height).toBe(out.data.tenderdash.block.height)
    expect(out.data.totalCredits).toBeTypeOf('bigint')
    const lag = healthRegistry.get('mainnet', 'pe').lag
    expect(lag?.blocks).toBe(
      Math.max(0, out.data.tenderdash.block.height - out.data.api.block.height),
    )
    expect(lag?.detail).toMatch(/^indexed to block /)
  })

  it('status marks PE stale when it answers 503 about its own indexer', async () => {
    const body = (await (await fetch(`${MAIN}/status`)).json()) as Record<string, unknown>
    server.use(http.get(`${MAIN}/status`, () => HttpResponse.json(body, { status: 503 })))
    await pe.status('mainnet')
    const h = healthRegistry.get('mainnet', 'pe')
    expect(h.state).toBe('stale')
    expect(h.lag?.detail).toContain('unhealthy')
  })

  it('lists come back as Page<T> with the total', async () => {
    const out = await pe.blocks('mainnet', { limit: 10, order: 'desc' })
    expect(out.data.items.length).toBeGreaterThan(0)
    expect(out.data.total).toBeGreaterThan(100_000)
    expect(out.data.page).toBe(1)
    expect(out.data.items[0]?.header.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('block, transaction, identity, contract, token and validator details parse', async () => {
    const txs = await pe.transactions('mainnet', { limit: 10, order: 'desc' })
    const tx = txs.data.items[0]!
    expect((await pe.transaction('mainnet', tx.hash)).data?.hash).toBe(tx.hash)

    const blocks = await pe.blocks('mainnet', { limit: 10, order: 'desc' })
    const hash = blocks.data.items[0]!.header.hash
    const block = await pe.block('mainnet', hash)
    expect(block.data?.header.hash).toBe(hash)
    expect(block.height).toBe(block.data?.header.height)

    expect((await pe.identity('mainnet', IDENTITY)).data?.balance).toBeTypeOf('bigint')
    expect((await pe.dataContract('mainnet', CONTRACT)).data?.documentsCount).toBeGreaterThan(0)
    expect((await pe.token('mainnet', TOKEN)).data?.totalSupply).toBeTypeOf('bigint')
  })

  it('an unknown identity resolves to Sourced<null>', async () => {
    const out = await pe.identity('mainnet', '1'.repeat(43))
    expect(out.data).toBeNull()
    expect(out.source).toBe('pe')
  })

  it('identity sub-lists, token holders and transitions parse', async () => {
    const q = { limit: 10, order: 'desc' } as const
    expect(
      (await pe.identityTransactions('mainnet', IDENTITY, q)).data.items.length,
    ).toBeGreaterThan(0)
    expect((await pe.identityDocuments('mainnet', IDENTITY, q)).data.total).toBeGreaterThan(0)
    expect((await pe.identityTransfers('mainnet', IDENTITY, q)).data.items[0]?.amount).toBeTypeOf(
      'bigint',
    )
    expect((await pe.identityTokens('mainnet', IDENTITY, q)).data.items[0]?.balance).toBeTypeOf(
      'bigint',
    )
    expect((await pe.tokenHolders('mainnet', TOKEN, q)).data.items[0]?.balance).toBeTypeOf('bigint')
    expect((await pe.tokenTransitions('mainnet', TOKEN, q)).data.items[0]?.action).toBeTypeOf(
      'string',
    )
    expect(
      (await pe.dataContractDocuments('mainnet', CONTRACT, q)).data.items.length,
    ).toBeGreaterThan(0)
  })

  it('contested resources are addressed by base64 JSON of their index values', async () => {
    expect(contestedResourceKey(['dash', 'quantum'])).toBe('WyJkYXNoIiwicXVhbnR1bSJd')
    const out = await pe.contestedResource('mainnet', ['dash', 'quantum'])
    expect(out.data?.contenders?.length).toBeGreaterThan(0)
    expect(
      (
        await pe.contestedResourceVotes('mainnet', ['dash', 'quantum'], {
          limit: 10,
          order: 'desc',
        })
      ).data.total,
    ).toBe(4)
  })

  it('encodes non-ASCII index values as UTF-8', () => {
    expect(atob(contestedResourceKey(['é']))).toBe(
      new TextDecoder('latin1').decode(new TextEncoder().encode('["é"]')),
    )
  })

  it('series become timestamped points', async () => {
    const out = await pe.transactionsHistory('mainnet', '24h')
    expect(out.data[0]?.t).toBeTypeOf('number')
    expect(out.data[0]?.txs).toBeTypeOf('number')
  })

  it('search resolves 404 to null', async () => {
    server.use(
      http.get(`${MAIN}/search`, () =>
        HttpResponse.json({ message: 'not found' }, { status: 404 }),
      ),
    )
    const out = await pe.search('mainnet', 'nothing-here')
    expect(out.data).toBeNull()
  })

  it('search results parse', async () => {
    const out = await pe.search('mainnet', 'dash')
    expect(out.data?.identities?.length).toBeGreaterThan(0)
  })

  it('sends repeated and filtered parameters', async () => {
    const seen: string[] = []
    server.use(
      http.get(`${MAIN}/transactions`, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json({ resultSet: [], pagination: { page: 1, limit: 10, total: -1 } })
      }),
    )
    const out = await pe.transactions('mainnet', {
      page: 3,
      limit: 10,
      transaction_type: ['IDENTITY_CREATE', 'BATCH'],
      status: undefined,
    })
    expect(seen).toEqual([
      '?page=3&limit=10&transaction_type=IDENTITY_CREATE&transaction_type=BATCH',
    ])
    expect(out.data.total).toBeUndefined()
  })

  it('verifyTransaction posts base64 and returns the CheckTx result', async () => {
    let body: unknown
    server.use(
      http.post(`${MAIN}/transaction/verify`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ result: true, code: 0, gasWanted: '1000' })
      }),
    )
    const out = await pe.verifyTransaction('mainnet', 'AAEC')
    expect(body).toEqual({ base64: 'AAEC' })
    expect(out.data).toMatchObject({ result: true, code: 0, gasWanted: 1000 })
  })

  it('is unavailable on devnets', async () => {
    const e = await pe.status('devnet-ruby').catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('unavailable')
  })

  it('uses the testnet host on testnet', async () => {
    const out = await pe.status('testnet')
    expect(out.data.network).toBeTypeOf('string')
    expect(out.data.tenderdash.block.height).toBeGreaterThan(0)
  })
})
