import type { QueryClient } from '@tanstack/query-core'
import { createDapiRpc, getDapiTransport, type DapiTransport } from '../dapi-core'
import { sleep, SharedStream, type StreamState } from '../dapi-core/streams'
import type { Sourced } from '../envelope'
import { healthRegistry } from '../health'
import { dapiKeys, viewKeys } from '../query'
import type { NetworkId } from '@/lib/network'
import { parseChainLock } from '@/lib/core/chainlock'
import { parseHeader } from '@/lib/core/header'
import { core } from './client'
import { coreDecoder } from './decode'
import type { DecodedIsLock, DecodedTx } from './types'

const POLL_MS = 30_000
const STREAM_RETRY_MS = 120_000
const SILENT_TX_MS = 60_000
const STALE_AFTER_MS = 20 * 60_000
const LAG_TICK_MS = 60_000

/**
 * `live`: the header stream is open. `reconnecting`: it dropped and is being reopened. `polling`: it failed three
 * times, so the tip is read every 30 s. `stopped`: nothing is reaching the page (IN-15 shows "live updates stopped").
 */
export type LiveState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'polling' | 'stopped'

export interface LiveStatus {
  state: LiveState
  /** When `state` last changed (ms epoch). */
  since: number
  /** The last header or ChainLock that arrived (ms epoch). */
  lastEventAt?: number
  node?: string
}

export type LiveTxEvent = { kind: 'tx'; tx: DecodedTx } | { kind: 'islock'; lock: DecodedIsLock }

export interface LiveTxStatus {
  state: 'idle' | 'connecting' | 'live' | 'reconnecting'
  /** The node sent nothing for 60 s while blocks kept arriving, or refused the filter: use Hyphen's `mempool_tx` stream. */
  fallbackHint: boolean
}

export interface CoreLiveDeps {
  transport: () => DapiTransport
  /** The one-shot tip read used to find where to start and while polling. */
  tip: (
    net: NetworkId,
    signal?: AbortSignal,
  ) => Promise<Sourced<{ height: number; hash: string; time: number }>>
  headerHash: (header: Uint8Array, net: NetworkId) => Promise<string>
  decodeTx: (bytes: Uint8Array, net: NetworkId) => Promise<DecodedTx>
  decodeIsLock: (bytes: Uint8Array) => Promise<DecodedIsLock>
  now: () => number
  health: Pick<typeof healthRegistry, 'setLag'>
}

const defaultDeps: CoreLiveDeps = {
  transport: getDapiTransport,
  tip: (net, signal) => core.tip(net, signal),
  headerHash: (header, net) => coreDecoder.headerHash(header, net),
  decodeTx: (bytes, net) => coreDecoder.tx(bytes, net),
  decodeIsLock: (bytes) => coreDecoder.isLock(bytes),
  now: Date.now,
  health: healthRegistry,
}

interface TipFollower {
  stream: SharedStream
  status: LiveStatus
  clients: Set<QueryClient>
  lastHeight?: number
  lastHeaderAt?: number
  lagTimer?: ReturnType<typeof setInterval>
  holders: number
}

interface TxFollower {
  stream: SharedStream
  status: LiveTxStatus
  listeners: Set<(event: LiveTxEvent) => void>
  lastMessageAt: number
}

/**
 * The live feeds (§4.6, §5.5). Nothing else opens a Core stream. Each feed is shared per network and reference
 * counted: the first `retain` opens it, the last release closes it after a 10 s linger.
 */
