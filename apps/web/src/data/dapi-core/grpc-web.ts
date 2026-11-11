import { isSourceError, SourceError } from '../errors'
import { GRPC_INVALID_ARGUMENT, GRPC_NOT_FOUND } from './transport'

export const CORE_SERVICE = 'org.dash.platform.dapi.v0.Core'

const GRPC_DEADLINE_EXCEEDED = 4
const GRPC_RESOURCE_EXHAUSTED = 8
const DEFAULT_RESET_S = 60
const MIN_RESET_S = 1
const MAX_RESET_S = 120
/** A reset above this is a clock time in epoch seconds, not a countdown. */
const EPOCH_RESET_S = 3_600

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
  if (reset !== undefined)
    out.resetS = clampResetS(reset > EPOCH_RESET_S ? reset - Date.now() / 1000 : reset)
  return out
}

/** A node's reset countdown kept to a range a client can act on: 0 or negative would bench nothing, a huge one for good. */
export function clampResetS(seconds: number): number {
  return Math.min(MAX_RESET_S, Math.max(MIN_RESET_S, Math.ceil(seconds)))
}

/** One gRPC-web data frame: flag 0, a 4-byte big-endian length, the protobuf message. */
export function frameMessage(message: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(5 + message.length)
  new DataView(out.buffer).setUint32(1, message.length)
  out.set(message, 5)
  return out
}

export type GrpcFrame = { kind: 'message'; data: Uint8Array } | { kind: 'trailers'; text: string }

/** Largest reply message the client reads, by method; a node that declares more is not speaking for the chain. */
export const MAX_FRAME_BYTES: Record<string, number> = {
  getBlock: 4 * 1024 * 1024,
  getTransaction: 2 * 1024 * 1024,
  subscribeToBlockHeadersWithChainLocks: 512 * 1024,
  subscribeToTransactionsWithProofs: 4 * 1024 * 1024,
  subscribeToMasternodeList: 16 * 1024 * 1024,
}
export const DEFAULT_MAX_FRAME_BYTES = 64 * 1024
const MAX_TRAILER_BYTES = 16 * 1024

/** The byte stream is not valid gRPC-web: too long a frame, a compressed one, or a cut-off one. */
export class FrameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrameError'
  }
}

/** Splits a gRPC-web byte stream into frames. Feed it chunks as they arrive. */
export class FrameReader {
  private chunks: Uint8Array[] = []
  private buffered = 0

  constructor(private readonly maxFrameBytes = DEFAULT_MAX_FRAME_BYTES) {}

  private take(n: number): Uint8Array {
    const out = new Uint8Array(n)
    let at = 0
    while (at < n) {
      const head = this.chunks[0]!
      const use = Math.min(head.length, n - at)
      out.set(head.subarray(0, use), at)
      at += use
      if (use === head.length) this.chunks.shift()
      else this.chunks[0] = head.subarray(use)
    }
    this.buffered -= n
    return out
  }

  private peekHeader(): Uint8Array {
    const out = new Uint8Array(5)
    let at = 0
    for (const chunk of this.chunks) {
      const use = Math.min(chunk.length, 5 - at)
      out.set(chunk.subarray(0, use), at)
      at += use
      if (at === 5) break
    }
    return out
  }

  push(chunk: Uint8Array): GrpcFrame[] {
    if (chunk.length > 0) {
      this.chunks.push(chunk)
      this.buffered += chunk.length
    }
    const frames: GrpcFrame[] = []
    while (this.buffered >= 5) {
      const header = this.peekHeader()
      const flag = header[0]!
      const length = new DataView(header.buffer).getUint32(1)
      const isTrailer = (flag & 0x80) !== 0
      if (flag & 0x7f) throw new FrameError('The DAPI reply is compressed')
      if (length > (isTrailer ? MAX_TRAILER_BYTES : this.maxFrameBytes)) {
        throw new FrameError(`The DAPI reply declares a ${length}-byte frame`)
      }
      if (this.buffered < 5 + length) break
      this.take(5)
      const body = this.take(length)
      frames.push(
        isTrailer
          ? { kind: 'trailers', text: new TextDecoder().decode(body) }
          : { kind: 'message', data: body },
      )
    }
    return frames
  }

