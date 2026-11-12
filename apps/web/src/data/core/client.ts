import {
  createDapiRpc,
  getDapiTransport,
  loadCoreCache,
  GRPC_INVALID_ARGUMENT,
  GRPC_NOT_FOUND,
  type DapiCallOptions,
  type DapiTransport,
} from '../dapi-core'
import type { DapiRpc } from '../dapi-core'
import type { CoreCache } from '../dapi-core/cache'
import { stampOf, type FallbackReason, type Sourced } from '../envelope'
import { abortedError, isSourceError, SourceError } from '../errors'
import { healthRegistry } from '../health'
import { hyphen } from '../hyphen/client'
import type { HyBlockSummary } from '../hyphen/schemas'
import { onNetworkReset } from '../query/network-cache'
import type { NetworkId } from '@/lib/network'
import { isDevnet } from '@/lib/network'
import { bytesToHex, hexToBytes, isHex } from '@/lib/hex'
import { parseChainLock } from '@/lib/core/chainlock'
import { parseHeader } from '@/lib/core/header'
import { poolOfCoinbase } from '@/lib/core/pools'
import { merkleRootOf, meetsProofOfWork, txidOfBytes } from '@/lib/core/verify'
import { NO_HEIGHT } from './convert'
import { coreDecoder, type createCoreDecoder } from './decode'
import type {
  BlockRef,
  BlockRow,
  CoreCallOptions,
  CoreChainLock,
  CoreChainStatus,
  CoreClient,
  CoreClientHooks,
  DapiNodeStatus,
  DecodedBlock,
  DecodedTx,
  HeaderInfo,
  PrevOut,
} from './types'

const MAX_HEADERS = 2000
const HEADER_WINDOW = 500
/** A window after the first probe only has to cover what interpolating between two known times leaves. */
const SEARCH_WINDOW = 128
const FIRST_WINDOW_MIN = 96
const FALLBACK_HOLD_MS = 120_000
const CHAIN_LOCK_REFRESH_MS = 10_000
const CHAIN_LOCK_LOOKUP_MS = 12_000
const TIP_MEMO_MS = 30_000
const ROW_CONCURRENCY = 4
/** Answers that fail their checks are asked for again from other nodes, this many times in all. */
const VERIFY_ATTEMPTS = 3
/** A block this far below Hyphen's own tip is final whatever its tags say. */
const HYPHEN_FINAL_DEPTH = 24
const AVERAGE_BLOCK_MS: Record<'mainnet' | 'testnet', number> = {
  mainnet: 157_000,
  testnet: 140_000,
}

/**
 * Headers to read for the first probe of a time search, `back` blocks below the tip. The average block time is off by
 * about the square root of the distance plus 1 % of it; the window covers four times that, so the first read usually holds
 * the answer without moving 40 kB for a day that is a few hundred blocks away.
 */
export function firstWindow(back: number): number {
  const spread = Math.sqrt(Math.max(0, back)) + 0.01 * Math.max(0, back)
  return Math.min(HEADER_WINDOW, Math.max(FIRST_WINDOW_MIN, Math.ceil(4 * spread)))
}

type Decoder = ReturnType<typeof createCoreDecoder>

export interface CoreDeps {
  /** Read on every call, so a transport installed after the client was made takes effect. */
  transport: () => DapiTransport
  decoder: Decoder
  hyphen: Pick<
    typeof hyphen,
    'status' | 'blocks' | 'blocksFrom' | 'block' | 'rawBlock' | 'tx' | 'rawTx'
  >
  health: Pick<typeof healthRegistry, 'get'>
  now: () => number
  /** Where immutable answers are kept between visits. Resolves nothing when the build has no cache. */
  cache?: () => Promise<CoreCache | undefined>
}

const defaultDeps: CoreDeps = {
  transport: getDapiTransport,
  decoder: coreDecoder,
  hyphen,
  health: healthRegistry,
  now: Date.now,
  cache: loadCoreCache,
}

const reversed = (bytes: Uint8Array) => bytesToHex(Uint8Array.from(bytes).reverse())

function isNotFound(e: unknown): boolean {
  return (
    isSourceError(e) &&
    e.source === 'dapi' &&
    e.kind === 'http' &&
    (e.status === GRPC_NOT_FOUND || e.status === GRPC_INVALID_ARGUMENT)
  )
}

function invalid(message: string, node?: string): SourceError {
  return new SourceError({ source: 'dapi', kind: 'invalid-response', message, node })
}

const isInvalid = (e: unknown): boolean => isSourceError(e) && e.kind === 'invalid-response'

const isAborted = (e: unknown): boolean => isSourceError(e) && e.kind === 'aborted'

const abortError = () => abortedError('dapi')

/** Resolves with `p`, or rejects as soon as `signal` fires; `p` itself keeps running for its other callers. */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/**
 * Runs `run` over `items`, `limit` at a time. After the first failure nothing more is started, the calls in flight
 * are aborted, and that failure is thrown.
 */
