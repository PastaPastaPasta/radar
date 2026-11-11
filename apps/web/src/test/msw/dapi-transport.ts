import { sha256 } from '@noble/hashes/sha2.js'
import { SourceError } from '@/data/errors'
import type {
  Budget,
  BudgetPressure,
  DapiCallOptions,
  DapiStreamHandle,
  DapiStreamMethod,
  DapiTransport,
  DapiUnaryMethod,
  DapiUnaryReply,
} from '@/data/dapi-core'
import { GRPC_NOT_FOUND } from '@/data/dapi-core/transport'
import { healthRegistry } from '@/data/health'
import { bytesToHex } from '@/lib/hex'
import { isDevnet, type NetworkId } from '@/lib/network'
import { loadDapiFixture, loadDapiManifest, type DapiFixture } from '../fixtures/dapi-load'
import { reportFixtureMiss } from './handlers/fixtures'

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export function requestKey(request: Uint8Array): string {
  return bytesToHex(sha256(request))
}

const CAPACITY = 8 * 50

/** A budget the tests steer: `ok` affords everything, anything else affords nothing. */
export class FixtureBudget implements Budget {
  pressure: BudgetPressure = 'ok'
  private readonly listeners = new Set<() => void>()

  setPressure(pressure: BudgetPressure): void {
    this.pressure = pressure
    for (const l of this.listeners) l()
  }
  snapshot() {
    const headroom = this.pressure === 'ok' ? CAPACITY : this.pressure === 'tight' ? 100 : 0
    return { pressure: this.pressure, headroom, capacity: CAPACITY, benched: 0, usedLastMinute: 0 }
  }
  canAfford(): boolean {
    return this.pressure === 'ok'
  }
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
}

function miss(net: NetworkId, method: string, key: string): never {
  const what = `DAPI ${method} on ${net} (request ${key})`
  reportFixtureMiss(what)
  throw new SourceError({
    source: 'dapi',
    kind: 'network',
    message: `No recorded DAPI fixture for ${what}`,
  })
}

function recordedError(f: DapiFixture): SourceError {
  return new SourceError({
    source: 'dapi',
    kind: f.error!.kind as SourceError['kind'],
    message: f.error!.message,
    status: f.error!.status,
    node: f.node,
  })
}

function abortError(): SourceError {
  return new SourceError({ source: 'dapi', kind: 'aborted', message: 'The request was aborted' })
}

export class FixtureDapiTransport implements DapiTransport {
  readonly budget: FixtureBudget
  /** A live-follow transcript stays open after its last message, as the real stream would. Set false to end it there. */
  holdOpen = true
  /** Every request served or refused, in order, for tests that assert on what the façade asked. */
  readonly calls: { net: NetworkId; method: string; key: string }[] = []
  /** The bytes of the latest request per method, for tests that build their own answers to it. */
  private readonly requests = new Map<string, Uint8Array>()

  lastRequest(method: string): Uint8Array | undefined {
    return this.requests.get(method)
  }
  private broken = false
  private readonly openStreams = new Set<(error: SourceError) => void>()

  constructor(opts: { budget?: FixtureBudget } = {}) {
    this.budget = opts.budget ?? new FixtureBudget()
  }

  /**
   * Cuts the connection the way a dead node pool would: open streams fail, every later call fails, and the DAPI
   * source reports failures until `restoreConnection` (IN-15). Fixture builds expose this to specs.
   */
  breakConnection(net: NetworkId): void {
    this.broken = true
    const error = this.lostError()
    for (const fail of [...this.openStreams]) fail(error)
    for (let i = 0; i < 3; i++) {
      healthRegistry.report(net, 'dapi', { ok: false, kind: 'network', message: error.message })
    }
  }

  restoreConnection(net: NetworkId): void {
    this.broken = false
    healthRegistry.report(net, 'dapi', { ok: true })
  }

  private lostError(): SourceError {
    return new SourceError({
      source: 'dapi',
      kind: 'network',
      message: 'The fixture connection was cut',
    })
  }

