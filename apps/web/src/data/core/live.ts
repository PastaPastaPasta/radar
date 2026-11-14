import { plural } from '@lingui/core/macro'
import type { QueryClient } from '@tanstack/query-core'
import { createDapiRpc, getDapiTransport, type DapiTransport } from '../dapi-core'
import { DEGRADE_AFTER_FAILURES, sleep, SharedStream, type StreamState } from '../dapi-core/streams'
import type { Sourced } from '../envelope'
import { healthRegistry } from '../health'
import { dapiKeys, viewKeys } from '../query'
import { onNetworkReset } from '../query/network-cache'
import { staleAfterMs } from '../query/stale'
import { isDevnet, type NetworkId } from '@/lib/network'
import { parseChainLock } from '@/lib/core/chainlock'
import { parseHeader } from '@/lib/core/header'
import { bytesToHex } from '@/lib/hex'
import { core } from './client'
import { coreDecoder } from './decode'
import type { CoreChainLock, CoreClientHooks, DecodedIsLock, DecodedTx } from './types'

const POLL_MS = 30_000
const STREAM_RETRY_MS = 120_000
/** Once the transaction stream has failed repeatedly its watchers read Hyphen instead, so a reopen costs little to wait for. */
const TX_STREAM_RETRY_MS = 5 * 60_000
const SILENT_TX_MS = 60_000
const STALE_AFTER_MS = 20 * 60_000
const LAG_TICK_MS = 60_000
/** Blocks come every 2.5 minutes on average; a connection silent for this long has died without telling anyone. */
const IDLE_ABORT_MS = 6 * 60_000

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

/**
 * `tx`: a transaction the node took into its mempool. `block`: a new block was mined, with the ids of its transactions,
 * so whatever was pending among them is confirmed now.
 */
export type LiveTxEvent =
  | { kind: 'tx'; tx: DecodedTx }
  | { kind: 'islock'; lock: DecodedIsLock }
  | { kind: 'block'; txids: string[] }

export interface LiveTxStatus {
  state: 'idle' | 'connecting' | 'live' | 'reconnecting'
  /** The node sent nothing for 60 s while blocks kept arriving, or the stream failed three times in a row: use Hyphen. */
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
  /** Told of every tip and ChainLock the stream delivers, so the client does not ask for them again. */
  observe?: Pick<CoreClientHooks, 'observeTip' | 'observeChainLock'>
}

const defaultDeps: CoreLiveDeps = {
  transport: getDapiTransport,
  tip: (net, signal) => core.tip(net, signal),
  headerHash: (header, net) => coreDecoder.headerHash(header, net),
  decodeTx: (bytes, net) => coreDecoder.tx(bytes, net),
  decodeIsLock: (bytes) => coreDecoder.isLock(bytes),
  now: Date.now,
  health: healthRegistry,
  observe: core,
}

