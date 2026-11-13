import { bytesToHex } from '@/lib/hex'
import { isDevnet, type DevnetConfig, type NetworkId } from '@/lib/network'
import { abortedError, SourceError } from '../errors'
import { healthRegistry } from '../health'
import { queryLog } from '../query-log'
import type { ProofMeta, Sourced } from '../envelope'
import { getDapiTransport } from '../dapi-core/client'
import { registerSdkReadyProbe } from '../query/loader'
import type {
  SdkMethodName,
  SdkMethods,
  SdkNetworkConfig,
  SdkWorkerApi,
  NodeUse,
  WireError,
} from './methods'
import { sdkDevnets } from './devnets'
import { sdkConfigFor } from './networks'
import { proofStore as defaultProofStore, type ProofStore } from './proof-store'

export type SdkState = 'cold' | 'loading' | 'ready' | 'failed'

/** What the client needs from the worker (or its in-thread or fixture stand-ins). */
export type SdkTransport = SdkWorkerApi & {
  /** Stops a worker that failed, so the next connect starts a new one. */
  dispose?: () => void
}

export interface SdkClient {
  /** Start loading and connecting. Never awaited by UI. */
  warm(net: NetworkId): void
  state(net: NetworkId): SdkState
  call<M extends SdkMethodName>(
    net: NetworkId,
    method: M,
    args: SdkMethods[M]['args'],
    signal?: AbortSignal,
  ): Promise<Sourced<SdkMethods[M]['result']>>
  decode: SdkWorkerApi['decode']
  subscribe(cb: () => void): () => void
}

export interface SdkClientDeps {
  transport: () => Promise<SdkTransport>
  devnets: () => readonly DevnetConfig[]
  proofs: ProofStore
  health: Pick<typeof healthRegistry, 'report'>
  /** Forgets the transport after it failed as a whole, so `transport()` makes a new one. */
  dropTransport?: () => void
  /** Counts the Platform requests the SDK sent against the Core pool's per-node budget. */
  noteRequests?: (net: NetworkId, requests: NodeUse[]) => void
  now: () => number
  /** Runs `fn` when the browser is idle, so warm-up never competes with the page. */
  whenIdle: (fn: () => void) => void
}

const RETRY_CONNECT_AFTER_MS = 5_000
/** The worker has its own 20 s connect limit; this one is for a worker that never answers at all. */
export const CONNECT_DEADLINE_MS = 30_000
export const CALL_DEADLINE_MS = 20_000

const idle = (fn: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
  if (ric) ric(fn)
  else setTimeout(fn, 1)
}

function toSourceError(error: WireError['error']): SourceError {
  return new SourceError({
    source: 'sdk',
    kind: error.kind,
    message: error.message,
  })
}

function deadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, rejectWith) => {
    const reject = rejectWith as (reason: unknown) => void
    const timer = setTimeout(() => {
      reject(
        new SourceError({
          source: 'sdk',
          kind: 'timeout',
          message: `${what} did not answer in time`,
        }),
      )
    }, ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export function createSdkClient(deps: SdkClientDeps): SdkClient {
  interface Entry {
    state: SdkState
    ready?: Promise<SdkTransport>
    failedAt?: number
  }
  const entries = new Map<NetworkId, Entry>()
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const cb of [...listeners]) cb()
  }
  const entry = (net: NetworkId): Entry => {
    let e = entries.get(net)
    if (!e) entries.set(net, (e = { state: 'cold' }))
    return e
  }

  function configFor(net: NetworkId): SdkNetworkConfig {
    const cfg = sdkConfigFor(net, deps.devnets())
    if (!cfg) {
      throw new SourceError({
        source: 'sdk',
        kind: 'unavailable',
        message: isDevnet(net) ? 'This devnet is not configured' : 'No SDK for this network',
      })
    }
    return cfg
  }

  function ensure(net: NetworkId): Promise<SdkTransport> {
    const e = entry(net)
    if (e.ready) return e.ready
    if (
      e.state === 'failed' &&
      e.failedAt !== undefined &&
      deps.now() - e.failedAt < RETRY_CONNECT_AFTER_MS
    ) {
      return Promise.reject(
        new SourceError({
          source: 'sdk',
          kind: 'unavailable',
          message: 'The Platform SDK could not connect a moment ago',
        }),
      )
    }
    e.state = 'loading'
    emit()
    const started = deps.now()
    e.ready = (async () => {
      const transport = await deps.transport()
      let info
      try {
        info = await deadline(
          transport.connect(configFor(net)),
          CONNECT_DEADLINE_MS,
          'The Platform SDK',
        )
      } catch (e) {
        // The worker failed as a whole (never started, died, or never answered): the next try gets a new one.
        if (!(e instanceof SourceError && e.source === 'sdk' && e.kind !== 'timeout')) {
          deps.dropTransport?.()
        }
        throw e
      }
      if (info.requests) deps.noteRequests?.(net, info.requests)
      if ('ok' in info) {
        throw toSourceError(info.error)
      }
      deps.health.report(net, 'sdk', { ok: true, latencyMs: deps.now() - started })
      e.state = 'ready'
      emit()
      return transport
    })().catch((cause: unknown) => {
      e.state = 'failed'
      e.failedAt = deps.now()
      e.ready = undefined
      emit()
      const error =
        cause instanceof SourceError
          ? cause
          : new SourceError({
              source: 'sdk',
              kind: 'network',
              message: 'The Platform SDK failed to load',
              cause,
            })
      deps.health.report(net, 'sdk', { ok: false, kind: error.kind, message: error.message })
      throw error
    })
    return e.ready
  }

  return {
    warm(net) {
      if (entry(net).state !== 'cold') return
      deps.whenIdle(() => {
        if (entry(net).state === 'cold') ensure(net).catch(() => undefined)
      })
    },

    state: (net) => entry(net).state,

    async call(net, method, args, signal) {
      if (signal?.aborted) throw abortedError('sdk')
      const started = performance.now()
      let wire: Awaited<ReturnType<SdkTransport['call']>>
      try {
        const transport = await ensure(net)
        if (signal?.aborted) throw abortedError('sdk')
        wire = await deadline(transport.call(net, method, args), CALL_DEADLINE_MS, 'The SDK')
      } catch (e) {
        if (!(e instanceof SourceError && e.kind === 'aborted')) {
          queryLog.push({
            net,
            source: 'sdk',
            what: method,
            ok: false,
            kind: e instanceof SourceError ? e.kind : 'network',
            tookMs: Math.round(performance.now() - started),
          })
        }
        throw e
      }
      if (wire.requests) deps.noteRequests?.(net, wire.requests)
      // A wasm call can't be cancelled; its late answer is dropped here.
      if (signal?.aborted) throw abortedError('sdk')
      if (!wire.ok) {
        const error = toSourceError(wire.error)
        deps.health.report(net, 'sdk', { ok: false, kind: error.kind, message: error.message })
        queryLog.push({
          net,
          source: 'sdk',
          what: method,
          ok: false,
          kind: error.kind,
          tookMs: Math.round(performance.now() - started),
        })
        throw error
      }
      deps.health.report(net, 'sdk', { ok: true, latencyMs: wire.tookMs })
      queryLog.push({
        net,
        source: 'sdk',
        what: method,
        ok: true,
        tookMs: Math.round(wire.tookMs),
        proved: wire.proved,
        ...(wire.node ? { node: wire.node } : {}),
      })
      const fetchedAt = deps.now()
      const { meta } = wire
      let proof: ProofMeta | undefined
      if (wire.proved && meta && wire.proof) {
        const record = deps.proofs.put({
          net,
          method,
          args,
          recordedAt: fetchedAt,
          meta,
          proof: wire.proof,
        })
        proof = {
          id: record.id,
          method,
          platformHeight: meta.height,
          coreChainLockedHeight: meta.coreChainLockedHeight,
          epoch: meta.epoch,
          timeMs: meta.timeMs,
          protocolVersion: meta.protocolVersion,
          chainId: meta.chainId,
          quorumType: wire.proof.quorumType,
          quorumHash: bytesToHex(wire.proof.quorumHash),
          round: wire.proof.round,
          proofBytes: wire.proof.grovedbProof.length,
        }
      }
      return {
        source: 'sdk',
        asOf: meta?.timeMs ?? fetchedAt,
        fetchedAt,
        ...(meta ? {} : { asOfFetched: true as const }),
        proved: wire.proved,
        ...(proof ? { proof } : {}),
        ...(wire.node ? { node: wire.node } : {}),
        ...(meta ? { height: meta.height } : {}),
        data: wire.data,
      }
    },

    decode: async (kind, bytes, opts) => {
      const transport = await deps.transport()
      return transport.decode(kind, bytes, opts)
    },

    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

async function defaultTransport(): Promise<SdkTransport> {
  const mode = import.meta.env.VITE_SDK_TRANSPORT as string | undefined
  if (mode === 'inline') return (await import('./transport-inline')).createInlineTransport()
  return (await import('./transport-worker')).createWorkerTransport()
}

let transportFactory: () => Promise<SdkTransport> = defaultTransport

/** Fixture builds and tests replace the transport; production builds leave the worker. */
export function setSdkTransport(make: (() => Promise<SdkTransport>) | undefined): void {
  transportFactory = make ?? defaultTransport
  dropSharedTransport()
}

let shared: Promise<SdkTransport> | undefined
const sharedTransport = (): Promise<SdkTransport> => (shared ??= transportFactory())

function dropSharedTransport(): void {
  const old = shared
  shared = undefined
  void old?.then(
    (t) => t.dispose?.(),
    () => undefined,
  )
}

function noteRequests(net: NetworkId, requests: NodeUse[]): void {
  getDapiTransport().noteExternalRequests?.(net, requests)
}

export const sdk: SdkClient = createSdkClient({
  transport: sharedTransport,
  devnets: sdkDevnets,
  proofs: defaultProofStore,
  health: healthRegistry,
  dropTransport: dropSharedTransport,
  noteRequests,
  now: Date.now,
  whenIdle: idle,
})

registerSdkReadyProbe((net) => sdk.state(net) === 'ready')
