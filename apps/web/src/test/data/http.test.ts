import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { server } from '@/test/server'
import { healthRegistry } from '@/data/health'
import { fetchSourced, lastModifiedMs } from '@/data/http'
import type { SourceError } from '@/data/errors'
import { isSourceError } from '@/data/errors'
import { queryLog } from '@/data/query-log'
import { setSourceModeFromLink } from '@/lib/source-mode'

const URL_ = 'https://example.test/thing'
const schema = z.object({ n: z.number(), at: z.number().optional() })

const call = (extra: Partial<Parameters<typeof fetchSourced<typeof schema, 'throw'>>[0]> = {}) =>
  fetchSourced({ source: 'pe', net: 'mainnet', url: URL_, schema, ...extra })

const callNull = () =>
  fetchSourced({ source: 'pe', net: 'mainnet', url: URL_, schema, notFound: 'null' })

const failure = async (p: Promise<unknown>): Promise<SourceError> => {
  try {
    await p
  } catch (e) {
    if (isSourceError(e)) return e
    throw e
  }
  throw new Error('expected a SourceError')
}

afterEach(() => vi.restoreAllMocks())

describe('fetchSourced', () => {
  it('resolves a stamped envelope and reports success', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ n: 3, at: 5000 })))
    const before = Date.now()
    const out = await call({ asOf: (b) => b.at ?? 0, height: (b) => b.n })
    expect(out).toMatchObject({
      source: 'pe',
      asOf: 5000,
      proved: false,
      height: 3,
      data: { n: 3 },
    })
    expect(out.fetchedAt).toBeGreaterThanOrEqual(before)
    expect(healthRegistry.get('mainnet', 'pe')).toMatchObject({ state: 'ok' })
  })

  it('uses fetchedAt as asOf by default and omits height', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ n: 1 })))
    const out = await call()
    expect(out.asOf).toBe(out.fetchedAt)
    expect('height' in out).toBe(false)
  })

  it('throws http on 404 by default without marking the source unhealthy', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ message: 'not found' }, { status: 404 })))
    const e = await failure(call())
    expect(e).toMatchObject({ source: 'pe', kind: 'http', status: 404 })
    expect(e.message).toContain('not found')
    expect(healthRegistry.get('mainnet', 'pe').state).toBe('ok')
  })

  it('resolves 404 to Sourced<null> when notFound is "null"', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ message: 'nope' }, { status: 404 })))
    const out = await callNull()
    expect(out.data).toBeNull()
    expect(out).toMatchObject({ source: 'pe', proved: false })
  })

  it('maps 429 to rate-limited and reads Retry-After', async () => {
    server.use(
      http.get(
        URL_,
        () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '7' } }),
      ),
    )
    const e = await failure(call())
    expect(e).toMatchObject({ kind: 'rate-limited', status: 429, retryAfterMs: 7000 })
  })

  it('maps 5xx to http with the server message and records the failure', async () => {
    server.use(
      http.get(URL_, () =>
        HttpResponse.json({ error: { message: 'index lagging' } }, { status: 503 }),
      ),
    )
    const e = await failure(call())
    expect(e).toMatchObject({ kind: 'http', status: 503 })
    expect(e.message).toContain('index lagging')
    expect(healthRegistry.get('mainnet', 'pe').lastError).toMatchObject({ kind: 'http' })
  })

  it('does not count a 4xx as a source failure', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ error: 'bad' }, { status: 400 })))
    await failure(call())
    expect(healthRegistry.get('mainnet', 'pe').lastError).toBeUndefined()
  })

  it('parses a body for an accepted non-2xx status', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ n: 9 }, { status: 503 })))
    const out = await call({ acceptStatus: [503] })
    expect(out.data).toEqual({ n: 9 })
  })

  it('throws invalid-response on a schema mismatch, logs the path and degrades the source', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    server.use(http.get(URL_, () => HttpResponse.json({ n: 'x' })))
    const e = await failure(call())
    expect(e.kind).toBe('invalid-response')
    expect(e.message).toContain('n')
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]?.[0])).toContain('n')
    expect(healthRegistry.get('mainnet', 'pe').state).toBe('degraded')
  })

  it('throws invalid-response on a body that is not JSON', async () => {
    server.use(
      http.get(
        URL_,
        () => new HttpResponse('<html>', { headers: { 'content-type': 'text/html' } }),
      ),
    )
    expect((await failure(call())).kind).toBe('invalid-response')
  })

  it('throws network when the request fails', async () => {
    server.use(http.get(URL_, () => HttpResponse.error()))
    const e = await failure(call())
    expect(e.kind).toBe('network')
    expect(healthRegistry.get('mainnet', 'pe').lastError).toMatchObject({ kind: 'network' })
  })

  it('throws timeout when the source is too slow', async () => {
    server.use(
      http.get(URL_, async () => {
        await delay(500)
        return HttpResponse.json({ n: 1 })
      }),
    )
    const e = await failure(call({ timeoutMs: 40 }))
    expect(e.kind).toBe('timeout')
  })

  it('throws aborted when the caller aborts, and leaves health untouched', async () => {
    server.use(
      http.get(URL_, async () => {
        await delay(500)
        return HttpResponse.json({ n: 1 })
      }),
    )
    const controller = new AbortController()
    const pending = failure(call({ signal: controller.signal }))
    setTimeout(() => controller.abort(), 20)
    expect((await pending).kind).toBe('aborted')
    expect(healthRegistry.get('mainnet', 'pe').state).toBe('unknown')
  })

  it('throws aborted without a request when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    expect((await failure(call({ signal: controller.signal }))).kind).toBe('aborted')
  })

  it('sends POST bodies as JSON', async () => {
    let seen: unknown
    server.use(
      http.post(URL_, async ({ request }) => {
        seen = await request.json()
        return HttpResponse.json({ n: 1 })
      }),
    )
    await call({ method: 'POST', body: { base64: 'AA==' } })
    expect(seen).toEqual({ base64: 'AA==' })
  })
})

describe('lastModifiedMs', () => {
  it('reads the header and tolerates absence', () => {
    expect(
      lastModifiedMs(
        new Response('', { headers: { 'last-modified': 'Tue, 10 Nov 2026 14:00:00 GMT' } }),
      ),
    ).toBe(Date.parse('Tue, 10 Nov 2026 14:00:00 GMT'))
    expect(lastModifiedMs(new Response(''))).toBeUndefined()
  })
})

describe('fetchSourced and the query log', () => {
  it('records one entry per call, with the path and no query', async () => {
    queryLog.clear()
    server.use(http.get(URL_, () => HttpResponse.json({ n: 1 })))
    await call({ url: `${URL_}?secret=1` })
    server.use(http.get(URL_, () => HttpResponse.json({ nope: true })))
    await failure(call({ url: `${URL_}?secret=1` }))
    const [ok, bad] = queryLog.snapshot()
    expect(ok).toMatchObject({ net: 'mainnet', source: 'pe', what: 'GET /thing', ok: true })
    expect(bad).toMatchObject({ what: 'GET /thing', ok: false, kind: 'invalid-response' })
    expect(JSON.stringify(queryLog.snapshot())).not.toContain('secret')
  })

  it('records a refusal by the mode as such', async () => {
    queryLog.clear()
    setSourceModeFromLink('decentralized')
    try {
      await failure(call())
      expect(queryLog.snapshot()[0]).toMatchObject({
        source: 'pe',
        ok: false,
        kind: 'disabled-by-mode',
        refusedByMode: true,
      })
    } finally {
      setSourceModeFromLink(undefined)
    }
  })
})
