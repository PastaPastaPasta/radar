import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enableHyphenBatching,
  HYPHEN_BATCH_MAX,
  resetSharedGetForTests,
  sharedGet,
} from './shared-get'

const ORIGIN = 'http://radar.test'
const BASE = `${ORIGIN}/x/hy/mainnet`
const real = globalThis.fetch
let calls: string[]
let signals: AbortSignal[]
let answer: (url: string) => Response | Promise<Response>

beforeEach(() => {
  resetSharedGetForTests()
  calls = []
  answer = (url) => Response.json({ url })
  signals = []
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    if (init?.signal) signals.push(init.signal)
    return Promise.resolve(answer(url))
  })
})
afterEach(() => {
  globalThis.fetch = real
  resetSharedGetForTests()
})

/** The edge's batch answer: one line per read, in the order given. */
const ndjson = (results: { status: number; body: unknown; headers?: Record<string, string> }[]) =>
  new Response(results.map((r, i) => `${JSON.stringify({ i, ...r })}\n`).join(''), {
    headers: { 'content-type': 'application/x-ndjson' },
  })

const read = (url: string, signal = new AbortController().signal, fragment?: string) =>
  sharedGet(url, { signal, fragment })

describe('sharedGet', () => {
  it('shares one request between callers of the same URL, a probe included, and each gets its own body', async () => {
    const [a, b] = await Promise.all([
      read('https://radar.test/api/v1/status', undefined, '#radar-probe'),
      read('https://radar.test/api/v1/status'),
    ])
    expect(calls).toEqual(['https://radar.test/api/v1/status#radar-probe'])
    expect(await a.json()).toEqual(await b.json())
    await read('https://radar.test/api/v1/status')
    expect(calls).toHaveLength(2)
  })

  it('lets one caller give up without ending the read for the others', async () => {
    let release: (r: Response) => void = () => undefined
    answer = () => new Promise<Response>((r) => (release = r))
    const quitter = new AbortController()
    const gone = read(`${BASE}/status`, quitter.signal)
    const stays = read(`${BASE}/status`)
    quitter.abort()
    await expect(gone).rejects.toMatchObject({ name: 'AbortError' })
    release(Response.json({ ok: true }))
    expect(await (await stays).json()).toEqual({ ok: true })
  })

  it('cancels the request once every caller has given up', async () => {
    answer = () => new Promise<Response>(() => undefined)
    const a = new AbortController()
    const b = new AbortController()
    const reads = [read(`${BASE}/status`, a.signal), read(`${BASE}/status`, b.signal)]
    a.abort()
    expect(signals[0]!.aborted).toBe(false)
    b.abort()
    expect(signals[0]!.aborted).toBe(true)
    for (const r of reads) await expect(r).rejects.toMatchObject({ name: 'AbortError' })
    void read(`${BASE}/status`)
    expect(calls).toHaveLength(2)
  })

  it('keeps a body arriving for one caller after another has finished and let go, and ends it when both have', async () => {
    let push: (text: string) => void = () => undefined
    let end: () => void = () => undefined
    answer = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            push = (t) => c.enqueue(new TextEncoder().encode(t))
            end = () => c.close()
          },
        }),
      )
    const a = new AbortController()
    const b = new AbortController()
    const [ra, rb] = await Promise.all([
      read(`${BASE}/status`, a.signal),
      read(`${BASE}/status`, b.signal),
    ])
    a.abort()
    void ra.body?.cancel()
    expect(signals[0]!.aborted).toBe(false)
    const text = rb.text()
    push('{"ok":')
    push('true}')
    end()
    expect(JSON.parse(await text)).toEqual({ ok: true })
    b.abort()
    expect(signals[0]!.aborted).toBe(true)
  })

  it('sends Hyphen reads one by one while batching is off', async () => {
    await Promise.all([read(`${BASE}/status`), read(`${BASE}/block/1`)])
    expect(calls.sort()).toEqual([`${BASE}/block/1`, `${BASE}/status`])
  })

  describe('with batching on', () => {
    beforeEach(() => enableHyphenBatching())

    it('sends Hyphen reads started together as one batch and hands each its own answer', async () => {
      answer = (url) =>
        url.includes('/batch?')
          ? ndjson([
              { status: 200, body: { n: 1 } },
              { status: 404, body: { error: 'not_found' }, headers: { etag: '"x"' } },
            ])
          : Response.json({ unexpected: url })
      const [a, b] = await Promise.all([
        read(`${BASE}/address/Xa/utxos?limit=100`),
        read(`${BASE}/tx/abc`),
      ])
      expect(calls).toEqual([
        `${ORIGIN}/x/batch?r=${encodeURIComponent('hy/mainnet/address/Xa/utxos?limit=100')}&r=${encodeURIComponent('hy/mainnet/tx/abc')}`,
      ])
      expect(await a.json()).toEqual({ n: 1 })
      expect(b.status).toBe(404)
      expect(b.headers.get('etag')).toBe('"x"')
    })

    it('sends a lone read, a probe, the stream, raw bytes by hash and other sources as they are', async () => {
      await read(`${BASE}/status`)
      await read(`${BASE}/status`, undefined, '#radar-probe')
      const hash = 'ab'.repeat(32)
      await Promise.all([
        read(`${BASE}/stream`),
        read(`${BASE}/rawtx/${hash}`),
        read('https://radar.test/api/v1/status'),
      ])
      expect(calls.sort()).toEqual([
        `${BASE}/rawtx/${'ab'.repeat(32)}`,
        `${BASE}/status`,
        `${BASE}/status#radar-probe`,
        `${BASE}/stream`,
        'https://radar.test/api/v1/status',
      ])
    })

    it('sends a probe in a batch with the page’s reads, and keeps its tag on a batch of nothing but probes', async () => {
      answer = (url) => {
        const n = new URL(url).searchParams.getAll('r').length
        return ndjson(Array.from({ length: n }, () => ({ status: 200, body: {} })))
      }
      await Promise.all([read(`${BASE}/status`, undefined, '#radar-probe'), read(`${BASE}/tx/abc`)])
      await Promise.all([
        read(`${BASE}/status`, undefined, '#radar-probe'),
        read('http://radar.test/x/hy/mainnet/metrics/latest', undefined, '#radar-probe'),
      ])
      const hy = (path: string) => `r=${encodeURIComponent(`hy/mainnet/${path}`)}`
      expect(calls).toEqual([
        `${ORIGIN}/x/batch?${hy('status')}&${hy('tx/abc')}&p=0`,
        `${ORIGIN}/x/batch?${hy('status')}&${hy('metrics/latest')}&p=0&p=1#radar-probe`,
      ])
    })

    it('puts Radar and Platform Explorer reads in the same batch, each answered with its own status', async () => {
      const page = location.origin
      answer = (url) =>
        url.startsWith(`${page}/x/batch?`)
          ? ndjson([
              { status: 503, body: { error: 'upstream_error' } },
              { status: 200, body: { usd: 30 } },
              { status: 200, body: { net: 'testnet' } },
            ])
          : Response.json({ unexpected: url })
      const [radar, rate, testnet] = await Promise.all([
        read('https://radar.dashhq.org/api/v1/mainnet/summary'),
        read('https://api.pe.dashhq.org/rate'),
        read('https://api.testnet.pe.dashhq.org/status'),
      ])
      expect(calls).toEqual([
        `${page}/x/batch?r=${encodeURIComponent('radar/mainnet/summary')}&r=${encodeURIComponent('pe/mainnet/rate')}&r=${encodeURIComponent('pe/testnet/status')}`,
      ])
      expect(radar.status).toBe(503)
      expect(await rate.json()).toEqual({ usd: 30 })
      expect(await testnet.json()).toEqual({ net: 'testnet' })
    })

    it('hands each read its answer as its line arrives, before a slower read is done', async () => {
      let finish: () => void = () => undefined
      answer = () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              const line = (o: unknown) =>
                c.enqueue(new TextEncoder().encode(`${JSON.stringify(o)}\n`))
              line({ i: 1, status: 200, body: { fast: true } })
              finish = () => {
                line({ i: 0, status: 200, body: { slow: true } })
                c.close()
              }
            },
          }),
          { headers: { 'content-type': 'application/x-ndjson' } },
        )
      // The page's own Hyphen reads share its origin with the batch.
      const slow = read('https://api.pe.dashhq.org/transactions/history')
      const fast = await read(`${location.origin}/x/hy/mainnet/status`)
      expect(await fast.json()).toEqual({ fast: true })
      finish()
      expect(await (await slow).json()).toEqual({ slow: true })
    })

    it('sends a read the edge does not carry on its own, and fails an unreachable source as unreachable', async () => {
      answer = (url) =>
        url.includes('/x/batch?')
          ? ndjson([
              { status: 400, body: { error: 'not_batched' } },
              { status: 502, body: { error: 'upstream_unavailable' } },
              { status: 502, body: { error: 'upstream_unavailable' } },
            ])
          : Response.json({ alone: url })
      const [newer, radar, hy] = await Promise.allSettled([
        read('https://radar.dashhq.org/api/v1/mainnet/something-new'),
        read('https://radar.dashhq.org/api/v1/mainnet/summary'),
        read(`${location.origin}/x/hy/mainnet/status`),
      ])
      expect(newer.status === 'fulfilled' && (await newer.value.json())).toEqual({
        alone: 'https://radar.dashhq.org/api/v1/mainnet/something-new',
      })
      expect(radar.status === 'rejected' && radar.reason instanceof TypeError).toBe(true)
      expect(hy.status === 'fulfilled' && hy.value.status).toBe(502)
    })

    it('stops batching for a host that answers the batch with its HTML', async () => {
      answer = (url) =>
        url.includes('/x/batch?')
          ? new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
          : Response.json({ alone: url })
      const [a] = await Promise.all([read(`${BASE}/block/1`), read(`${BASE}/block/2`)])
      expect(await a.json()).toEqual({ alone: `${BASE}/block/1` })
      await Promise.all([read(`${BASE}/block/3`), read(`${BASE}/block/4`)])
      expect(calls.filter((u) => u.includes('/x/batch?'))).toHaveLength(1)
    })

    it('sends Radar’s whole masternode list alone, so it keeps its revalidation', async () => {
      await Promise.all([
        read('https://radar.dashhq.org/api/v1/mainnet/masternodes'),
        read('https://radar.dashhq.org/api/v1/mainnet/masternodes?limit=10'),
      ])
      expect(calls.sort()).toEqual([
        'https://radar.dashhq.org/api/v1/mainnet/masternodes',
        'https://radar.dashhq.org/api/v1/mainnet/masternodes?limit=10',
      ])
    })

    it('leaves Insight, DAPI quorum lists and other hosts out of a batch', async () => {
      await Promise.all([
        read('https://insight.dash.org/insight-api/status'),
        read('https://quorums.mainnet.networks.dash.org/masternodes'),
      ])
      expect(calls.every((u) => !u.includes('/x/batch'))).toBe(true)
      expect(calls).toHaveLength(2)
    })

    it('splits a burst into batches of at most the edge’s limit', async () => {
      answer = (url) => {
        const n = new URL(url).searchParams.getAll('r').length
        return ndjson(Array.from({ length: n }, () => ({ status: 200, body: {} })))
      }
      await Promise.all(
        Array.from({ length: HYPHEN_BATCH_MAX + 2 }, (_, i) => read(`${BASE}/block/${i}`)),
      )
      expect(calls.map((u) => new URL(u).searchParams.getAll('r').length)).toEqual([
        HYPHEN_BATCH_MAX,
        2,
      ])
    })

    it('falls back to one request per read where the edge has no batch endpoint', async () => {
      answer = (url) =>
        url.includes('/batch?') ? new Response('', { status: 404 }) : Response.json({ url })
      const [a, b] = await Promise.all([read(`${BASE}/block/1`), read(`${BASE}/block/2`)])
      expect(await a.json()).toEqual({ url: `${BASE}/block/1` })
      expect(await b.json()).toEqual({ url: `${BASE}/block/2` })
      expect(calls).toHaveLength(3)
    })

    it('hands a refused batch to each read as its own answer, so a 429 keeps its Retry-After', async () => {
      answer = () => new Response('', { status: 429, headers: { 'retry-after': '7' } })
      const [a, b] = await Promise.all([read(`${BASE}/block/1`), read(`${BASE}/block/2`)])
      for (const r of [a, b]) {
        expect(r.status).toBe(429)
        expect(r.headers.get('retry-after')).toBe('7')
      }
    })

    it('stops batching for an edge that answered its first batch with 404', async () => {
      answer = (url) =>
        url.includes('/batch?') ? new Response('', { status: 404 }) : Response.json({ url })
      await Promise.all([read(`${BASE}/block/1`), read(`${BASE}/block/2`)])
      await Promise.all([read(`${BASE}/block/3`), read(`${BASE}/block/4`)])
      expect(calls.filter((u) => u.includes('/batch?'))).toHaveLength(1)
      expect(calls).toHaveLength(5)
    })

    it('sends a batch early before its address grows too long', async () => {
      answer = (url) => {
        const n = new URL(url).searchParams.getAll('r').length
        return ndjson(Array.from({ length: n }, () => ({ status: 200, body: {} })))
      }
      const cursor = 'ab'.repeat(400)
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => read(`${BASE}/address/X${i}/txs?cursor=${cursor}`)),
      )
      expect(calls.length).toBeGreaterThan(1)
      for (const u of calls) expect(u.length).toBeLessThan(7_000)
    })
  })
})