  /** True when bytes of an unfinished frame are still buffered. */
  get pending(): boolean {
    return this.buffered > 0
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
      retryAfterMs: clampResetS(rate.resetS ?? DEFAULT_RESET_S) * 1000,
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
  /** How long the node has to send response headers. */
  headersTimeoutMs?: number
  /** Once headers are in: the longest silence between chunks of the body. */
  idleTimeoutMs?: number
  /** Once headers are in: the longest the whole body may take, however steadily it flows. */
  deadlineMs?: number
  /** Called when the response headers arrive. */
  onHeaders?: () => void
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
      retryAfterMs: clampResetS(rate.resetS ?? DEFAULT_RESET_S) * 1000,
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

/** A stalled call is the node's fault; a body that was still flowing when the deadline fell is the link's. */
const DEADLINE_ERROR = 'DeadlineError'

/** Sends one gRPC-web call. Resolves once the response headers are in; the body is read through `messages`. */
export async function openCall(init: CallInit): Promise<OpenCall> {
  const node = nodeOf(init.baseUrl)
  const doFetch = init.fetch ?? ((input, opts) => fetch(input, opts))
  const inner = new AbortController()
  const unlink = linkSignal(init.signal, inner)
  const timers: {
    headers?: ReturnType<typeof setTimeout>
    idle?: ReturnType<typeof setTimeout>
    deadline?: ReturnType<typeof setTimeout>
  } = {}
  const clearTimers = () => {
    clearTimeout(timers.headers)
    clearTimeout(timers.idle)
    clearTimeout(timers.deadline)
  }
  inner.signal.addEventListener('abort', clearTimers, { once: true })
  const timeOut = (name: string) => () =>
    inner.abort(new DOMException('The DAPI node was too slow', name))
  if (init.headersTimeoutMs !== undefined) {
    timers.headers = setTimeout(timeOut('TimeoutError'), init.headersTimeoutMs)
  }
  const armIdle = () => {
    if (init.idleTimeoutMs === undefined) return
    clearTimeout(timers.idle)
    timers.idle = setTimeout(timeOut('TimeoutError'), init.idleTimeoutMs)
  }
  const fail = (cause: unknown): never => {
    clearTimers()
    unlink()
    throw fetchFailure(cause, node, inner.signal)
  }
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
      signal: inner.signal,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
  } catch (cause) {
    return fail(cause)
  }
  clearTimeout(timers.headers)
  init.onHeaders?.()
  const rate = rateLimitOf(res.headers)
  const finish = () => {
    clearTimers()
    unlink()
  }
  if (!res.ok) {
    finish()
    void res.body?.cancel().catch(() => undefined)
    throw httpError(res, node, rate)
  }
  const headerStatus = statusOf(res.headers)
  if (headerStatus && headerStatus.code !== 0) {
    finish()
    void res.body?.cancel().catch(() => undefined)
    throw grpcError(headerStatus, node, rate)
  }
  if (init.deadlineMs !== undefined)
    timers.deadline = setTimeout(timeOut(DEADLINE_ERROR), init.deadlineMs)
  armIdle()

  async function* messages(): AsyncGenerator<Uint8Array> {
    const reader = new FrameReader(MAX_FRAME_BYTES[init.method] ?? DEFAULT_MAX_FRAME_BYTES)
    let trailerStatus: GrpcStatus | undefined
    let sawTrailer = false
    if (res.body) {
      const stream = res.body.getReader()
      try {
        for (;;) {
          let chunk: ReadableStreamReadResult<Uint8Array>
          try {
            chunk = await stream.read()
          } catch (cause) {
            throw fetchFailure(cause, node, inner.signal, 'body')
          }
          if (chunk.done) break
          armIdle()
          let frames: GrpcFrame[]
          try {
            frames = reader.push(chunk.value)
          } catch (cause) {
            throw new SourceError({
              source: 'dapi',
              kind: 'invalid-response',
              message:
                cause instanceof Error ? cause.message : 'The DAPI reply is not valid gRPC-web',
              node,
              cause,
            })
          }
          for (const frame of frames) {
            if (sawTrailer) continue
            if (frame.kind === 'message') yield frame.data
            else {
              sawTrailer = true
              trailerStatus = statusOf(parseTrailers(frame.text))
            }
          }
        }
      } finally {
        finish()
        stream.cancel().catch(() => undefined)
      }
    } else finish()
    if (reader.pending) {
      throw new SourceError({
        source: 'dapi',
        kind: 'invalid-response',
        message: 'The DAPI reply ended in the middle of a frame',
        node,
      })
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
      message: ENDED_WITHOUT_STATUS,
      node,
    })
  }
  return { rate, messages: messages() }
}

export const ENDED_WITHOUT_STATUS = 'The DAPI stream ended without a status'

/**
 * One request, exactly one response message. A reply that is cut off, or ends without a status, came from a node that
 * answered and then failed, not from one that could not be reached.
 */
export async function unaryCall(
  init: CallInit,
): Promise<{ response: Uint8Array; rate: RateLimitHeaders }> {
  const call = await openCall(init)
  let response: Uint8Array | undefined
  try {
    for await (const message of call.messages) {
      response ??= message
    }
  } catch (e) {
    if (isSourceError(e) && e.kind === 'network') {
      throw new SourceError({
        source: 'dapi',
        kind: 'invalid-response',
        message: 'The DAPI reply was cut short',
        node: e.node,
        cause: e,
      })
    }
    throw e
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

function linkSignal(signal: AbortSignal | undefined, ctrl: AbortController): () => void {
  if (!signal) return () => undefined
  if (signal.aborted) {
    ctrl.abort(signal.reason)
    return () => undefined
  }
  const onAbort = () => ctrl.abort(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  return () => signal.removeEventListener('abort', onAbort)
}

function fetchFailure(
  cause: unknown,
  node: string,
  signal?: AbortSignal,
  phase: 'headers' | 'body' = 'headers',
): SourceError {
  if (cause instanceof SourceError) return cause
  if (signal?.aborted) {
    const reason: unknown = signal.reason
    const name = (reason as { name?: string } | undefined)?.name
    const timedOut = name === 'TimeoutError' || name === DEADLINE_ERROR
    return new SourceError({
      source: 'dapi',
      kind: timedOut ? 'timeout' : 'aborted',
      message: timedOut ? 'The DAPI node did not answer in time' : 'The request was aborted',
      node,
      cause,
      ...(name === DEADLINE_ERROR ? { bytesFlowing: true } : {}),
    })
  }
  return new SourceError({
    source: 'dapi',
    kind: 'network',
    message:
      phase === 'body' ? 'The DAPI reply was cut short' : 'The DAPI node could not be reached',
    node,
    cause,
  })
}