async function limited<T, R>(
  items: T[],
  limit: number,
  run: (item: T, signal: AbortSignal) => Promise<R>,
  outer?: AbortSignal,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  const ctrl = new AbortController()
  const onOuter = () => ctrl.abort(outer?.reason)
  if (outer?.aborted) ctrl.abort(outer.reason)
  else outer?.addEventListener('abort', onOuter, { once: true })
  let next = 0
  let failure: { error: unknown } | undefined
  const worker = async () => {
    while (!failure && next < items.length) {
      const i = next++
      try {
        out[i] = await run(items[i]!, ctrl.signal)
      } catch (error) {
        failure ??= { error }
        ctrl.abort()
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  outer?.removeEventListener('abort', onOuter)
  if (failure) throw failure.error
  return out
}

export function createCoreClient(deps: CoreDeps = defaultDeps): CoreClient & CoreClientHooks {
  const { decoder } = deps
  const getCache = deps.cache ?? (() => Promise.resolve(undefined))
  const rpcs = new WeakMap<DapiTransport, DapiRpc>()
  const rpc = (): DapiRpc => {
    const transport = deps.transport()
    let r = rpcs.get(transport)
    if (!r) rpcs.set(transport, (r = createDapiRpc(transport)))
    return r
  }

  function dapi<T>(
    data: T,
    extra: { node?: string; height?: number; immutable?: boolean } = {},
  ): Sourced<T> {
    const now = deps.now()
    return {
      source: 'dapi',
      asOf: now,
      fetchedAt: now,
      proved: false,
      ...(extra.immutable ? { immutable: true as const } : {}),
      ...(extra.node ? { node: extra.node } : {}),
      ...(extra.height !== undefined ? { height: extra.height } : {}),
      data,
    }
  }

  function fromHyphen<T>(
    s: Sourced<unknown>,
    data: T,
    fallback: FallbackReason | undefined,
    extra: { height?: number; immutable?: boolean } = {},
  ): Sourced<T> {
    return {
      ...stampOf(s),
      ...(extra.height !== undefined ? { height: extra.height } : {}),
      ...(extra.immutable ? { immutable: true as const } : {}),
      ...(fallback ? { fallback } : {}),
      data,
    }
  }

  /** Rule 3: Hyphen serves only while its index is current, and only on networks it covers. */
  function hyphenFit(net: NetworkId, opts: { unknownIsFit: boolean } = { unknownIsFit: true }) {
    if (isDevnet(net)) return false
    const state = deps.health.get(net, 'hyphen').state
    if (state === 'unknown') return opts.unknownIsFit
    return state !== 'stale' && state !== 'down'
  }

  const hyphenStandsIn = (net: NetworkId) =>
    deps.health.get(net, 'dapi').state === 'down' && hyphenFit(net)

  // ---- what the nodes say about ChainLocks ---------------------------------
  //
  // A ChainLock is a claim until its BLS signature is checked. Each source's highest claim is kept; a height counts as
  // locked only when two independent sources (two nodes, or a node and Hyphen) both report a lock at or above it.

  interface Claim {
    height: number
    hash: string
  }
  const claims = new Map<NetworkId, Map<string, Claim>>()
  const lockRefreshedAt = new Map<NetworkId, number>()
  const lockFlights = new Map<NetworkId, Promise<void>>()

  function claimLock(net: NetworkId, claimant: string, cl: Claim): void {
    let byClaimant = claims.get(net)
    if (!byClaimant) claims.set(net, (byClaimant = new Map<string, Claim>()))
    const known = byClaimant.get(claimant)
    if (!known || cl.height >= known.height) byClaimant.set(claimant, cl)
  }

  /** `claimed`: the highest height any one source reports. `corroborated`: the highest a second source also reaches. */
  function lockView(net: NetworkId): { claimed: number; corroborated: number } {
    const heights = [...(claims.get(net)?.values() ?? [])]
      .map((c) => c.height)
      .sort((a, b) => b - a)
    return { claimed: heights[0] ?? -1, corroborated: heights[1] ?? -1 }
  }

  /** The tip as the client last saw it, so a second read of it in the same half minute costs nothing. */
  const tipMemo = new Map<NetworkId, { height: number; hash: string; time: number; at: number }>()
  const seenTips = new Map<NetworkId, number>()
  function rememberTip(
    net: NetworkId,
    tip: { height: number; hash?: string; time?: number },
  ): void {
    if (tip.height > (seenTips.get(net) ?? -1)) seenTips.set(net, tip.height)
    if (tip.hash !== undefined && tip.time !== undefined) {
      tipMemo.set(net, { height: tip.height, hash: tip.hash, time: tip.time, at: deps.now() })
    }
  }

  async function fetchLockFrom(
    net: NetworkId,
    signal: AbortSignal | undefined,
    avoid: string[] = [],
    priority?: CoreCallOptions['priority'],
  ): Promise<{ lock: Claim; node?: string }> {
    const abort = new AbortController()
    const onAbort = () => abort.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    // A header range reports the best ChainLock before its headers; asking for one header near genesis keeps the reply small.
    const stream = rpc().headerStream(
      net,
      { fromHeight: 1, count: 1 },
      { signal: abort.signal, avoidNodes: avoid, priority },
    )
    try {
      for await (const event of stream.events) {
        if (event.kind === 'chainLock') {
          const lock = parseChainLock(event.chainLock)
          claimLock(net, stream.node ?? 'unknown', lock)
          return { lock, node: stream.node }
        }
      }
    } catch (e) {
      // Our own abort after the lock arrived is not an error.
      if (!(isAborted(e) && !signal?.aborted)) throw e
    } finally {
      abort.abort()
      signal?.removeEventListener('abort', onAbort)
    }
    throw invalid('DAPI sent no ChainLock', stream.node)
  }

  /**
   * Asks two different nodes for their best ChainLock, at most every 10 s. The lookup is shared by every caller and
   * has its own deadline, so one caller leaving does not fail the rest.
   */
  function refreshLocks(
    net: NetworkId,
    signal?: AbortSignal,
    priority?: CoreCallOptions['priority'],
  ): Promise<void> {
    if (deps.now() - (lockRefreshedAt.get(net) ?? -Infinity) < CHAIN_LOCK_REFRESH_MS) {
      return Promise.resolve()
    }
    let flight = lockFlights.get(net)
    if (!flight) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), CHAIN_LOCK_LOOKUP_MS)
      flight = (async () => {
        try {
          const first = await fetchLockFrom(net, ctrl.signal, [], priority)
          await fetchLockFrom(net, ctrl.signal, first.node ? [first.node] : [], priority)
          lockRefreshedAt.set(net, deps.now())
        } catch {
          // A failed lookup is retried in a few seconds, not on every page.
          lockRefreshedAt.set(net, deps.now() - CHAIN_LOCK_REFRESH_MS + 3_000)
        }
      })().finally(() => {
        clearTimeout(timer)
        lockFlights.delete(net)
      })
      lockFlights.set(net, flight)
    }
    return raceAbort(flight, signal)
  }

  type LockStatus = 'locked' | 'claimed' | 'none'
  const statusAt = (net: NetworkId, height: number): LockStatus => {
    const v = lockView(net)
    return v.corroborated >= height ? 'locked' : v.claimed >= height ? 'claimed' : 'none'
  }

  async function lockStatus(
    net: NetworkId,
    height: number,
    signal?: AbortSignal,
    priority?: CoreCallOptions['priority'],
  ): Promise<LockStatus> {
    if (lockView(net).corroborated < height) await refreshLocks(net, signal, priority)
    return statusAt(net, height)
  }

  /** The lock status, or what is already known when the lookup fails; only the caller leaving is an error. */
  async function lockStatusOrKnown(
    net: NetworkId,
    height: number,
    signal?: AbortSignal,
    priority?: CoreCallOptions['priority'],
  ): Promise<LockStatus> {
    try {
      return await lockStatus(net, height, signal, priority)
    } catch (e) {
      if (isAborted(e)) throw e
      return statusAt(net, height)
    }
  }

  const lockFields = (status: LockStatus) => ({
    chainLocked: status === 'locked',
    ...(status === 'claimed' ? { chainLockClaim: 'one-node' as const } : {}),
  })

  /**
   * The lock flags for a block Hyphen served. Hyphen's own lock tag is one source's claim, so it reads as locked only
   * once a second source agrees; a block deep under Hyphen's index with no claim at all is final by depth.
   */
  function hyphenLockFields(net: NetworkId, height: number, indexedTo: number | undefined) {
    const status = statusAt(net, height)
    const deep = indexedTo !== undefined && indexedTo - height >= HYPHEN_FINAL_DEPTH
    return lockFields(status === 'none' && deep ? 'locked' : status)
  }

  // ---- answers are checked before anything is shown or kept -----------------

  /**
   * Asks, checks, and on an answer that fails its check rests that node and asks another, up to three times. A
   * not-found answer is the chain's answer and passes straight through.
   */
  async function verified<A, V>(
    net: NetworkId,
    ask: (avoid: string[]) => Promise<{ message: A; node?: string }>,
    check: (message: A, node?: string) => Promise<V> | V,
    avoid: string[] = [],
  ): Promise<{ value: V; node?: string }> {
    let last: unknown
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
      const answered = await ask(avoid)
      try {
        return { value: await check(answered.message, answered.node), node: answered.node }
      } catch (e) {
        if (!isInvalid(e)) throw e
        last = e
        if (answered.node) {
          avoid = [...avoid, answered.node]
          deps.transport().reportInvalid?.(net, answered.node, (e as Error).message)
        }
      }
    }
    throw last
  }

  const powLimited = (net: NetworkId) => !isDevnet(net)

  function checkBlock(net: NetworkId, block: DecodedBlock, ref: BlockRef, node?: string): void {
    if ('hash' in ref && block.hash !== ref.hash.toLowerCase()) {
      throw invalid(`Asked DAPI for block ${ref.hash} and got block ${block.hash}`, node)
    }
    if ('height' in ref && block.height !== ref.height) {
      throw invalid(`Asked DAPI for block ${ref.height} and got block ${block.height}`, node)
    }
    if (!meetsProofOfWork(block.hash, parseInt(block.bits, 16), { limit: powLimited(net) })) {
      throw invalid('The block does not meet its own proof of work', node)
    }
    const merkle = merkleRootOf(block.txs.map((t) => t.txid))
    if (block.txs.length === 0 || merkle.mutated || merkle.root !== block.merkleRoot) {
      throw invalid('The block’s transactions do not hash to its merkle root', node)
    }
  }

  async function decodeBlockFor(
    net: NetworkId,
    bytes: Uint8Array,
    ref: BlockRef,
    signal?: AbortSignal,
  ): Promise<DecodedBlock> {
    const expect = 'height' in ref ? ref.height : undefined
    try {
      return await decoder.block(bytes, net, expect)
    } catch (e) {
      // Early blocks carry no height; Hyphen knows it, and the check on the hash below still binds it to the answer.
      const noHeight = (e as { cause?: Error }).cause?.message === NO_HEIGHT
      if (!('hash' in ref) || !noHeight || !hyphenFit(net)) throw e
      const known = await deps.hyphen.block(net, ref.hash.toLowerCase(), signal).catch(() => null)
      if (!known?.data) throw e
      return decoder.block(bytes, net, known.data.blockHeight)
    }
  }

  async function fetchVerifiedBlock(
    net: NetworkId,
    ref: BlockRef,
    o: { signal?: AbortSignal; priority?: CoreCallOptions['priority'] },
  ): Promise<{ block: DecodedBlock; bytes: Uint8Array; node?: string } | null> {
    let avoid: string[] = []
    for (let again = 0; ; again++) {
      try {
        const r = await verified(
          net,
          (avoidNodes) =>
            rpc().block(net, 'hash' in ref ? { hash: ref.hash.toLowerCase() } : ref, {
              signal: o.signal,
              priority: o.priority,
              avoidNodes,
            }),
          async (message, node) => {
            const bytes = message.block
            const block = await decodeBlockFor(net, bytes, ref, o.signal)
            checkBlock(net, block, ref, node)
            return { block, bytes }
          },
          avoid,
        )
        return { ...r.value, node: r.node }
      } catch (e) {
        if (!isNotFound(e)) throw e
        // A node a block behind answers "no such height" for the block that was just mined: ask one more node.
        if ('hash' in ref || again > 0) return null
        const said = (e as SourceError).node
        avoid = said ? [said] : []
      }
    }
  }

  // ---- headers ------------------------------------------------------------

  /** Hashes every header, checks they chain and meet their proof of work: what makes them safe to keep. */
  async function headersHold(
    net: NetworkId,
    raw: Uint8Array[],
    fromHeight: number,
    hashes: string[],
  ): Promise<boolean> {
    const all = await Promise.all(raw.map((h) => decoder.headerHash(h, net)))
    return raw.every((h, i) => {
      const parsed = parseHeader(h)
      const next = raw[i + 1]
      return (
        all[i] === hashes[i] &&
        (!next || parseHeader(next).prevHash === all[i]) &&
        meetsProofOfWork(all[i]!, parsed.bits, { limit: powLimited(net) }) &&
        fromHeight + i >= 0
      )
    })
  }

  async function readHeaders(
    net: NetworkId,
    fromHeight: number,
    count: number,
    signal?: AbortSignal,
    opts: { prefer?: string; priority?: CoreCallOptions['priority'] } = {},
  ): Promise<{ headers: HeaderInfo[]; node?: string }> {
    if (count < 1 || count > MAX_HEADERS) {
      throw new RangeError(`Ask for 1 to ${MAX_HEADERS} headers at a time`)
    }
    const cache = await getCache()
    const cached = await cache?.getHeaders(net, fromHeight, count)
    if (cached) {
      return {
        headers: cached.map((h) => ({
          height: h.height,
          hash: h.hash,
          time: parseHeader(h.header).time * 1000,
        })),
      }
    }
    const avoid: string[] = []
    for (let attempt = 0; ; attempt++) {
      const stream = rpc().headerStream(
        net,
        { fromHeight, count },
        {
          signal,
          avoidNodes: avoid,
          prefer: attempt === 0 ? opts.prefer : undefined,
          priority: opts.priority,
        },
      )
      try {
        const raw: Uint8Array[] = []
        for await (const event of stream.events) {
          if (event.kind === 'chainLock') {
            claimLock(net, stream.node ?? 'unknown', parseChainLock(event.chainLock))
          } else raw.push(...event.headers)
        }
        const parsed = raw.map(parseHeader)
        const hashes: string[] = []
        for (let i = 0; i < raw.length; i++) {
          const next = parsed[i + 1]
          hashes.push(next ? next.prevHash : await decoder.headerHash(raw[i]!, net))
        }
        const last = parsed.at(-1)
        if (last && !meetsProofOfWork(hashes.at(-1)!, last.bits, { limit: powLimited(net) })) {
          throw invalid('A block header does not meet its own proof of work', stream.node)
        }
        const headers: HeaderInfo[] = raw.map((_, i) => ({
          height: fromHeight + i,
          hash: hashes[i]!,
          time: parsed[i]!.time * 1000,
        }))
        if (cache) void keepHeaders(net, cache, raw, fromHeight, hashes)
        return { headers, node: stream.node }
      } catch (e) {
        if (isInvalid(e) && stream.node) {
          deps.transport().reportInvalid?.(net, stream.node, (e as Error).message)
        }
        const again =
          (isInvalid(e) || (isSourceError(e) && (e.kind === 'timeout' || e.kind === 'network'))) &&
          !signal?.aborted
        if (!again || !stream.node || attempt >= VERIFY_ATTEMPTS - 1) throw e
        avoid.push(stream.node)
      }
    }
  }

  /** Headers go to disk only when they hold up on their own and sit at or below a ChainLock two sources report. */
  async function keepHeaders(
    net: NetworkId,
    cache: CoreCache,
    raw: Uint8Array[],
    fromHeight: number,
    hashes: string[],
  ): Promise<void> {
    const upTo = lockView(net).corroborated
    const n = Math.min(raw.length, upTo - fromHeight + 1)
    if (n < 1) return
    try {
      if (!(await headersHold(net, raw.slice(0, n), fromHeight, hashes.slice(0, n)))) return
      await cache.putHeaders(
        net,
        raw.slice(0, n).map((header, i) => ({ height: fromHeight + i, hash: hashes[i]!, header })),
      )
    } catch {
      // The cache is an optimisation.
    }
  }

  // ---- raw transactions ---------------------------------------------------

  interface RawTx {
    tx: DecodedTx
    blockHash?: string
    height?: number
    time?: number
    confirmations?: number
    isInstantLocked: boolean
    lock: LockStatus
    node?: string
  }

  async function dapiTx(
    net: NetworkId,
    txid: string,
    o: { signal?: AbortSignal; priority?: CoreCallOptions['priority']; placement: boolean },
  ): Promise<RawTx | null> {
    const cache = await getCache()
    if (!o.placement) {
      const hit = await cache?.getTx(net, txid)
      if (hit) {
        return { tx: await decoder.tx(hit.bytes, net), isInstantLocked: false, lock: 'none' }
      }
    }
    let result
    try {
      result = await verified(
        net,
        (avoidNodes) =>
          rpc().transaction(net, txid, { signal: o.signal, priority: o.priority, avoidNodes }),
        async (m, node) => {
          if (txidOfBytes(m.transaction) !== txid) {
            throw invalid(`Asked DAPI for transaction ${txid} and got a different one`, node)
          }
          const tx = await decoder.tx(m.transaction, net)
          if (tx.txid !== txid) throw invalid('The transaction does not decode to its own id', node)
          const mined = m.height > 0 && m.blockHash.length === 32
          let time: number | undefined
          if (mined && o.placement) {
            // The block it says it is in must exist, at that height, with real proof of work.
            const header = await readHeaders(net, m.height, 1, o.signal, {
              prefer: node,
              priority: o.priority,
            }).then(
              (r) => r.headers[0],
              (e: unknown) => {
                if (isNotFound(e)) return undefined
                throw e
              },
            )
            if (header) {
              const claimed = bytesToHex(m.blockHash)
              if (header.hash !== claimed) {
                throw invalid(
                  `DAPI placed the transaction in a block that is not at height ${m.height}`,
                  node,
                )
              }
              time = header.time
            }
          }
          return { m, tx, mined, time }
        },
      )
    } catch (e) {
      if (isNotFound(e)) return null
      throw e
    }
    const { m, tx, mined, time } = result.value
    if (cache && mined) void cache.putTx(net, { txid: tx.txid, bytes: m.transaction })
    if (!o.placement) {
      return { tx, isInstantLocked: false, lock: 'none', node: result.node }
    }
    const blockHash = mined ? bytesToHex(m.blockHash) : undefined
    if (mined && m.isChainLocked) {
      claimLock(net, result.node ?? 'unknown', { height: m.height, hash: blockHash! })
    }
    return {
      tx,
      blockHash,
      height: mined ? m.height : undefined,
      time,
      confirmations: m.confirmations,
      isInstantLocked: m.isInstantLocked,
      lock: mined ? await lockStatus(net, m.height, o.signal, o.priority) : 'none',
      node: result.node,
    }
  }

  async function hyphenRawTx(net: NetworkId, txid: string, signal?: AbortSignal) {
    const [raw, detail] = await Promise.all([
      deps.hyphen.rawTx(net, txid, signal),
      deps.hyphen.tx(net, txid, signal),
    ])
    if (!raw.data || !detail.data) return null
    const bytes = hexToBytes(raw.data.rawtx)
    if (txidOfBytes(bytes) !== txid) {
      throw new SourceError({
        source: 'hyphen',
        kind: 'invalid-response',
        message: `Asked Hyphen for transaction ${txid} and got a different one`,
      })
    }
    const tx = await decoder.tx(bytes, net)
    const height = detail.data.blockHeight ?? undefined
    const asOfHeight = detail.data.asOfHeight
    const block =
      height === undefined ? null : await deps.hyphen.block(net, height, signal).catch(() => null)
    const lock =
      height === undefined ? lockFields('none') : hyphenLockFields(net, height, asOfHeight)
    return {
      stamp: detail,
      value: {
        tx,
        blockHash: undefined,
        height,
        time: block?.data?.blockTime,
        confirmations:
          height !== undefined && asOfHeight !== undefined ? asOfHeight - height + 1 : undefined,
        isInstantLocked: detail.data.live?.tags?.islock === true,
        isChainLocked: lock.chainLocked,
        ...(lock.chainLockClaim ? { chainLockClaim: lock.chainLockClaim } : {}),
      },
    }
  }

  function normalizedTxid(txid: string): string | null {
    const id = txid.trim().toLowerCase()
    return isHex(id, 32) ? id : null
  }

  // ---- the client -----------------------------------------------------------

  const heldUntil = new Map<string, number>()

  const client: CoreClient & CoreClientHooks = {
    async tip(net: NetworkId, signal?: AbortSignal) {
      if (hyphenStandsIn(net)) {
        const page = await deps.hyphen.blocks(net, { limit: 1 }, signal)
        const top = page.data.items[0]
        if (top) {
          return fromHyphen(
            page,
            { height: top.blockHeight, hash: top.blockHash, time: top.blockTime },
            'dapi-down',
            { height: top.blockHeight },
          )
        }
      }
      const status = await rpc().status(net, { signal })
      const height = status.message.chain?.blocksCount ?? 0
      const hash = reversed(status.message.chain?.bestBlockHash ?? new Uint8Array())
      // The node that reported the height has its header; another may be a block behind.
      const { headers } = await readHeaders(net, height, 1, signal, { prefer: status.node })
      const header = headers[0]
      if (!header) {
        throw invalid('DAPI sent no header for its own tip', status.node)
      }
      rememberTip(net, { height, hash, time: header.time })
      return dapi({ height, hash, time: header.time }, { node: status.node, height })
    },

    async chainLock(net: NetworkId, signal?: AbortSignal) {
      const { lock, node } = await fetchLockFrom(net, signal)
      const status = await lockStatusOrKnown(net, lock.height, signal)
      const data: CoreChainLock = {
        height: lock.height,
        hash: lock.hash,
        ...(status === 'locked' ? {} : { claim: 'one-node' as const }),
      }
      return dapi(data, { node, height: lock.height })
    },

    async status(net: NetworkId, signal?: AbortSignal) {
      const { message: m, node } = await rpc().status(net, { signal })
      const chain = m.chain
      const data: CoreChainStatus = {
        chain: chain?.name ?? '',
        blocks: chain?.blocksCount ?? 0,
        headers: chain?.headersCount ?? 0,
        bestBlockHash: reversed(chain?.bestBlockHash ?? new Uint8Array()),
        difficulty: chain?.difficulty ?? 0,
        medianTime: (m.time?.median ?? 0) * 1000,
        chainWork: bytesToHex(chain?.chainWork ?? new Uint8Array()),
        syncProgress: m.syncProgress,
        isSynced: chain?.isSynced ?? false,
      }
      rememberTip(net, { height: data.blocks })
      return dapi(data, { node, height: data.blocks })
    },

    async block(
      net: NetworkId,
      ref: BlockRef,
      signal?: AbortSignal,
      opts: CoreCallOptions = {},
    ): Promise<Sourced<DecodedBlock | null>> {
      const byHash = 'hash' in ref
      if (byHash && !isHex(ref.hash, 32)) return dapi(null)
      if (!byHash && !(Number.isInteger(ref.height) && ref.height >= 0)) return dapi(null)
      const cache = await getCache()
      const hit = byHash
        ? await cache?.getBlockByHash(net, ref.hash.toLowerCase())
        : await cache?.getBlockByHeight(net, ref.height)
      if (hit) {
        const block = await decoder.block(hit.bytes, net, hit.height)
        const status = await lockStatusOrKnown(net, block.height, signal, opts.priority)
        return dapi({ ...block, ...lockFields(status) }, { height: block.height })
      }
      if (hyphenStandsIn(net)) return hyphenBlock(net, ref, signal)

      // Start the ChainLock lookup beside the block fetch: by height the answer to "is it locked" is already known to be needed.
      const early = byHash
        ? lockView(net).corroborated < 0
          ? refreshLocks(net, signal, opts.priority)
          : undefined
        : lockStatus(net, ref.height, signal, opts.priority)
      early?.catch(() => undefined)
      const fetched = await fetchVerifiedBlock(net, ref, { signal, priority: opts.priority })
      if (!fetched) return dapi(null)
      const { block, bytes, node } = fetched
      const status = await lockStatusOrKnown(net, block.height, signal, opts.priority)
      if (cache && status === 'locked') {
        void cache.putBlock(net, { hash: block.hash, height: block.height, bytes })
      }
      return dapi({ ...block, ...lockFields(status) }, { node, height: block.height })
    },

    async tx(
      net: NetworkId,
      txid: string,
      signal?: AbortSignal,
      opts: CoreCallOptions = {},
    ): Promise<Sourced<DecodedTx | null>> {
      const id = normalizedTxid(txid)
      if (!id) return dapi(null)
      if (hyphenStandsIn(net)) {
        const found = await hyphenRawTx(net, id, signal)
        if (!found) return fromHyphen(await deps.hyphen.tx(net, id, signal), null, 'dapi-down')
        const { tx, height, time, confirmations, isInstantLocked, isChainLocked } = found.value
        return fromHyphen(
          found.stamp,
          {
            ...tx,
            height,
            ...(time !== undefined ? { time } : {}),
            confirmations,
            isInstantLocked,
            isChainLocked,
          },
          'dapi-down',
          { height },
        )
      }
      const raw = await dapiTx(net, id, { signal, priority: opts.priority, placement: true })
      if (!raw) return dapi(null)
      const data: DecodedTx = {
        ...raw.tx,
        ...(raw.blockHash ? { blockHash: raw.blockHash } : {}),
        ...(raw.height !== undefined ? { height: raw.height } : {}),
        ...(raw.time !== undefined ? { time: raw.time } : {}),
        ...(raw.height !== undefined ? { confirmations: raw.confirmations } : {}),
        isInstantLocked: raw.isInstantLocked,
        ...(raw.isInstantLocked ? { instantLockClaim: 'one-node' as const } : {}),
        isChainLocked: raw.lock === 'locked',
        ...(raw.lock === 'claimed' ? { chainLockClaim: 'one-node' as const } : {}),
      }
      return dapi(data, { node: raw.node, height: raw.height })
    },

    async prevouts(net: NetworkId, tx: DecodedTx, signal?: AbortSignal) {
      const wanted = new Map<string, number[]>()
      for (const input of tx.inputs) {
        if (input.coinbase !== undefined || /^0+$/.test(input.txid)) continue
        wanted.set(input.txid, [...(wanted.get(input.txid) ?? []), input.vout])
      }
      const useHyphen = hyphenStandsIn(net)
      let node: string | undefined
      let allFound = true
      let hyphenStamp: Sourced<unknown> | undefined
      const out = new Map<string, PrevOut>()
      await limited(
        [...wanted.keys()],
        ROW_CONCURRENCY,
        async (txid, rowSignal) => {
          let decoded: DecodedTx | undefined
          if (useHyphen) {
            const found = await hyphenRawTx(net, txid, rowSignal)
            decoded = found?.value.tx
            if (found && (!hyphenStamp || found.stamp.asOf < hyphenStamp.asOf)) {
              hyphenStamp = found.stamp
            }
          } else {
            const raw = await dapiTx(net, txid, { signal: rowSignal, placement: false })
            decoded = raw?.tx
            node ??= raw?.node
          }
          if (!decoded) {
            allFound = false
            return
          }
          for (const vout of wanted.get(txid) ?? []) {
            const o = decoded.outputs[vout]
            if (o) {
              out.set(`${txid}:${vout}`, {
                value: o.value,
                scriptPubKey: o.scriptPubKey,
                ...(o.address ? { address: o.address } : {}),
              })
            }
          }
        },
        signal,
      )
      if (useHyphen && hyphenStamp) return fromHyphen(hyphenStamp, out, 'dapi-down')
      if (useHyphen)
        return { ...dapi(out), source: 'hyphen' as const, fallback: 'dapi-down' as const }
      // Every output here comes from bytes that hash to the id asked for, so the values cannot change.
      return dapi(out, { node, immutable: allFound })
    },

    async headers(net: NetworkId, fromHeight: number, count: number, signal?: AbortSignal) {
      const { headers, node } = await readHeaders(net, fromHeight, count, signal)
      return dapi(headers, { node, height: headers.at(-1)?.height })
    },

    async blockRows(
      net: NetworkId,
      q: { fromHeight: number; count: number; via?: 'index' },
      signal?: AbortSignal,
    ): Promise<Sourced<BlockRow[]>> {
      const count = Math.max(0, Math.floor(q.count))
      const fromHeight = Math.floor(q.fromHeight)
      if (count === 0 || fromHeight < 0) return dapi([])
      if (q.via === 'index') {
        if (!hyphenFit(net, { unknownIsFit: false })) {
          throw invalid('Hyphen is not fit to serve a long block list')
        }
        return hyphenRows(net, fromHeight, count, signal, undefined)
      }

      const transport = deps.transport()
      const listKey = `${net}:${count}`
      const held = (heldUntil.get(listKey) ?? 0) > deps.now()
      const affordable =
        transport.budget.snapshot(net).pressure === 'ok' &&
        transport.budget.canAfford(net, count + 1)
      if ((held || !affordable) && hyphenFit(net, { unknownIsFit: false })) {
        const rows = await hyphenRows(net, fromHeight, count, signal, 'dapi-budget')
        if (!held) heldUntil.set(listKey, deps.now() + FALLBACK_HOLD_MS)
        return rows
      }

      const heights = Array.from(
        { length: Math.min(count, fromHeight + 1) },
        (_, i) => fromHeight - i,
      )
      let node: string | undefined
      const cache = await getCache()
      const locks = lockStatusOrKnown(net, heights[0]!, signal, 'list')
      locks.catch(() => undefined)
      const rows = await limited(
        heights,
        ROW_CONCURRENCY,
        async (height, rowSignal) => {
          const hit = await cache?.getBlockByHeight(net, height)
          if (hit) return decoder.block(hit.bytes, net, height)
          const fetched = await fetchVerifiedBlock(
            net,
            { height },
            { signal: rowSignal, priority: 'list' },
          )
          // The newest block may not have reached every node yet; the list shows what exists.
          if (!fetched) {
            if (height === heights[0]) return null
            throw invalid(`DAPI has no block at height ${height}`)
          }
          node ??= fetched.node
          await locks
          if (cache && statusAt(net, height) === 'locked') {
            void cache.putBlock(net, { hash: fetched.block.hash, height, bytes: fetched.bytes })
          }
          return fetched.block
        },
        signal,
      )
      const data: BlockRow[] = rows.flatMap((b) => {
        if (!b) return []
        const pool = poolOfCoinbase(b.txs[0]?.inputs[0]?.coinbase)
        const status = statusAt(net, b.height)
        return {
          height: b.height,
          hash: b.hash,
          time: b.time,
          txCount: b.txs.length,
          size: b.size,
          ...lockFields(status),
          ...(pool ? { pool } : {}),
        }
      })
      return dapi(data, { node, height: data[0]?.height })
    },

    async heightAtTime(net: NetworkId, ms: number, signal?: AbortSignal) {
      const memo = tipMemo.get(net)
      const tip =
        memo && deps.now() - memo.at < TIP_MEMO_MS
          ? dapi({ height: memo.height, hash: memo.hash, time: memo.time }, { height: memo.height })
          : await client.tip(net, signal)
      const best = tip.data
      if (ms > best.time) return { ...tip, data: best.height + 1 }
      const avg = AVERAGE_BLOCK_MS[net === 'testnet' ? 'testnet' : 'mainnet']
      let lo = { height: 0, time: undefined as number | undefined }
      let hi = { height: best.height, time: best.time }
      let node = tip.node
      for (let step = 0; step < 24; step++) {
        const span = hi.height - lo.height
        if (span <= 0) break
        let guess: number
        if (lo.time !== undefined && hi.time > lo.time) {
          const share = Math.min(1, Math.max(0, (ms - lo.time) / (hi.time - lo.time)))
          guess = lo.height + Math.round(share * span)
        } else {
          guess = hi.height - Math.round((hi.time - ms) / avg)
        }
        const size = Math.min(step === 0 ? firstWindow(hi.height - guess) : SEARCH_WINDOW, span + 1)
        const start = Math.max(
          lo.height,
          Math.min(hi.height - size + 1, guess - Math.floor(size / 2)),
        )
        const { headers, node: n } = await readHeaders(net, start, size, signal)
        node = n ?? node
        const first = headers[0]
        const last = headers.at(-1)
        if (!first || !last) break
        if (first.time >= ms) {
          if (first.height === lo.height) return dapi(first.height, { node, height: first.height })
          hi = { height: first.height, time: first.time }
        } else if (last.time < ms) {
          lo = { height: last.height + 1, time: last.time }
          if (lo.height > hi.height) return dapi(hi.height, { node, height: hi.height })
        } else {
          const found = headers.find((h) => h.time >= ms)!
          return dapi(found.height, { node, height: found.height })
        }
      }
      return dapi(hi.height, { node, height: hi.height })
    },

    async nodeSelfStatus(net: NetworkId, nodeUrl: string, signal?: AbortSignal) {
      const opts: DapiCallOptions = { signal, nodeUrl }
      const [self, chain] = await Promise.all([
        rpc().masternodeStatus(net, opts),
        rpc().status(net, opts),
      ])
      const data: DapiNodeStatus = {
        proTxHash: bytesToHex(self.message.proTxHash),
        state:
          [
            'unknown',
            'waiting-for-protx',
            'pose-banned',
            'removed',
            'operator-key-changed',
            'protx-ip-changed',
            'ready',
            'error',
          ][self.message.status] ?? 'unknown',
        height: chain.message.chain?.blocksCount ?? 0,
        version: chain.message.version?.agent ?? '',
      }
      return dapi(data, { node: nodeUrl.replace(/^https?:\/\//, ''), height: data.height })
    },

    masternodeList() {
      return Promise.reject(
        new SourceError({
          source: 'dapi',
          kind: 'unavailable',
          message: 'The masternode list stream is not wired up yet',
        }),
      )
    },

    observeTip(net: NetworkId, tip: { height: number; hash: string; time: number }): void {
      rememberTip(net, tip)
    },

    observeChainLock(
      net: NetworkId,
      lock: { height: number; hash: string },
      node?: string,
    ): boolean {
      claimLock(net, node ?? 'unknown', lock)
      return lockView(net).corroborated >= lock.height
    },

    forget(net: NetworkId): void {
      claims.delete(net)
      lockRefreshedAt.delete(net)
      lockFlights.delete(net)
      tipMemo.delete(net)
      seenTips.delete(net)
      for (const key of [...heldUntil.keys()]) if (key.startsWith(`${net}:`)) heldUntil.delete(key)
    },
  }

  onNetworkReset((net) => client.forget(net))

  async function hyphenRows(
    net: NetworkId,
    fromHeight: number,
    count: number,
    signal: AbortSignal | undefined,
    fallback: FallbackReason | undefined,
  ): Promise<Sourced<BlockRow[]>> {
    const status = await deps.hyphen.status(net, signal)
    const indexed = status.height ?? status.data.blockHeight
    // Hyphen can trail DAPI by a few blocks: the rows above what it has indexed are left out, not replaced by older
    // ones. A window wholly above its index gets its newest rows, which is all it has.
    const missing = Math.max(0, fromHeight - indexed)
    const page =
      fromHeight >= indexed
        ? await deps.hyphen.blocks(
            net,
            { limit: missing >= count ? count : count - missing },
            signal,
          )
        : await deps.hyphen.blocksFrom(
            net,
            { fromHeight, asOfHeight: indexed, limit: count },
            signal,
          )
    const items =
      missing >= count
        ? page.data.items
        : page.data.items.filter((b) => b.blockHeight <= fromHeight)
    const lockedTag = items.filter((b) => b.live?.tags?.chainlock === true)
    const lockedTop = Math.max(-1, ...lockedTag.map((b) => b.blockHeight))
    const top = lockedTag.find((b) => b.blockHeight === lockedTop)
    if (top) claimLock(net, 'hyphen', { height: top.blockHeight, hash: top.blockHash })
    const asOf = page.data.asOfHeight ?? indexed
    const toRow = (b: HyBlockSummary): BlockRow => ({
      height: b.blockHeight,
      hash: b.blockHash,
      time: b.blockTime,
      txCount: b.txCount,
      size: b.blockSize,
      ...hyphenLockFields(net, b.blockHeight, asOf),
    })
    return fromHyphen(page, items.map(toRow), fallback, { height: page.data.asOfHeight })
  }

  async function hyphenBlock(
    net: NetworkId,
    ref: BlockRef,
    signal?: AbortSignal,
  ): Promise<Sourced<DecodedBlock | null>> {
    const id = 'hash' in ref ? ref.hash.toLowerCase() : ref.height
    const [raw, detail] = await Promise.all([
      deps.hyphen.rawBlock(net, id, signal),
      deps.hyphen.block(net, id, signal),
    ])
    if (!raw.data || !detail.data) return fromHyphen(raw, null, 'dapi-down')
    const block = await decodeBlockFor(net, hexToBytes(raw.data.rawblock), ref, signal)
    try {
      checkBlock(net, block, ref)
    } catch (e) {
      throw new SourceError({
        source: 'hyphen',
        kind: 'invalid-response',
        message: (e as Error).message,
      })
    }
    if (detail.data.live?.tags?.chainlock === true) {
      claimLock(net, 'hyphen', { height: block.height, hash: block.hash })
    }
    const lock = hyphenLockFields(net, block.height, detail.data.asOfHeight)
    return fromHyphen(raw, { ...block, ...lock }, 'dapi-down', { height: block.height })
  }

  return client
}

export const core = createCoreClient()
