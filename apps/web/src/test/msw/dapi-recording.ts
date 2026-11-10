import { sha256 } from '@noble/hashes/sha2.js'
import { SourceError, isSourceError } from '@/data/errors'
import {
  GRPC_NOT_FOUND,
  type Budget,
  type DapiCallOptions,
  type DapiStreamHandle,
  type DapiStreamMethod,
  type DapiTransport,
  type DapiUnaryMethod,
  type DapiUnaryReply,
} from '@/data/dapi-core'
import { bytesToHex } from '@/lib/hex'
import type { NetworkId } from '@/lib/network'
import type { DapiFixture } from '../fixtures/dapi-load'
import { toBase64 } from './dapi-transport'

/** Fixture recording only (run from `scripts/record-dapi-fixtures.mjs`, never bundled into the app). */

const SERVICE = 'org.dash.platform.dapi.v0.Core'
const PER_NODE_PER_MINUTE = 40
const PER_NODE_IN_FLIGHT = 4
const UNARY_TIMEOUT_MS = 10_000
const ATTEMPTS = 3

export interface RecorderNode {
  url: string
}

function frame(message: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + message.length)
  new DataView(out.buffer).setUint32(1, message.length)
  out.set(message, 5)
  return out
}

function grpcError(
  code: number,
  message: string,
  node: string,
  resetSeconds?: number,
): SourceError {
  const kind =
    code === 8
      ? 'rate-limited'
      : code === 4
        ? 'timeout'
        : code === 14 || code === 2
          ? 'network'
          : 'http'
  return new SourceError({
    source: 'dapi',
    kind,
    message: message || `gRPC status ${code}`,
    status: code,
    node,
    retryAfterMs: resetSeconds ? resetSeconds * 1000 : undefined,
  })
}

function trailerStatus(text: string): { code: number; message: string } {
  const get = (name: string) => new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(text)?.[1]?.trim() ?? ''
  return { code: Number(get('grpc-status') || 0), message: decodeURIComponent(get('grpc-message')) }
}

class LiveNode {
  readonly times: number[] = []
  inFlight = 0
  dead = false
  constructor(readonly url: string) {}

  canTake(now: number): boolean {
    while (this.times.length > 0 && now - this.times[0]! > 60_000) this.times.shift()
    return (
      !this.dead && this.inFlight < PER_NODE_IN_FLIGHT && this.times.length < PER_NODE_PER_MINUTE
    )
  }
  take(now: number): void {
    this.times.push(now)
    this.inFlight++
  }
  get label(): string {
    return this.url.replace(/^https:\/\//, '')
  }
}

const idleBudget: Budget = {
  snapshot: () => ({ pressure: 'ok', headroom: 1, capacity: 1, benched: 0, usedLastMinute: 0 }),
  canAfford: () => true,
  subscribe: () => () => undefined,
}

/**
 * Plain gRPC-web over `fetch`, spread across a fixed node list. Each node gets at most 40 requests a minute
 * (the app's own cap is 50) and 4 in flight; a failed attempt moves to another node.
 */
export class LiveDapiTransport implements DapiTransport {
  readonly budget = idleBudget
  readonly requests = new Map<string, number>()
  private readonly nodes: LiveNode[]
  private cursor = 0

  constructor(
    private readonly net: NetworkId,
    nodes: RecorderNode[],
  ) {
    this.nodes = nodes.map((n) => new LiveNode(n.url))
  }

  get requestCount(): number {
    return [...this.requests.values()].reduce((a, b) => a + b, 0)
  }

