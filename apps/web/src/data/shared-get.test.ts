import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enableHyphenBatching,
  HYPHEN_BATCH_MAX,
  resetSharedGetForTests,
  sharedGet,
} from './shared-get'

const BASE = 'http://radar.test/x/hy/mainnet'
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
          ? Response.json({
              results: [
                { status: 200, body: { n: 1 } },
                { status: 404, body: { error: 'not_found' }, headers: { etag: '"x"' } },
              ],
            })
          : Response.json({ unexpected: url })
      const [a, b] = await Promise.all([
        read(`${BASE}/address/Xa/utxos?limit=100`),
        read(`${BASE}/tx/abc`),
      ])
      expect(calls).toEqual([
        `${BASE}/batch?r=${encodeURIComponent('address/Xa/utxos?limit=100')}&r=${encodeURIComponent('tx/abc')}`,
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
        return Response.json({
          results: Array.from({ length: n }, () => ({ status: 200, body: {} })),
        })
      }
      await Promise.all([read(`${BASE}/status`, undefined, '#radar-probe'), read(`${BASE}/tx/abc`)])
      await Promise.all([
        read(`${BASE}/status`, undefined, '#radar-probe'),
        read('http://radar.test/x/hy/mainnet/metrics/latest', undefined, '#radar-probe'),
      ])
      expect(calls).toEqual([
        `${BASE}/batch?r=status&r=${encodeURIComponent('tx/abc')}`,
        `${BASE}/batch?r=status&r=${encodeURIComponent('metrics/latest')}#radar-probe`,
      ])
    })

    it('splits a burst into batches of at most the edge’s limit', async () => {
      answer = (url) => {
        const n = new URL(url).searchParams.getAll('r').length
        return Response.json({
          results: Array.from({ length: n }, () => ({ status: 200, body: {} })),
        })
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
        return Response.json({
          results: Array.from({ length: n }, () => ({ status: 200, body: {} })),
        })
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
