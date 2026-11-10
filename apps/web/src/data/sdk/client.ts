import { isDevnet, type DevnetConfig, type NetworkId } from '@/lib/network'
import { SourceError } from '../errors'
import { healthRegistry } from '../health'
import type { ProofMeta, Sourced } from '../envelope'
import { registerSdkReadyProbe } from '../query/loader'
import type {
  SdkMethodName,
  SdkMethods,
  SdkNetworkConfig,
  SdkWorkerApi,
  WireError,
} from './methods'
import { sdkDevnets } from './devnets'
import { sdkConfigFor } from './networks'
import { proofStore as defaultProofStore, type ProofStore } from './proof-store'

export type SdkState = 'cold' | 'loading' | 'ready' | 'failed'

/** What the client needs from the worker (or its in-thread or fixture stand-ins). */
export type SdkTransport = SdkWorkerApi

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
  now: () => number
  /** Runs `fn` when the browser is idle, so warm-up never competes with the page. */
  whenIdle: (fn: () => void) => void
}

const RETRY_CONNECT_AFTER_MS = 5_000

const idle = (fn: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
  if (ric) ric(fn)
  else setTimeout(fn, 1)
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

function toSourceError(error: WireError['error']): SourceError {
  return new SourceError({
    source: 'sdk',
    kind: error.kind,
    message: error.message,
  })
}

function aborted(): SourceError {
  return new SourceError({ source: 'sdk', kind: 'aborted', message: 'The request was aborted' })
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
      const info = await transport.connect(configFor(net))
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
      if (signal?.aborted) throw aborted()
      const transport = await ensure(net)
      if (signal?.aborted) throw aborted()
      const wire = await transport.call(net, method, args)
      // A wasm call can't be cancelled; its late answer is dropped here.
      if (signal?.aborted) throw aborted()
      if (!wire.ok) {
        const error = toSourceError(wire.error)
        deps.health.report(net, 'sdk', { ok: false, kind: error.kind, message: error.message })
        throw error
      }
      deps.health.report(net, 'sdk', { ok: true, latencyMs: wire.tookMs })
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
          quorumHash: hex(wire.proof.quorumHash),
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

    decode: async (kind, bytes) => {
      const transport = await deps.transport()
      return transport.decode(kind, bytes)
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
  shared = undefined
}

let shared: Promise<SdkTransport> | undefined
const sharedTransport = (): Promise<SdkTransport> => (shared ??= transportFactory())

export const sdk: SdkClient = createSdkClient({
  transport: sharedTransport,
  devnets: sdkDevnets,
  proofs: defaultProofStore,
  health: healthRegistry,
  now: Date.now,
  whenIdle: idle,
})

registerSdkReadyProbe((net) => sdk.state(net) === 'ready')