  private async acquire(pinned?: string): Promise<LiveNode> {
    for (;;) {
      const now = Date.now()
      const pool = pinned ? [new LiveNode(pinned)] : this.nodes
      for (let i = 0; i < pool.length; i++) {
        const node = pool[(this.cursor + i) % pool.length]!
        if (pinned || node.canTake(now)) {
          node.take(now)
          this.cursor = (this.cursor + i + 1) % pool.length
          return node
        }
      }
      if (!pinned && this.nodes.every((n) => n.dead)) {
        throw new SourceError({
          source: 'dapi',
          kind: 'unavailable',
          message: 'Every recorder node failed',
        })
      }
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  private assertNet(net: NetworkId): void {
    if (net !== this.net) throw new Error(`This transport records ${this.net}, not ${net}`)
  }

  private count(node: LiveNode): void {
    this.requests.set(node.label, (this.requests.get(node.label) ?? 0) + 1)
  }

  private open(node: LiveNode, method: string, request: Uint8Array, signal?: AbortSignal) {
    return fetch(`${node.url}/${SERVICE}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1' },
      body: frame(request) as BodyInit,
      signal,
    })
  }

  async unary(
    net: NetworkId,
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts: DapiCallOptions = {},
  ): Promise<DapiUnaryReply> {
    this.assertNet(net)
    let last: unknown
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const node = await this.acquire(opts.nodeUrl)
      this.count(node)
      try {
        const timeout = AbortSignal.timeout(UNARY_TIMEOUT_MS)
        const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
        const res = await this.open(node, method, request, signal)
        const body = new Uint8Array(await res.arrayBuffer())
        return this.readUnary(res, body, node)
      } catch (e) {
        last = e
        if (
          isSourceError(e) &&
          e.kind === 'http' &&
          (e.status === GRPC_NOT_FOUND || e.status === 3)
        )
          throw e
        if (opts.signal?.aborted) throw e
        if (!(isSourceError(e) && e.kind === 'rate-limited') && !opts.nodeUrl) node.dead = true
        if (opts.nodeUrl) break
      } finally {
        node.inFlight--
      }
    }
    throw isSourceError(last)
      ? last
      : new SourceError({ source: 'dapi', kind: 'network', message: String(last), cause: last })
  }

  private readUnary(res: Response, body: Uint8Array, node: LiveNode): DapiUnaryReply {
    const headerStatus = res.headers.get('grpc-status')
    if (headerStatus && Number(headerStatus) !== 0) {
      throw grpcError(
        Number(headerStatus),
        decodeURIComponent(res.headers.get('grpc-message') ?? ''),
        node.label,
        Number(res.headers.get('ratelimit-reset')) || undefined,
      )
    }
    let message: Uint8Array | undefined
    let i = 0
    while (i + 5 <= body.length) {
      const len = new DataView(body.buffer, body.byteOffset + i + 1).getUint32(0)
      const payload = body.subarray(i + 5, i + 5 + len)
      if (body[i] === 0x80) {
        const status = trailerStatus(new TextDecoder().decode(payload))
        if (status.code !== 0) {
          throw grpcError(
            status.code,
            status.message,
            node.label,
            Number(res.headers.get('ratelimit-reset')) || undefined,
          )
        }
      } else message ??= payload.slice()
      i += 5 + len
    }
    if (!res.ok || message === undefined) {
      throw new SourceError({
        source: 'dapi',
        kind: 'http',
        message: `HTTP ${res.status}`,
        status: res.status,
        node: node.label,
      })
    }
    return { response: message, node: node.label }
  }

  stream(
    net: NetworkId,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts: DapiCallOptions = {},
  ): DapiStreamHandle {
    this.assertNet(net)
    const handle: DapiStreamHandle = { messages: emptyMessages() }
    handle.messages = this.follow(handle, method, request, opts)
    return handle
  }

  private async *follow(
    handle: DapiStreamHandle,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts: DapiCallOptions,
  ): AsyncGenerator<Uint8Array> {
    let last: unknown
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const node = await this.acquire(opts.nodeUrl)
      this.count(node)
      handle.node = node.label
      let delivered = 0
      try {
        const res = await this.open(node, method, request, opts.signal)
        const headerStatus = res.headers.get('grpc-status')
        if (headerStatus && Number(headerStatus) !== 0) {
          throw grpcError(
            Number(headerStatus),
            decodeURIComponent(res.headers.get('grpc-message') ?? ''),
            node.label,
          )
        }
        const reader = res.body!.getReader()
        let buffer: Uint8Array = new Uint8Array()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) return
          const joined = new Uint8Array(buffer.length + value.length)
          joined.set(buffer)
          joined.set(value, buffer.length)
          buffer = joined
          while (buffer.length >= 5) {
            const len = new DataView(buffer.buffer, buffer.byteOffset + 1).getUint32(0)
            if (buffer.length < 5 + len) break
            const payload = buffer.slice(5, 5 + len)
            const flag = buffer[0]
            buffer = buffer.slice(5 + len)
            if (flag === 0x80) {
              const status = trailerStatus(new TextDecoder().decode(payload))
              if (status.code !== 0) throw grpcError(status.code, status.message, node.label)
              return
            }
            delivered++
            yield payload
          }
        }
      } catch (e) {
        last = e
        if (opts.signal?.aborted) {
          throw new SourceError({ source: 'dapi', kind: 'aborted', message: 'aborted' })
        }
        if (delivered > 0 || opts.nodeUrl) break
        node.dead = true
      } finally {
        node.inFlight--
      }
    }
    throw isSourceError(last)
      ? last
      : new SourceError({ source: 'dapi', kind: 'network', message: String(last), cause: last })
  }
}

export interface RecordedExchange {
  net: NetworkId
  method: string
  key: string
  fixture: DapiFixture
}

async function* emptyMessages(): AsyncGenerator<Uint8Array> {
  await Promise.resolve()
  yield* []
}

const hashOf = (bytes: Uint8Array) => bytesToHex(sha256(bytes))

/** Wraps a live transport: answers repeats from what it already recorded, and keeps every exchange for writing. */
export class RecordingDapiTransport implements DapiTransport {
  readonly exchanges = new Map<string, RecordedExchange>()
  /** Streams stop after this many messages or bytes, the way a live follow would be cut. */
  streamLimits = { messages: 6, bytes: 400_000, ms: 20_000 }

  constructor(private readonly live: DapiTransport) {}

  get budget(): Budget {
    return this.live.budget
  }

  private slot(net: NetworkId, method: string, request: Uint8Array) {
    const key = hashOf(request)
    return { key, id: `${net}/${method}/${key}` }
  }

  async unary(
    net: NetworkId,
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): Promise<DapiUnaryReply> {
    const { key, id } = this.slot(net, method, request)
    const known = this.exchanges.get(id)
    if (known) return this.replay(known.fixture)
    const base = { request: toBase64(request), recordedAt: new Date().toISOString() }
    try {
      const reply = await this.live.unary(net, method, request, opts)
      const fixture: DapiFixture = {
        ...base,
        node: reply.node ?? '',
        response: toBase64(reply.response),
      }
      this.exchanges.set(id, { net, method, key, fixture })
      return reply
    } catch (e) {
      if (
        isSourceError(e) &&
        e.kind === 'http' &&
        (e.status === GRPC_NOT_FOUND || e.status === 3)
      ) {
        const fixture: DapiFixture = {
          ...base,
          node: e.node ?? '',
          error: { kind: e.kind, status: e.status, message: e.message },
        }
        this.exchanges.set(id, { net, method, key, fixture })
      }
      throw e
    }
  }

  private replay(f: DapiFixture): DapiUnaryReply {
    if (f.error) {
      throw new SourceError({
        source: 'dapi',
        kind: f.error.kind as SourceError['kind'],
        message: f.error.message,
        status: f.error.status,
        node: f.node,
      })
    }
    const bin = atob(f.response!)
    return { response: Uint8Array.from(bin, (c) => c.charCodeAt(0)), node: f.node }
  }

  stream(
    net: NetworkId,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): DapiStreamHandle {
    const handle: DapiStreamHandle = { messages: emptyMessages() }
    handle.messages = this.record(handle, net, method, request, opts)
    return handle
  }

  private async *record(
    handle: DapiStreamHandle,
    net: NetworkId,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): AsyncGenerator<Uint8Array> {
    const { key, id } = this.slot(net, method, request)
    const known = this.exchanges.get(id)
    if (known) {
      for (const m of known.fixture.messages ?? []) {
        yield Uint8Array.from(atob(m), (c) => c.charCodeAt(0))
      }
      return
    }
    const abort = new AbortController()
    opts?.signal?.addEventListener('abort', () => abort.abort(), { once: true })
    const limits = this.streamLimits
    const timer = setTimeout(() => abort.abort(), limits.ms)
    const live = this.live.stream(net, method, request, { ...opts, signal: abort.signal })
    const messages: string[] = []
    let bytes = 0
    let ended = false
    try {
      for await (const m of live.messages) {
        handle.node = live.node
        messages.push(toBase64(m))
        bytes += m.length
        yield m
        if (messages.length >= limits.messages || bytes >= limits.bytes) {
          abort.abort()
          break
        }
      }
      ended = !abort.signal.aborted
    } catch (e) {
      if (!(isSourceError(e) && e.kind === 'aborted' && !opts?.signal?.aborted)) throw e
    } finally {
      clearTimeout(timer)
      abort.abort()
      this.exchanges.set(id, {
        net,
        method,
        key,
        fixture: {
          request: toBase64(request),
          recordedAt: new Date().toISOString(),
          node: live.node ?? '',
          messages,
          ended,
        },
      })
    }
  }
}
