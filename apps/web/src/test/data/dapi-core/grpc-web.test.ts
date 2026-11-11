import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceError } from '@/data/errors'
import { bodyOf, grpcFail, grpcOk, trailerFrame } from '@/test/grpc-fake'
import {
  FrameError,
  FrameReader,
  clampResetS,
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

describe('gRPC-web limits', () => {
  it('refuses a frame that declares more than its method may send, before buffering it', () => {
    const reader = new FrameReader(1024)
    expect(() => reader.push(Uint8Array.from([0, 0xff, 0xff, 0xff, 0xff, 1, 2, 3]))).toThrow(
      FrameError,
    )
    expect(() => new FrameReader(1024).push(frameMessage(new Uint8Array(1025)))).toThrow(FrameError)
    expect(new FrameReader(1024).push(frameMessage(new Uint8Array(1024)))).toHaveLength(1)
  })

  it('refuses a compressed frame: compression was not negotiated', () => {
    expect(() => new FrameReader().push(Uint8Array.from([1, 0, 0, 0, 1, 7]))).toThrow(FrameError)
  })

  it('reads a large frame sent in many small chunks without losing a byte', () => {
    const message = Uint8Array.from({ length: 50_000 }, (_, i) => i % 251)
    const wire = frameMessage(message)
    const reader = new FrameReader(100_000)
    const frames = []
    for (let at = 0; at < wire.length; at += 97)
      frames.push(...reader.push(wire.subarray(at, at + 97)))
    expect(frames).toHaveLength(1)
    expect((frames[0] as { data: Uint8Array }).data).toEqual(message)
    expect(reader.pending).toBe(false)
  })

  it('treats a reply cut off mid-frame as invalid, not as an unreachable node', async () => {
    const wire = frameMessage(bytes(1, 2, 3, 4))
    const e = await call(new Response(bodyOf(wire.subarray(0, 7)), { status: 200 })).catch(
      (x: unknown) => x,
    )
    expect(e).toMatchObject({ kind: 'invalid-response' })
  })

  it('treats a unary reply with no status as invalid, not as an unreachable node', async () => {
    const e = await call(new Response(bodyOf(frameMessage(bytes(1))), { status: 200 })).catch(
      (x: unknown) => x,
    )
    expect(e).toMatchObject({ kind: 'invalid-response' })
  })

  it('ignores message frames after the trailers', async () => {
    const res = new Response(
      bodyOf(frameMessage(bytes(5)), trailerFrame({ 'grpc-status': '0' }), frameMessage(bytes(6))),
      { status: 200 },
    )
    const { response } = await call(res)
    expect(response).toEqual(bytes(5))
  })

  it('keeps a node’s reset countdown to something a client can act on', () => {
    expect(clampResetS(-5)).toBe(1)
    expect(clampResetS(0)).toBe(1)
    expect(clampResetS(17.2)).toBe(18)
    expect(clampResetS(1.7e9)).toBe(120)
    expect(rateLimitOf(new Headers({ 'ratelimit-reset': '-3' })).resetS).toBe(1)
  })

  it('reads an epoch timestamp in ratelimit-reset as the time left to it', () => {
    const at = Math.floor(Date.now() / 1000) + 30
    const reset = rateLimitOf(new Headers({ 'ratelimit-reset': String(at) })).resetS
    expect(reset).toBeGreaterThanOrEqual(29)
    expect(reset).toBeLessThanOrEqual(31)
  })
})

describe('gRPC-web timeouts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Sends one chunk every `everyMs`; with `hold`, stays open after the last one. Errors when the request is aborted. */
  function trickling(
    chunks: Uint8Array[],
    everyMs: number,
    signal: AbortSignal | null | undefined,
    hold = false,
  ): Response {
    let i = 0
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true })
        },
        async pull(controller) {
          await new Promise((r) => setTimeout(r, everyMs))
          const next = chunks[i++]
          if (next) controller.enqueue(next)
          else if (!hold) controller.close()
          else await new Promise(() => undefined)
        },
      }),
      { status: 200 },
    )
  }

  const timed = (
    make: (signal: AbortSignal | null | undefined) => Response,
    t: { idleTimeoutMs?: number; deadlineMs?: number },
  ) =>
    unaryCall({
      baseUrl: 'https://1.2.3.4:443',
      method: 'getBestBlockHeight',
      request: bytes(),
      fetch: (_url, init) => Promise.resolve(make(init?.signal)),
      headersTimeoutMs: 8_000,
      ...t,
    })

  it('does not time out a body that keeps arriving, however long it takes within the deadline', async () => {
    const wire = new Uint8Array([
      ...frameMessage(new Uint8Array(40)),
      ...trailerFrame({ 'grpc-status': '0' }),
    ])
    const chunks = Array.from({ length: 6 }, (_, i) =>
      wire.subarray(i * 10, i === 5 ? wire.length : i * 10 + 10),
    )
    const pending = timed((signal) => trickling(chunks, 5_000, signal), {
      idleTimeoutMs: 8_000,
      deadlineMs: 60_000,
    })
    await vi.advanceTimersByTimeAsync(40_000)
    expect((await pending).response).toHaveLength(40)
  })

  it('times out a body that goes quiet, as the node’s fault', async () => {
    const part = frameMessage(new Uint8Array(40)).subarray(0, 10)
    const pending = timed((signal) => trickling([part], 5_000, signal, true), {
      idleTimeoutMs: 8_000,
    }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(30_000)
    const e = (await pending) as SourceError
    expect(e).toMatchObject({ kind: 'timeout' })
    expect(e.bytesFlowing).toBeUndefined()
  })

  it('times out a body that is still arriving at the overall deadline, as the link’s fault', async () => {
    const wire = frameMessage(new Uint8Array(400))
    const chunks = Array.from({ length: 40 }, (_, i) => wire.subarray(i * 10, i * 10 + 10))
    const pending = timed((signal) => trickling(chunks, 5_000, signal), {
      idleTimeoutMs: 8_000,
      deadlineMs: 30_000,
    }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(35_000)
    expect(await pending).toMatchObject({ kind: 'timeout', bytesFlowing: true })
  })
})
