import { SourceError } from '../errors'
import { GRPC_INVALID_ARGUMENT, GRPC_NOT_FOUND } from './transport'

export const CORE_SERVICE = 'org.dash.platform.dapi.v0.Core'

const GRPC_DEADLINE_EXCEEDED = 4
const GRPC_RESOURCE_EXHAUSTED = 8
const DEFAULT_RESET_S = 60

export interface RateLimitHeaders {
  limit?: number
  remaining?: number
  /** Seconds until the node's window resets. */
  resetS?: number
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function readNumber(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name)
  if (raw === null || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export function rateLimitOf(headers: Headers): RateLimitHeaders {
  const out: RateLimitHeaders = {}
  const limit = readNumber(headers, 'ratelimit-limit')
  const remaining = readNumber(headers, 'ratelimit-remaining')
  const reset = readNumber(headers, 'ratelimit-reset')
  if (limit !== undefined) out.limit = limit
  if (remaining !== undefined) out.remaining = remaining
  if (reset !== undefined) out.resetS = reset
  return out
}

/** One gRPC-web data frame: flag 0, a 4-byte big-endian length, the protobuf message. */
export function frameMessage(message: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(5 + message.length)
  new DataView(out.buffer).setUint32(1, message.length)
  out.set(message, 5)
  return out
}

export type GrpcFrame = { kind: 'message'; data: Uint8Array } | { kind: 'trailers'; text: string }

/** Splits a gRPC-web byte stream into frames. Feed it chunks as they arrive. */
export class FrameReader {
  private buffer: Uint8Array = new Uint8Array(0)

  push(chunk: Uint8Array): GrpcFrame[] {
    if (this.buffer.length === 0) this.buffer = chunk
    else {
      const joined = new Uint8Array(this.buffer.length + chunk.length)
      joined.set(this.buffer)
      joined.set(chunk, this.buffer.length)
      this.buffer = joined
    }
    const frames: GrpcFrame[] = []
    for (;;) {
      if (this.buffer.length < 5) break
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.length)
      const length = view.getUint32(1)
      if (this.buffer.length < 5 + length) break
      const flag = this.buffer[0]!
      const body = this.buffer.subarray(5, 5 + length)
      frames.push(
        flag & 0x80
          ? { kind: 'trailers', text: new TextDecoder().decode(body) }
          : { kind: 'message', data: body.slice() },
      )
      this.buffer = this.buffer.subarray(5 + length)
    }
    return frames
  }

  /** True when bytes of an unfinished frame are still buffered. */
  get pending(): boolean {
    return this.buffer.length > 0
  }
}

export function parseTrailers(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    out.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim())
  }
  return out
}

function decodeGrpcMessage(raw: string | undefined): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export interface GrpcStatus {
  code: number
  message: string
}

export function statusOf(source: {
  get(name: string): string | null | undefined
}): GrpcStatus | undefined {
  const raw = source.get('grpc-status')
  if (raw === null || raw === undefined || raw === '') return undefined
  const code = Number(raw)
  if (!Number.isInteger(code)) return undefined
  return { code, message: decodeGrpcMessage(source.get('grpc-message') ?? undefined) }
}

/** Maps a non-zero gRPC status (or a bare HTTP status) to the error every caller of the transport sees. */
export function grpcError(
  status: GrpcStatus,
  node: string | undefined,
  rate: RateLimitHeaders = {},
): SourceError {
  const message = status.message || `DAPI answered with gRPC status ${status.code}`
  if (status.code === GRPC_RESOURCE_EXHAUSTED) {
    return new SourceError({
      source: 'dapi',
      kind: 'rate-limited',
      message,
      status: status.code,
      retryAfterMs: (rate.resetS ?? DEFAULT_RESET_S) * 1000,
      node,
    })
  }
  if (status.code === GRPC_DEADLINE_EXCEEDED) {
    return new SourceError({ source: 'dapi', kind: 'timeout', message, status: status.code, node })
  }
  return new SourceError({ source: 'dapi', kind: 'http', message, status: status.code, node })
}

/** A gRPC status that is the chain's answer, not a node fault. */
export function isAnswerStatus(code: number): boolean {
  return code === GRPC_NOT_FOUND || code === GRPC_INVALID_ARGUMENT
}

