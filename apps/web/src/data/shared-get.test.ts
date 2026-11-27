import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableHyphenBatching, HYPHEN_BATCH_MAX, resetSharedGetForTests, sharedGet } from './shared-get'

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
  }) as typeof fetch
})
afterEach(() => {
  globalThis.fetch = real
  resetSharedGetForTests()
})

const read = (url: string, signal = new AbortController().signal, fragment?: string) =>
  sharedGet(url, { signal, timeoutMs: 5_000, fragment })

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

    it('sends a lone read, a probe, the stream and other sources as they are', async () => {
      await read(`${BASE}/status`)
      await read(`${BASE}/status`, undefined, '#radar-probe')
      await Promise.all([read(`${BASE}/stream`), read('https://radar.test/api/v1/status')])
      expect(calls.sort()).toEqual([
        `${BASE}/status`,
        `${BASE}/status#radar-probe`,
        `${BASE}/stream`,
        'https://radar.test/api/v1/status',
      ])
    })

    it('splits a burst into batches of at most the edge’s limit', async () => {
      answer = (url) => {
        const n = new URL(url).searchParams.getAll('r').length
        return Response.json({ results: Array.from({ length: n }, () => ({ status: 200, body: {} })) })
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

    it('fails every read of a batch the edge refused', async () => {
      answer = () => new Response('', { status: 502 })
      const reads = [read(`${BASE}/block/1`), read(`${BASE}/block/2`)]
      for (const r of reads) await expect(r).rejects.toThrow(/HTTP 502/)
    })
  })
})
