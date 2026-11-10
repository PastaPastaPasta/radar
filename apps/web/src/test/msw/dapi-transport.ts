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
import { bytesToHex } from '@/lib/hex'
import type { NetworkId } from '@/lib/network'
import { loadDapiFixture, type DapiFixture } from '../fixtures/dapi-load'
import { reportFixtureMiss } from './handlers/fixtures'

export const FIXTURE_ERROR_PREFIX = '[radar-fixtures]'

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
  canAfford(_net: NetworkId, _n: number): boolean {
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
  console.error(`${FIXTURE_ERROR_PREFIX} no recorded fixture for ${what}`)
  throw new SourceError({
    source: 'dapi',
    kind: 'network',
    message: `No recorded DAPI fixture for ${what}`,
  })
}

function abortError(): SourceError {
  return new SourceError({ source: 'dapi', kind: 'aborted', message: 'The request was aborted' })
}

export class FixtureDapiTransport implements DapiTransport {
  readonly budget: FixtureBudget
  /** Every request served or refused, in order, for tests that assert on what the façade asked. */
  readonly calls: { net: NetworkId; method: string; key: string }[] = []

  constructor(opts: { budget?: FixtureBudget } = {}) {
    this.budget = opts.budget ?? new FixtureBudget()
  }

  private async find(net: NetworkId, method: string, request: Uint8Array): Promise<DapiFixture> {
    const key = requestKey(request)
    this.calls.push({ net, method, key })
    const fixture = await loadDapiFixture(net, method, key)
    return fixture ?? miss(net, method, key)
  }

  async unary(
    net: NetworkId,
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): Promise<DapiUnaryReply> {
    if (opts?.signal?.aborted) throw abortError()
    const fixture = await this.find(net, method, request)
    if (fixture.response === undefined) {
      throw new SourceError({
        source: 'dapi',
        kind: 'invalid-response',
        message: `The ${method} fixture holds no response`,
      })
    }
    return { response: fromBase64(fixture.response), node: fixture.node }
  }

  stream(
    net: NetworkId,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): DapiStreamHandle {
    const fixture = this.find(net, method, request)
    fixture.catch(() => undefined)
    const signal = opts?.signal
    async function* messages(): AsyncGenerator<Uint8Array> {
      if (signal?.aborted) throw abortError()
      const f = await fixture
      for (const m of f.messages ?? []) {
        if (signal?.aborted) throw abortError()
        yield fromBase64(m)
      }
      if (f.ended) return
      await new Promise<void>((_, reject) => {
        if (!signal) return
        signal.addEventListener('abort', () => reject(abortError()), { once: true })
      })
    }
    return { messages: messages() }
  }
}