export function createCoreLive(deps: CoreLiveDeps = defaultDeps) {
  const tips = new Map<NetworkId, TipFollower>()
  const txs = new Map<NetworkId, TxFollower>()
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const cb of [...listeners]) cb()
  }
  const rpc = () => createDapiRpc(deps.transport())

  // ---- tip and ChainLock ----------------------------------------------------

  function setStatus(f: TipFollower, patch: Partial<LiveStatus>): void {
    const next: LiveStatus = { ...f.status, ...patch }
    if (patch.state !== undefined && patch.state !== f.status.state) next.since = deps.now()
    if (
      next.state === f.status.state &&
      next.lastEventAt === f.status.lastEventAt &&
      next.node === f.status.node
    ) {
      return
    }
    f.status = next
    emit()
  }

  function publishTip(
    net: NetworkId,
    f: TipFollower,
    tip: { height: number; hash: string; time: number },
    node?: string,
  ): void {
    const now = deps.now()
    f.lastHeight = Math.max(f.lastHeight ?? -1, tip.height)
    f.lastHeaderAt = now
    deps.health.setLag(net, 'dapi', undefined)
    const stamped: Sourced<typeof tip> = {
      source: 'dapi',
      asOf: now,
      fetchedAt: now,
      proved: false,
      height: tip.height,
      ...(node ? { node } : {}),
      data: tip,
    }
    for (const qc of f.clients) {
      qc.setQueryData(dapiKeys(net, 'tip'), stamped)
      void qc.invalidateQueries({ queryKey: viewKeys(net, 'latest-blocks') })
    }
    setStatus(f, { lastEventAt: now })
  }

  function publishChainLock(
    net: NetworkId,
    f: TipFollower,
    lock: { height: number; hash: string },
    node?: string,
  ): void {
    const now = deps.now()
    const stamped: Sourced<typeof lock> = {
      source: 'dapi',
      asOf: now,
      fetchedAt: now,
      proved: false,
      height: lock.height,
      ...(node ? { node } : {}),
      data: lock,
    }
    for (const qc of f.clients) qc.setQueryData(dapiKeys(net, 'chainlock'), stamped)
    setStatus(f, { lastEventAt: now })
  }

  async function pollOnce(net: NetworkId, f: TipFollower, signal: AbortSignal): Promise<boolean> {
    try {
      const tip = await deps.tip(net, signal)
      publishTip(net, f, tip.data, tip.node)
      setStatus(f, { state: 'polling' })
      return true
    } catch {
      if (!signal.aborted) setStatus(f, { state: 'stopped' })
      return false
    }
  }

  function startTip(net: NetworkId, f: TipFollower): SharedStream {
    return new SharedStream({
      onState(state: StreamState, detail) {
        if (state === 'connecting') setStatus(f, { state: 'connecting' })
        else if (state === 'live') setStatus(f, { state: 'live' })
        else if (state === 'reconnecting') {
          setStatus(f, { state: detail.failures > 0 ? 'reconnecting' : 'connecting' })
        } else if (state === 'idle') setStatus(f, { state: 'idle', node: undefined })
      },
      async degraded({ signal }) {
        const until = deps.now() + STREAM_RETRY_MS
        while (!signal.aborted && deps.now() < until) {
          await pollOnce(net, f, signal)
          await sleep(POLL_MS, signal)
        }
      },
      async session({ signal, avoidNode, markLive }) {
        // A reconnect resumes at the last height seen: the node resends that header, and nothing between is missed.
        const start = f.lastHeight ?? (await deps.tip(net, signal)).data.height
        const stream = rpc().headerStream(
          net,
          { fromHeight: start, count: 0 },
          { signal, avoidNode },
        )
        let next = start
        let live = false
        for await (const event of stream.events) {
          if (!live) {
            live = true
            markLive(stream.node)
            setStatus(f, { node: stream.node })
          }
          if (event.kind === 'chainLock') {
            publishChainLock(net, f, parseChainLock(event.chainLock), stream.node)
            continue
          }
          const parsed = event.headers.map(parseHeader)
          const last = event.headers.length - 1
          if (last < 0) continue
          const lastHeader = event.headers[last]!
          const hash = await deps.headerHash(lastHeader, net)
          next += event.headers.length
          publishTip(
            net,
            f,
            { height: next - 1, hash, time: parsed[last]!.time * 1000 },
            stream.node,
          )
        }
      },
    })
  }

  function follower(net: NetworkId): TipFollower {
    let f = tips.get(net)
    if (!f) {
      const created: TipFollower = {
        stream: undefined as never,
        status: { state: 'idle', since: deps.now() },
        clients: new Set(),
        holders: 0,
      }
      created.stream = startTip(net, created)
      tips.set(net, (f = created))
    }
    return f
  }

  // ---- transactions ---------------------------------------------------------

  function setTxStatus(f: TxFollower, patch: Partial<LiveTxStatus>): void {
    const next = { ...f.status, ...patch }
    if (next.state === f.status.state && next.fallbackHint === f.status.fallbackHint) return
    f.status = next
    emit()
  }

  function txFollower(net: NetworkId): TxFollower {
    const existing = txs.get(net)
    if (existing) return existing
    const created: TxFollower = {
      stream: undefined as never,
      status: { state: 'idle', fallbackHint: false },
      listeners: new Set(),
      lastMessageAt: deps.now(),
    }
    created.stream = new SharedStream({
      onState(state, detail) {
        if (state === 'live') setTxStatus(created, { state: 'live' })
        else if (state === 'idle') setTxStatus(created, { state: 'idle', fallbackHint: false })
        else if (state === 'connecting') setTxStatus(created, { state: 'connecting' })
        else setTxStatus(created, { state: 'reconnecting', fallbackHint: detail.failures >= 3 })
      },
      async session({ signal, avoidNode, markLive }) {
        const tip = await deps.tip(net, signal)
        const stream = rpc().transactionStream(
          net,
          { fromHeight: tip.data.height },
          { signal, avoidNode },
        )
        const watchdog = setInterval(() => {
          const tipAt = tips.get(net)?.lastHeaderAt ?? 0
          const silent =
            deps.now() - created.lastMessageAt > SILENT_TX_MS && tipAt > created.lastMessageAt
          setTxStatus(created, { fallbackHint: silent })
        }, SILENT_TX_MS / 4)
        ;(watchdog as { unref?: () => void }).unref?.()
        let live = false
        try {
          for await (const event of stream.events) {
            if (!live) {
              live = true
              markLive(stream.node)
            }
            created.lastMessageAt = deps.now()
            setTxStatus(created, { fallbackHint: false })
            if (event.kind === 'transactions') {
              for (const raw of event.transactions) {
                const tx = await deps.decodeTx(raw, net)
                for (const l of [...created.listeners]) l({ kind: 'tx', tx })
              }
            } else if (event.kind === 'instantSendLocks') {
              for (const raw of event.messages) {
                const lock = await deps.decodeIsLock(raw)
                for (const l of [...created.listeners]) l({ kind: 'islock', lock })
              }
            }
          }
        } finally {
          clearInterval(watchdog)
        }
      },
    })
    txs.set(net, created)
    return created
  }

  return {
    /**
     * Follows the tip and ChainLock of `net` and writes them into `queryClient`'s `[net,'dapi','tip']` and
     * `[net,'dapi','chainlock']`; invalidates `[net,'view','latest-blocks']` on every header. The shell mounts it on
     * every page. Returns the release function.
     */
    tip(net: NetworkId, queryClient: QueryClient): () => void {
      const f = follower(net)
      f.clients.add(queryClient)
      f.holders++
      const releaseStream = f.stream.retain()
      if (f.lagTimer === undefined) {
        f.lagTimer = setInterval(() => {
          const at = f.lastHeaderAt
          if (at === undefined) return
          const ms = deps.now() - at
          if (ms > STALE_AFTER_MS) {
            deps.health.setLag(net, 'dapi', {
              ms,
              detail: `last block header ${Math.floor(ms / 60_000)} minutes ago`,
            })
          }
        }, LAG_TICK_MS)
        ;(f.lagTimer as { unref?: () => void }).unref?.()
      }
      let released = false
      return () => {
        if (released) return
        released = true
        releaseStream()
        f.holders--
        if (f.holders === 0) {
          clearInterval(f.lagTimer)
          f.lagTimer = undefined
          f.clients.delete(queryClient)
        }
      }
    },

    status(net: NetworkId): LiveStatus {
      return tips.get(net)?.status ?? IDLE
    },

    /** Every transaction and InstantSend lock the node sees, decoded (IN-01 live feed). Returns the unsubscribe function. */
    transactions(net: NetworkId, listener: (event: LiveTxEvent) => void): () => void {
      const f = txFollower(net)
      f.listeners.add(listener)
      const release = f.stream.retain()
      return () => {
        f.listeners.delete(listener)
        release()
      }
    },

    txStatus(net: NetworkId): LiveTxStatus {
      return txs.get(net)?.status ?? IDLE_TX
    },

    subscribe(cb: () => void): () => void {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

const IDLE: LiveStatus = { state: 'idle', since: 0 }
const IDLE_TX: LiveTxStatus = { state: 'idle', fallbackHint: false }

export const coreLive = createCoreLive()

export function isLiveStopped(status: LiveStatus): boolean {
  return status.state === 'stopped'
}
