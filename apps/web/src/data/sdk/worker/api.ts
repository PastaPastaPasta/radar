import type {
  SdkDecodeKind,
  SdkDecodeOptions,
  SdkMethodName,
  SdkMethods,
  SdkNetworkConfig,
  SdkWorkerApi,
  WireError,
  WireResult,
} from '../methods'
import type { NetworkId } from '@/lib/network'
import { chainIdText } from './convert'
import { classify, isRetryable } from './errors'
import { impl, type ImplOutput, type SdkReads } from './impl'
import { SDK_VERSION } from './version'

export const CALL_TIMEOUT_MS = 8_000
export const CONNECT_TIMEOUT_MS = 20_000
export const MAX_IN_FLIGHT = 6
export const MAX_SESSIONS = 2

/** One connected SDK. `free` releases its wasm memory. */
export interface SdkHandle {
  reads: SdkReads
  protocolVersion: number
  free(): void
}

export interface SdkWorkerDeps {
  createSdk(cfg: SdkNetworkConfig): Promise<SdkHandle>
  decode(kind: SdkDecodeKind, bytes: Uint8Array, opts?: SdkDecodeOptions): Promise<unknown>
  now?: () => number
}

type Failure = WireError['error']

class Timeout extends Error {
  override readonly name = 'Timeout'
}

function withTimeout<T>(run: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fail = reject as (reason: unknown) => void
    const timer = setTimeout(() => fail(new Timeout(`No answer within ${ms} ms`)), ms)
    run().then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        fail(e)
      },
    )
  })
}

const sleepTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function failure(e: unknown): WireError {
  return { ok: false, error: classify(e) }
}

function toBytes(v: Uint8Array): Uint8Array {
  return Uint8Array.from(v)
}

/** The wire result for an implementation's output. Proof bytes are copied out of wasm memory into buffers the worker can transfer. */
export function toWire<R>(out: ImplOutput<R>, tookMs: number): WireResult<R> {
  const r = out.response
  if (!r) {
    const meta = out.unprovedMeta
    return { ok: true, data: out.data, proved: false, ...(meta ? { meta } : {}), tookMs }
  }
  const proof = {
    grovedbProof: toBytes(r.proof.grovedbProof),
    quorumHash: toBytes(r.proof.quorumHash),
    signature: toBytes(r.proof.signature),
    round: r.proof.round,
    blockIdHash: toBytes(r.proof.blockIdHash),
    quorumType: r.proof.quorumType,
  }
  const meta = {
    height: Number(r.metadata.height),
    coreChainLockedHeight: r.metadata.coreChainLockedHeight,
    epoch: r.metadata.epoch,
    timeMs: Number(r.metadata.timeMs),
    protocolVersion: r.metadata.protocolVersion,
    chainId: chainIdText(r.metadata.chainId),
  }
  r.free?.()
  return { ok: true, data: out.data, proved: true, meta, proof, tookMs }
}

/**
 * The worker's logic, free of Comlink and of the wasm so it can be tested with fakes (§3.2): connects one SDK per
 * network (two alive at most), runs at most six calls at a time, gives every call 8 s (or `settings.timeoutMs`) and one more try, and turns every
 * failure into a `WireError` instead of throwing.
 */
export function createSdkWorkerApi(deps: SdkWorkerDeps) {
  const now = deps.now ?? (() => performance.now())
  const sessions = new Map<NetworkId, Promise<SdkHandle>>()
  const configs = new Map<NetworkId, SdkNetworkConfig>()
  let inFlight = 0
  const waiting: (() => void)[] = []

  async function slot<T>(run: () => Promise<T>): Promise<T> {
    if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve))
    inFlight++
    try {
      return await run()
    } finally {
      inFlight--
      waiting.shift()?.()
    }
  }

  function touch(net: NetworkId, session: Promise<SdkHandle>): void {
    sessions.delete(net)
    sessions.set(net, session)
    while (sessions.size > MAX_SESSIONS) {
      const [oldest, handle] = sessions.entries().next().value!
      sessions.delete(oldest)
      void handle.then(
        (h) => h.free(),
        () => undefined,
      )
    }
  }

  function session(net: NetworkId): Promise<SdkHandle> {
    const existing = sessions.get(net)
    if (existing) {
      touch(net, existing)
      return existing
    }
    const cfg = configs.get(net)
    if (!cfg) return Promise.reject(new Error(`The SDK for ${net} was never connected`))
    const created = withTimeout(
      () => deps.createSdk(cfg),
      cfg.settings?.connectTimeoutMs ?? CONNECT_TIMEOUT_MS,
    )
    created.catch(() => {
      if (sessions.get(net) === created) sessions.delete(net)
    })
    touch(net, created)
    return created
  }

  async function attempt<M extends SdkMethodName>(
    net: NetworkId,
    method: M,
    args: SdkMethods[M]['args'],
  ): Promise<ImplOutput<SdkMethods[M]['result']>> {
    const handle = await session(net)
    return withTimeout(
      () => impl[method](handle.reads, args),
      configs.get(net)?.settings?.timeoutMs ?? CALL_TIMEOUT_MS,
    )
  }

  const api = {
    async connect(cfg: SdkNetworkConfig) {
      const started = now()
      configs.set(cfg.net, cfg)
      try {
        const handle = await session(cfg.net)
        return {
          sdkVersion: SDK_VERSION,
          protocolVersion: handle.protocolVersion,
          tookMs: now() - started,
        }
      } catch (e) {
        return failure(e)
      }
    },

    async call<M extends SdkMethodName>(
      net: NetworkId,
      method: M,
      args: SdkMethods[M]['args'],
    ): Promise<WireResult<SdkMethods[M]['result']> | WireError> {
      if (!(method in impl)) {
        return {
          ok: false,
          error: { kind: 'unavailable', message: `Unknown SDK method ${method}` },
        }
      }
      return slot(async () => {
        const started = now()
        let last: Failure | undefined
        for (let tries = 0; tries < 2; tries++) {
          try {
            const out = await attempt(net, method, args)
            return toWire(out, now() - started)
          } catch (e) {
            last = classify(e)
            if (!isRetryable(last)) break
            await sleepTick()
          }
        }
        return {
          ok: false as const,
          error: last ?? { kind: 'network' as const, message: 'The SDK failed' },
        }
      })
    },

    async decode(kind: SdkDecodeKind, bytes: Uint8Array, opts?: SdkDecodeOptions) {
      const started = now()
      try {
        const data = await deps.decode(kind, bytes, opts)
        return { ok: true as const, data, proved: false, tookMs: now() - started }
      } catch (e) {
        return failure(e)
      }
    },
  }
  return api satisfies SdkWorkerApi
}

export type SdkWorkerImpl = ReturnType<typeof createSdkWorkerApi>