  private async find(net: NetworkId, method: string, request: Uint8Array): Promise<DapiFixture> {
    const key = requestKey(request)
    this.calls.push({ net, method, key })
    this.requests.set(method, request)
    if (isDevnet(net)) {
      throw new SourceError({
        source: 'dapi',
        kind: 'unavailable',
        message: 'No DAPI node is configured for a devnet in fixture mode',
      })
    }
    const fixture = await loadDapiFixture(net, method, key)
    if (fixture) return fixture
    if (method === 'getBlock' && (await this.aboveRecordedTip(net, request))) {
      return {
        request: key,
        recordedAt: '',
        node: '',
        error: { kind: 'http', status: GRPC_NOT_FOUND, message: 'Block not found' },
      }
    }
    return miss(net, method, key)
  }

  /** A block by height beyond the recorded tip: the chain the fixtures describe has no such block, so a node would say not found. */
  private async aboveRecordedTip(net: NetworkId, request: Uint8Array): Promise<boolean> {
    if (request[0] !== 0x08) return false
    let height = 0
    for (let i = 1, shift = 0; i < request.length; i++, shift += 7) {
      height += (request[i]! & 0x7f) * 2 ** shift
      if (request[i]! < 0x80) break
    }
    return height > (await loadDapiManifest(net)).tip.height
  }

  async unary(
    net: NetworkId,
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): Promise<DapiUnaryReply> {
    if (opts?.signal?.aborted) throw abortError()
    if (this.broken) throw this.lostError()
    const fixture = await this.find(net, method, request)
    if (fixture.error) throw recordedError(fixture)
    if (fixture.response === undefined) {
      throw new SourceError({
        source: 'dapi',
        kind: 'invalid-response',
        message: `The ${method} fixture holds no response`,
      })
    }
    return { response: fromBase64(fixture.response), node: replicaOf(fixture.node, opts) }
  }

  stream(
    net: NetworkId,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): DapiStreamHandle {
    const fixture = this.broken ? Promise.reject(this.lostError()) : this.find(net, method, request)
    fixture.catch(() => undefined)
    const signal = opts?.signal
    const holdOpen = () => this.holdOpen
    const lost = () => (this.broken ? this.lostError() : undefined)
    const openStreams = this.openStreams
    async function* messages(): AsyncGenerator<Uint8Array> {
      if (signal?.aborted) throw abortError()
      const f = await fixture
      if (f.error) throw recordedError(f)
      for (const m of f.messages ?? []) {
        if (signal?.aborted) throw abortError()
        const cut = lost()
        if (cut) throw cut
        yield fromBase64(m)
      }
      const cut = lost()
      if (cut) throw cut
      if (f.ended || !holdOpen()) return
      let fail: ((error: SourceError) => void) | undefined
      await new Promise<void>((_, reject) => {
        fail = reject
        openStreams.add(reject)
        signal?.addEventListener('abort', () => reject(abortError()), { once: true })
      }).finally(() => openStreams.delete(fail!))
    }
    const handle: { node?: string; messages: AsyncGenerator<Uint8Array> } = {
      messages: messages(),
    }
    void fixture.then(
      (f) => {
        handle.node = replicaOf(f.node, opts)
      },
      () => undefined,
    )
    return handle
  }

  /** The nodes the façade reported for sending an answer that failed its checks. */
  readonly invalid: string[] = []

  reportInvalid(_net: NetworkId, node: string): void {
    this.invalid.push(node)
  }
}

/**
 * A recording holds one node's answer. When the caller asks to avoid that node (it wants a second opinion), the same
 * bytes come back as from a second replica, so a ChainLock or a block can be seen by two nodes in fixture builds too.
 */
function replicaOf(node: string | undefined, opts?: DapiCallOptions): string | undefined {
  if (!node) return node
  const avoided = new Set([
    ...(opts?.avoidNodes ?? []),
    ...(opts?.avoidNode ? [opts.avoidNode] : []),
  ])
  return avoided.has(node) ? `${node}~2` : node
}
