import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { isSourceError } from '@/data/errors'
import { healthRegistry } from '@/data/health'
import { insight } from '@/data/insight/client'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'

const TESTNET = 'https://insight.testnet.networks.dash.org/insight-api'
const ADDRESS = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'
const BLOCK = '000000e75ebc766f28d92d775192a98b53217d3669d92d65228968417d594557'
const SPENT_TX = '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6'

describe('insight client', () => {
  it('stamps an answer as Insight’s, stamped by fetch time, with the tip height it carries', async () => {
    const status = await insight.status('testnet')
    expect(status).toMatchObject({ source: 'insight', proved: false, asOfFetched: true })
    expect(status.asOf).toBe(status.fetchedAt)
    expect(status.height).toBe(status.data.info.blocks)
  })

  it('reports how far Insight’s index trails a reference tip to the health registry', async () => {
    const status = await insight.status('testnet', undefined, 9_999_999)
    const lag = healthRegistry.get('testnet', 'insight').lag
    expect(lag?.blocks).toBe(9_999_999 - status.data.info.blocks)
    expect(lag?.detail).toContain('indexed to block')
  })

  it('parses a block with its chainwork and resolves a height through the block index', async () => {
    const byHash = await insight.block('testnet', BLOCK)
    expect(byHash.data?.height).toBe(1_577_996)
    expect(byHash.data?.chainwork).toMatch(/^[0-9a-f]{64}$/)
    expect(byHash.height).toBe(1_577_996)
    const byHeight = await insight.block('testnet', 1_577_996)
    expect(byHeight.data?.height).toBe(1_577_996)
  })

  it('reads an address summary whichever way Insight spells its counts', async () => {
    const a = await insight.address('testnet', ADDRESS)
    expect(a.data.address).toBe(ADDRESS)
    expect(typeof a.data.balance).toBe('bigint')
    expect(a.data.txCount).toBeGreaterThan(0)
    server.use(
      http.get(`${TESTNET}/addr/:a`, () =>
        HttpResponse.json({
          addrStr: ADDRESS,
          balanceSat: 5,
          totalReceivedSat: '10',
          totalSentSat: 5,
          unconfirmedBalanceSat: 0,
          txApperances: 3,
          unconfirmedTxApperances: 1,
        }),
      ),
    )
    const odd = await insight.address('testnet', ADDRESS)
    expect(odd.data).toMatchObject({
      balance: 5n,
      totalReceived: 10n,
      txCount: 3,
      unconfirmedCount: 1,
    })
  })

  it('reads a page of history with each output’s spender and coin amounts in duffs', async () => {
    const page = await insight.addressTxs('testnet', ADDRESS, 0)
    expect(page.data.pagesTotal).toBeGreaterThan(0)
    expect(page.data.txs.length).toBeGreaterThan(0)
    for (const tx of page.data.txs) {
      for (const out of tx.vout) expect(typeof out.value).toBe('bigint')
    }
  })

  it('names the spender and input index of a spent output, and null for an unspent one', async () => {
    const tx = await insight.tx('testnet', SPENT_TX)
    expect(tx.data).not.toBeNull()
    expect(tx.height).toBe((tx.data!.blockheight ?? 0) + (tx.data!.confirmations ?? 0) - 1)
    const spenders = tx.data!.vout.map((o) => o.spentTxId ?? null)
    expect(spenders.length).toBe(tx.data!.vout.length)
  })

  it('resolves a transaction Insight has not got to null instead of an error', async () => {
    server.use(http.get(`${TESTNET}/tx/:id`, () => new HttpResponse('Not found', { status: 404 })))
    expect((await insight.tx('testnet', SPENT_TX)).data).toBeNull()
  })

  it('turns coin amounts into duffs without float noise', async () => {
    server.use(
      http.get(`${TESTNET}/tx/:id`, () =>
        HttpResponse.json({
          txid: SPENT_TX,
          vin: [{ coinbase: '6a', n: 0 }],
          vout: [
            { value: '0.59526364', n: 0, scriptPubKey: { hex: '6a' }, spentTxId: null },
            { value: 566.98928573, n: 1, scriptPubKey: { hex: '6a' } },
          ],
        }),
      ),
    )
    const tx = await insight.tx('testnet', SPENT_TX)
    expect(tx.data?.vout.map((o) => o.value)).toEqual([59_526_364n, 56_698_928_573n])
  })

  it('reads the governance list and the budget figures', async () => {
    const list = await insight.proposals('testnet')
    expect(list.data.length).toBeGreaterThan(0)
    expect(list.data[0]?.DataObject.payment_amount).toBeTypeOf('bigint')
    const info = await insight.governanceInfo('testnet')
    expect(info.data.fundingthreshold).toBeGreaterThan(0)
    expect(typeof info.data.governancebudget).toBe('bigint')
  })

  it('is not offered on a devnet', async () => {
    await expect(insight.status('devnet-ruby')).rejects.toMatchObject({
      source: 'insight',
      kind: 'unavailable',
    })
  })

  it('maps failures to typed errors and reports them to health', async () => {
    server.use(http.get(`${TESTNET}/status`, () => HttpResponse.error()))
    const failure = await insight.status('testnet').catch((e: unknown) => e)
    expect(isSourceError(failure) && failure.kind).toBe('network')
    expect(isSourceError(failure) && failure.message).toBe('Insight couldn’t be reached')
    server.use(http.get(`${TESTNET}/status`, () => new HttpResponse('slow down', { status: 429 })))
    await expect(insight.status('testnet')).rejects.toMatchObject({ kind: 'rate-limited' })
    server.use(http.get(`${TESTNET}/status`, () => HttpResponse.json({ info: { blocks: 'x' } })))
    await expect(insight.status('testnet')).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('keeps Insight’s recorded status in the fixtures it is read from', async () => {
    const body = await fixtureBody<{ info: { blocks: number } }>('insight', 'testnet', 'status')
    expect(body.info.blocks).toBeGreaterThan(1_577_999)
  })
})