function stamp<T extends { height: number }>(data: T, now: number, node?: string): Sourced<T> {
  return {
    source: 'dapi',
    asOf: now,
    fetchedAt: now,
    proved: false,
    height: data.height,
    // A pushed tip is as fresh as the last block; judge its age like a polled tip, not by the default.
    staleAfterMs: staleAfterMs('tip'),
    ...(node ? { node } : {}),
    data,
  }
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
    deps.observe?.observeTip(net, tip)
    const stamped = stamp(tip, now, node)
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
    const corroborated = deps.observe?.observeChainLock(net, lock, node) === true
    const stamped = stamp<CoreChainLock>(
      corroborated ? lock : { ...lock, claim: 'one-node' },
      now,
      node,
    )
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
        const own = new AbortController()
        const onAbort = () => own.abort()
        signal.addEventListener('abort', onAbort, { once: true })
        let idle: ReturnType<typeof setTimeout> | undefined
        const rearm = () => {
          clearTimeout(idle)
          idle = setTimeout(() => own.abort(), IDLE_ABORT_MS)
          ;(idle as { unref?: () => void }).unref?.()
        }
        const stream = rpc().headerStream(
          net,
          { fromHeight: start, count: 0 },
          { signal: own.signal, avoidNode },
        )
        let next = start
        let live = false
        // A devnet can go hours between blocks; only a network with a steady rhythm can tell a dead connection from a quiet one.
        const watch = !isDevnet(net)
        if (watch) rearm()
        try {
          for await (const event of stream.events) {
            if (watch) rearm()
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
        } finally {
          clearTimeout(idle)
          signal.removeEventListener('abort', onAbort)
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
        else
          setTxStatus(created, {
            state: 'reconnecting',
            fallbackHint: detail.failures >= DEGRADE_AFTER_FAILURES,
          })
      },
      async degraded({ signal }) {
        await sleep(TX_STREAM_RETRY_MS, signal)
      },
      async session({ signal, avoidNode, markLive }) {
        const emit = (event: LiveTxEvent) => {
          for (const l of [...created.listeners]) l(event)
        }
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
        // The node starts by replaying the tip block (its transactions, then its merkle block) before the mempool;
        // those transactions are already mined, so they are held back until that first merkle block names them.
        let replay: DecodedTx[] | undefined = []
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
                if (replay) replay.push(tx)
                else emit({ kind: 'tx', tx })
              }
            } else if (event.kind === 'instantSendLocks') {
              for (const raw of event.messages) {
                const lock = await deps.decodeIsLock(raw)
                emit({ kind: 'islock', lock })
              }
            } else {
              const txids = merkleBlockTxids(event.block)
              if (replay) {
                const mined = new Set(txids)
                const held = replay
                replay = undefined
                for (const tx of held) if (!mined.has(tx.txid)) emit({ kind: 'tx', tx })
              } else {
                emit({ kind: 'block', txids })
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
              detail: plural(Math.floor(ms / 60_000), {
                one: 'last block header # minute ago',
                other: 'last block header # minutes ago',
              }),
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

    /**
     * Every transaction and InstantSend lock that reaches the node's mempool from now on, decoded, and each new block
     * with its transaction ids (IN-01 live feed, IN-06). Returns the unsubscribe function.
     */
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

    /** Forgets where the tip stream resumes for a network, after the network has been reset. */
    forget(net: NetworkId): void {
      const f = tips.get(net)
      if (f) {
        f.lastHeight = undefined
        f.lastHeaderAt = undefined
      }
    },
  }
}

/**
 * The transaction ids a merkle block marks as matched (BIP 37 partial merkle tree), in block order. Under the match-all
 * filter that is every transaction of the block. The tree is read, not checked against the header's merkle root.
 */
export function merkleBlockTxids(block: Uint8Array): string[] {
  let at = 80
  const u32 = () => {
    const v = new DataView(block.buffer, block.byteOffset + at, 4).getUint32(0, true)
    at += 4
    return v
  }
  const varint = () => {
    const first = block[at++]!
    if (first < 0xfd) return first
    if (first === 0xfd) {
      const v = block[at]! | (block[at + 1]! << 8)
      at += 2
      return v
    }
    return u32()
  }
  const total = u32()
  const hashes: string[] = []
  for (let n = varint(); n > 0; n--) {
    hashes.push(bytesToHex(block.slice(at, at + 32).reverse()))
    at += 32
  }
  const flags = block.subarray(at + 1, at + 1 + block[at]!)
  if (total === 0) return []
  const width = (height: number) => Math.ceil(total / 2 ** height)
  let height = 0
  while (width(height) > 1) height++
  let bit = 0
  let next = 0
  const matched: string[] = []
  const walk = (h: number, pos: number) => {
    const flag = ((flags[bit >> 3] ?? 0) >> (bit & 7)) & 1
    bit++
    if (h === 0 || !flag) {
      const hash = hashes[next++]
      if (h === 0 && flag && hash) matched.push(hash)
      return
    }
    walk(h - 1, pos * 2)
    if (pos * 2 + 1 < width(h - 1)) walk(h - 1, pos * 2 + 1)
  }
  walk(height, 0)
  return matched
}

const IDLE: LiveStatus = { state: 'idle', since: 0 }
const IDLE_TX: LiveTxStatus = { state: 'idle', fallbackHint: false }

export const coreLive = createCoreLive()
onNetworkReset((net) => coreLive.forget(net))
