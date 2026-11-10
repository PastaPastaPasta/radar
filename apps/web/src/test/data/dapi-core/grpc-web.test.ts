import { describe, expect, it } from 'vitest'
import { SourceError } from '@/data/errors'
import { bodyOf, grpcFail, grpcOk, trailerFrame } from '@/test/grpc-fake'
import {
  FrameReader,
  frameMessage,
  openCall,
  parseTrailers,
  rateLimitOf,
  unaryCall,
} from '@/data/dapi-core/grpc-web'

const bytes = (...n: number[]) => Uint8Array.from(n)

describe('gRPC-web framing', () => {
  it('frames a message with a 5-byte header', () => {
    expect([...frameMessage(bytes(1, 2, 3))]).toEqual([0, 0, 0, 0, 3, 1, 2, 3])
  })

  it('reads frames split across chunks and tells data from trailers', () => {
    const reader = new FrameReader()
    const wire = new Uint8Array([
      ...frameMessage(bytes(9, 8)),
      ...trailerFrame({ 'grpc-status': '0' }),
    ])
    expect(reader.push(wire.subarray(0, 3))).toEqual([])
    const frames = reader.push(wire.subarray(3))
    expect(frames).toHaveLength(2)
    expect(frames[0]).toEqual({ kind: 'message', data: bytes(9, 8) })
    expect(frames[1]).toMatchObject({ kind: 'trailers' })
    expect(reader.pending).toBe(false)
  })

  it('parses trailers case-insensitively', () => {
    expect(
      parseTrailers('Grpc-Status: 5\r\ngrpc-message: not%20found\r\n').get('grpc-status'),
    ).toBe('5')
  })

  it('reads the rate-limit headers a gateway exposes', () => {
    const headers = new Headers({
      'ratelimit-limit': '150',
      'ratelimit-remaining': '29',
      'ratelimit-reset': '31',
    })
    expect(rateLimitOf(headers)).toEqual({ limit: 150, remaining: 29, resetS: 31 })
    expect(rateLimitOf(new Headers())).toEqual({})
  })
})

const call = (response: Response | Promise<Response>) =>
  unaryCall({
    baseUrl: 'https://1.2.3.4:443',
    method: 'getBestBlockHeight',
    request: bytes(),
    fetch: () => Promise.resolve(response),
  })

describe('unaryCall', () => {
  it('returns the single message and the rate-limit headers', async () => {
    const out = await call(grpcOk([bytes(7)], { 'ratelimit-remaining': '100' }))
    expect(out.response).toEqual(bytes(7))
    expect(out.rate.remaining).toBe(100)
  })

  it('maps RESOURCE_EXHAUSTED to rate-limited with the reset in ms', async () => {
    const e = await call(grpcFail(8, 'rate limited', { 'ratelimit-reset': '31' })).catch(
      (x: unknown) => x,
    )
    expect(e).toBeInstanceOf(SourceError)
    expect(e).toMatchObject({ kind: 'rate-limited', status: 8, retryAfterMs: 31_000 })
  })

  it('maps NOT_FOUND and INVALID_ARGUMENT to http with the gRPC code', async () => {
    expect(await call(grpcFail(5, 'nope')).catch((x: unknown) => x)).toMatchObject({
      kind: 'http',
      status: 5,
    })
    expect(await call(grpcFail(3, 'bad')).catch((x: unknown) => x)).toMatchObject({
      kind: 'http',
      status: 3,
    })
  })

  it('reads an error carried in the trailers', async () => {
    const res = new Response(
      bodyOf(trailerFrame({ 'grpc-status': '14', 'grpc-message': 'no%20healthy%20upstream' })),
    )
    expect(await call(res).catch((x: unknown) => x)).toMatchObject({
      kind: 'http',
      status: 14,
      message: 'no healthy upstream',
    })
  })

  it('treats a bare HTTP 429 as rate-limited and HTTP 500 as http', async () => {
    expect(await call(new Response(null, { status: 429 })).catch((x: unknown) => x)).toMatchObject({
      kind: 'rate-limited',
    })
    expect(await call(new Response(null, { status: 500 })).catch((x: unknown) => x)).toMatchObject({
      kind: 'http',
      status: 500,
    })
  })

  it('reports a failed fetch as network and an aborted one as aborted', async () => {
    const refused = unaryCall({
      baseUrl: 'https://1.2.3.4',
      method: 'x',
      request: bytes(),
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    expect(await refused.catch((x: unknown) => x)).toMatchObject({ kind: 'network' })
    const ctrl = new AbortController()
    ctrl.abort()
    const aborted = unaryCall({
      baseUrl: 'https://1.2.3.4',
      method: 'x',
      request: bytes(),
      signal: ctrl.signal,
      fetch: () => Promise.reject(new DOMException('x', 'AbortError')),
    })
    expect(await aborted.catch((x: unknown) => x)).toMatchObject({ kind: 'aborted' })
  })

  it('says timeout when the signal was aborted with a TimeoutError', async () => {
    const ctrl = new AbortController()
    ctrl.abort(new DOMException('slow', 'TimeoutError'))
    const slow = unaryCall({
      baseUrl: 'https://1.2.3.4',
      method: 'x',
      request: bytes(),
      signal: ctrl.signal,
      fetch: () => Promise.reject(new DOMException('x', 'AbortError')),
    })
    expect(await slow.catch((x: unknown) => x)).toMatchObject({ kind: 'timeout' })
  })

  it('posts the request as a gRPC-web frame to the service path', async () => {
    let seen: { url: string; init?: RequestInit } | undefined
    await unaryCall({
      baseUrl: 'https://1.2.3.4:443',
      method: 'getBlock',
      request: bytes(1, 2),
      fetch: (url, init) => {
        seen = { url, init }
        return Promise.resolve(grpcOk([bytes(0)]))
      },
    })
    expect(seen?.url).toBe('https://1.2.3.4:443/org.dash.platform.dapi.v0.Core/getBlock')
    expect(seen?.init?.method).toBe('POST')
    expect(new Headers(seen?.init?.headers).get('content-type')).toBe('application/grpc-web+proto')
    expect([...(seen?.init?.body as Uint8Array)]).toEqual([0, 0, 0, 0, 2, 1, 2])
    expect(seen?.init?.credentials).toBe('omit')
  })
})

describe('openCall streams', () => {
  it('yields each message, then ends on a clean status', async () => {
    const res = grpcOk([bytes(1), bytes(2), bytes(3)])
    const open = await openCall({
      baseUrl: 'https://h',
      method: 'm',
      request: bytes(),
      fetch: () => Promise.resolve(res),
    })
    const got: number[] = []
    for await (const m of open.messages) got.push(m[0]!)
    expect(got).toEqual([1, 2, 3])
  })

  it('fails a stream the server cut without trailers', async () => {
    const res = new Response(bodyOf(frameMessage(bytes(1))))
    const open = await openCall({
      baseUrl: 'https://h',
      method: 'm',
      request: bytes(),
      fetch: () => Promise.resolve(res),
    })
    const it = open.messages
    expect((await it.next()).value).toEqual(bytes(1))
    expect(await it.next().catch((x: unknown) => x)).toMatchObject({ kind: 'network' })
  })
})