export interface CallInit {
  baseUrl: string
  method: string
  request: Uint8Array
  signal?: AbortSignal
  fetch?: FetchLike
}

export interface OpenCall {
  rate: RateLimitHeaders
  /** Message bodies in order. Throws a `SourceError` when the call ends with a non-zero status. */
  messages: AsyncGenerator<Uint8Array>
}

function nodeOf(baseUrl: string): string {
  return baseUrl.replace(/^https?:\/\//, '')
}

function httpError(res: Response, node: string, rate: RateLimitHeaders): SourceError {
  if (res.status === 429) {
    return new SourceError({
      source: 'dapi',
      kind: 'rate-limited',
      message: 'DAPI node is rate limiting this client',
      status: 429,
      retryAfterMs: (rate.resetS ?? DEFAULT_RESET_S) * 1000,
      node,
    })
  }
  return new SourceError({
    source: 'dapi',
    kind: 'http',
    message: `DAPI node answered HTTP ${res.status}`,
    status: res.status,
    node,
  })
}

/** Sends one gRPC-web call. Resolves once the response headers are in; the body is read through `messages`. */
export async function openCall(init: CallInit): Promise<OpenCall> {
  const node = nodeOf(init.baseUrl)
  const doFetch = init.fetch ?? ((input, opts) => fetch(input, opts))
  let res: Response
  try {
    res = await doFetch(`${init.baseUrl}/${CORE_SERVICE}/${init.method}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/grpc-web+proto',
        'x-grpc-web': '1',
        accept: 'application/grpc-web+proto',
      },
      body: frameMessage(init.request),
      signal: init.signal,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
  } catch (cause) {
    throw fetchFailure(cause, node, init.signal)
  }
  const rate = rateLimitOf(res.headers)
  if (!res.ok) throw httpError(res, node, rate)
  const headerStatus = statusOf(res.headers)
  if (headerStatus && headerStatus.code !== 0) throw grpcError(headerStatus, node, rate)

  async function* messages(): AsyncGenerator<Uint8Array> {
    const reader = new FrameReader()
    let trailerStatus: GrpcStatus | undefined
    if (res.body) {
      const stream = res.body.getReader()
      try {
        for (;;) {
          let chunk: ReadableStreamReadResult<Uint8Array>
          try {
            chunk = await stream.read()
          } catch (cause) {
            throw fetchFailure(cause, node, init.signal)
          }
          if (chunk.done) break
          for (const frame of reader.push(chunk.value)) {
            if (frame.kind === 'message') yield frame.data
            else trailerStatus = statusOf(parseTrailers(frame.text))
          }
        }
      } finally {
        stream.cancel().catch(() => undefined)
      }
    }
    if (trailerStatus) {
      if (trailerStatus.code !== 0) throw grpcError(trailerStatus, node, rate)
      return
    }
    if (headerStatus?.code === 0) return
    // Envoy cuts a stream at its maximum duration without trailers; the server ended it, the client did not.
    throw new SourceError({
      source: 'dapi',
      kind: 'network',
      message: 'The DAPI stream ended without a status',
      node,
    })
  }
  return { rate, messages: messages() }
}

/** One request, exactly one response message. */
export async function unaryCall(
  init: CallInit,
): Promise<{ response: Uint8Array; rate: RateLimitHeaders }> {
  const call = await openCall(init)
  let response: Uint8Array | undefined
  for await (const message of call.messages) {
    response ??= message
  }
  if (response === undefined) {
    throw new SourceError({
      source: 'dapi',
      kind: 'invalid-response',
      message: 'DAPI answered without a message',
      node: nodeOf(init.baseUrl),
    })
  }
  return { response, rate: call.rate }
}

function fetchFailure(cause: unknown, node: string, signal?: AbortSignal): SourceError {
  if (cause instanceof SourceError) return cause
  if (signal?.aborted) {
    const reason: unknown = signal.reason
    const timedOut = (reason as { name?: string } | undefined)?.name === 'TimeoutError'
    return new SourceError({
      source: 'dapi',
      kind: timedOut ? 'timeout' : 'aborted',
      message: timedOut ? 'The DAPI node did not answer in time' : 'The request was aborted',
      node,
      cause,
    })
  }
  return new SourceError({
    source: 'dapi',
    kind: 'network',
    message: 'The DAPI node could not be reached',
    node,
    cause,
  })
}
