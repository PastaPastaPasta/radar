import {
  createDapiRpc,
  getDapiTransport,
  GRPC_INVALID_ARGUMENT,
  GRPC_NOT_FOUND,
  type DapiTransport,
} from '../dapi-core'
import type { DapiRpc } from '../dapi-core'
import { stampOf, type FallbackReason, type Sourced } from '../envelope'
import { isSourceError, SourceError } from '../errors'
import { healthRegistry } from '../health'
import { hyphen } from '../hyphen/client'
import type { HyBlockSummary } from '../hyphen/schemas'
import type { NetworkId } from '@/lib/network'
import { isDevnet } from '@/lib/network'
import { bytesToHex, hexToBytes, isHex } from '@/lib/hex'
import { parseChainLock } from '@/lib/core/chainlock'
import { parseHeader } from '@/lib/core/header'
import { coreDecoder, type createCoreDecoder } from './decode'
import type {
  BlockRef,
  BlockRow,
  CoreChainStatus,
  CoreClient,
  DapiNodeStatus,
  DecodedBlock,
  DecodedTx,
  HeaderInfo,
  PrevOut,
} from './types'

const MAX_HEADERS = 2000
const HEADER_WINDOW = 500
const FALLBACK_HOLD_MS = 120_000
const CHAIN_LOCK_MAX_AGE_MS = 10_000
const ROW_CONCURRENCY = 4
const AVERAGE_BLOCK_MS: Record<'mainnet' | 'testnet', number> = {
  mainnet: 157_000,
  testnet: 140_000,
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
}

const defaultDeps: CoreDeps = {
  transport: getDapiTransport,
  decoder: coreDecoder,
  hyphen,
  health: healthRegistry,
  now: Date.now,
}

const reversed = (bytes: Uint8Array) => bytesToHex(Uint8Array.from(bytes).reverse())

function isNotFound(e: unknown, extra: number[] = []): boolean {
  return (
    isSourceError(e) &&
    e.source === 'dapi' &&
    e.kind === 'http' &&
    e.status !== undefined &&
    (e.status === GRPC_NOT_FOUND || extra.includes(e.status))
  )
}

function limited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await run(items[i]!)
    }
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)).then(() => out)
}

export function createCoreClient(deps: CoreDeps = defaultDeps): CoreClient {
  const { decoder } = deps
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
    fallback: FallbackReason,
    extra: { height?: number; immutable?: boolean } = {},
  ): Sourced<T> {
    return {
      ...stampOf(s),
      ...(extra.height !== undefined ? { height: extra.height } : {}),
      ...(extra.immutable ? { immutable: true as const } : {}),
      fallback,
      data,
    }
  }

  const dapiDown = (net: NetworkId) => deps.health.get(net, 'dapi').state === 'down'

  /** Rule 3: Hyphen serves only while its index is current, and only on networks it covers. */
  function hyphenFit(net: NetworkId): boolean {
    if (isDevnet(net)) return false
    const state = deps.health.get(net, 'hyphen').state
    return state !== 'stale' && state !== 'down'
  }

  // ---- best ChainLock -----------------------------------------------------

  interface ChainLockMemo {
    height: number
    hash: string
    at: number
  }
  const chainLocks = new Map<NetworkId, ChainLockMemo>()
  const chainLockFlights = new Map<NetworkId, Promise<ChainLockMemo>>()

  function rememberChainLock(net: NetworkId, cl: { height: number; hash: string }): void {
    const known = chainLocks.get(net)
    if (!known || cl.height >= known.height) chainLocks.set(net, { ...cl, at: deps.now() })
  }

  async function fetchChainLock(
    net: NetworkId,
    signal?: AbortSignal,
  ): Promise<{ lock: ChainLockMemo; node?: string }> {
    const abort = new AbortController()
    const onAbort = () => abort.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    // A header range reports the best ChainLock before its headers; asking for one header near genesis keeps the reply small.
    const stream = rpc().headerStream(net, { fromHeight: 1, count: 1 }, { signal: abort.signal })
    try {
      for await (const event of stream.events) {
        if (event.kind === 'chainLock') {
          const parsed = parseChainLock(event.chainLock)
          rememberChainLock(net, parsed)
          return { lock: chainLocks.get(net)!, node: stream.node }
        }
      }
    } catch (e) {
      if (isSourceError(e) && e.kind === 'aborted' && !signal?.aborted) {
        // our own abort after the lock arrived is not an error
      } else throw e
    } finally {
      abort.abort()
      signal?.removeEventListener('abort', onAbort)
    }
    throw new SourceError({
      source: 'dapi',
      kind: 'invalid-response',
      message: 'DAPI sent no ChainLock',
      node: stream.node,
    })
  }

  async function bestChainLockHeight(
    net: NetworkId,
    signal?: AbortSignal,
  ): Promise<number | undefined> {
    const known = chainLocks.get(net)
    if (known && deps.now() - known.at < CHAIN_LOCK_MAX_AGE_MS) return known.height
    let flight = chainLockFlights.get(net)
    if (!flight) {
      flight = fetchChainLock(net, signal)
        .then((r) => r.lock)
        .finally(() => chainLockFlights.delete(net))
      chainLockFlights.set(net, flight)
    }
    try {
      return (await flight).height
    } catch {
      return known?.height
    }
  }

  async function isChainLockedHeight(net: NetworkId, height: number, signal?: AbortSignal) {
    const known = chainLocks.get(net)
    if (known && known.height >= height) return true
    const best = await bestChainLockHeight(net, signal)
    return best !== undefined && best >= height
  }

  // ---- headers ------------------------------------------------------------

  async function readHeaders(
    net: NetworkId,
    fromHeight: number,
    count: number,
    signal?: AbortSignal,
  ): Promise<{ headers: HeaderInfo[]; node?: string }> {
    if (count < 1 || count > MAX_HEADERS) {
      throw new RangeError(`Ask for 1 to ${MAX_HEADERS} headers at a time`)
    }
    const stream = rpc().headerStream(net, { fromHeight, count }, { signal })
    const raw: Uint8Array[] = []
    for await (const event of stream.events) {
      if (event.kind === 'chainLock') rememberChainLock(net, parseChainLock(event.chainLock))
      else raw.push(...event.headers)
    }
    const parsed = raw.map(parseHeader)
    const headers: HeaderInfo[] = []
    for (let i = 0; i < raw.length; i++) {
      const next = parsed[i + 1]
      const hash = next ? next.prevHash : await decoder.headerHash(raw[i]!, net)
      headers.push({ height: fromHeight + i, hash, time: parsed[i]!.time * 1000 })
    }
    return { headers, node: stream.node }
  }

  // ---- raw transactions ---------------------------------------------------

  interface RawTx {
    tx: DecodedTx
    blockHash?: string
    height?: number
    confirmations?: number
    isInstantLocked: boolean
    isChainLocked: boolean
    node?: string
  }

  async function dapiTx(net: NetworkId, txid: string, signal?: AbortSignal): Promise<RawTx | null> {
    let answered
    try {
      answered = await rpc().transaction(net, txid, { signal })
    } catch (e) {
      if (isNotFound(e, [GRPC_INVALID_ARGUMENT])) return null
      throw e
    }
    const m = answered.message
    const tx = await decoder.tx(m.transaction, net)
    const mined = m.height > 0 && m.blockHash.length > 0
    return {
      tx,
      blockHash: mined ? bytesToHex(m.blockHash) : undefined,
      height: mined ? m.height : undefined,
      confirmations: m.confirmations,
      isInstantLocked: m.isInstantLocked,
      isChainLocked: m.isChainLocked,
      node: answered.node,
    }
  }

  async function hyphenRawTx(net: NetworkId, txid: string, signal?: AbortSignal) {
    const [raw, detail] = await Promise.all([
      deps.hyphen.rawTx(net, txid, signal),
      deps.hyphen.tx(net, txid, signal),
    ])
    if (!raw.data || !detail.data) return null
    const tx = await decoder.tx(hexToBytes(raw.data.rawtx), net)
    const height = detail.data.blockHeight ?? undefined
    const asOfHeight = detail.data.asOfHeight
    return {
      stamp: detail,
      value: {
        tx,
        blockHash: undefined,
        height,
        confirmations:
          height !== undefined && asOfHeight !== undefined ? asOfHeight - height + 1 : undefined,
        isInstantLocked: detail.data.live?.tags?.islock === true,
        isChainLocked: false,
      } satisfies RawTx,
    }
  }

  function normalizedTxid(txid: string): string | null {
    const id = txid.trim().toLowerCase()
    return isHex(id, 32) ? id : null
  }

  // ---- the client -----------------------------------------------------------

  const client: CoreClient = {
    async tip(net, signal) {
      if (dapiDown(net) && hyphenFit(net)) {
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
      const { headers } = await readHeaders(net, height, 1, signal)
      const header = headers[0]
      if (!header) {
        throw new SourceError({
          source: 'dapi',
          kind: 'invalid-response',
          message: 'DAPI sent no header for its own tip',
          node: status.node,
        })
      }
      return dapi({ height, hash, time: header.time }, { node: status.node, height })
    },

    async chainLock(net, signal) {
      const { lock, node } = await fetchChainLock(net, signal)
      return dapi({ height: lock.height, hash: lock.hash }, { node, height: lock.height })
    },

    async status(net, signal) {
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
      return dapi(data, { node, height: data.blocks })
    },

    async block(net, ref, signal) {
      const byHash = 'hash' in ref
      if (byHash && !isHex(ref.hash, 32)) return dapi(null)
      if (!byHash && !(Number.isInteger(ref.height) && ref.height >= 0)) return dapi(null)
      if (dapiDown(net) && hyphenFit(net)) return hyphenBlock(net, ref, signal)

      let answered
      try {
        answered = await rpc().block(
          net,
          byHash ? { hash: ref.hash.toLowerCase() } : { height: ref.height },
          { signal },
        )
      } catch (e) {
        if (isNotFound(e, [GRPC_INVALID_ARGUMENT])) return dapi(null)
        throw e
      }
      const block = await decoder.block(answered.message.block, net)
      if (!byHash && block.height !== ref.height) {
        throw new SourceError({
          source: 'dapi',
          kind: 'invalid-response',
          message: `Asked DAPI for block ${ref.height} and got block ${block.height}`,
          node: answered.node,
        })
      }
      const chainLocked = await isChainLockedHeight(net, block.height, signal)
      return dapi(
        { ...block, chainLocked },
        { node: answered.node, height: block.height, immutable: chainLocked },
      )
    },

    async tx(net, txid, signal) {
      const id = normalizedTxid(txid)
      if (!id) return dapi(null)
      if (dapiDown(net) && hyphenFit(net)) {
        const found = await hyphenRawTx(net, id, signal)
        if (!found) return fromHyphen(await deps.hyphen.tx(net, id, signal), null, 'dapi-down')
        const { tx, height, confirmations, isInstantLocked } = found.value
        return fromHyphen(
          found.stamp,
          { ...tx, height, confirmations, isInstantLocked },
          'dapi-down',
          { height },
        )
      }
      const raw = await dapiTx(net, id, signal)
      if (!raw) return dapi(null)
      let time: number | undefined
      if (raw.height !== undefined) {
        const { headers } = await readHeaders(net, raw.height, 1, signal)
        time = headers[0]?.time
      }
      const data: DecodedTx = {
        ...raw.tx,
        ...(raw.blockHash ? { blockHash: raw.blockHash } : {}),
        ...(raw.height !== undefined ? { height: raw.height } : {}),
        ...(time !== undefined ? { time } : {}),
        ...(raw.height !== undefined ? { confirmations: raw.confirmations } : {}),
        isInstantLocked: raw.isInstantLocked,
        isChainLocked: raw.isChainLocked,
      }
      return dapi(data, { node: raw.node, height: raw.height, immutable: raw.isChainLocked })
    },

    async prevouts(net, tx, signal) {
      const wanted = new Map<string, number[]>()
      for (const input of tx.inputs) {
        if (input.coinbase !== undefined || /^0+$/.test(input.txid)) continue
        wanted.set(input.txid, [...(wanted.get(input.txid) ?? []), input.vout])
      }
      const useHyphen = dapiDown(net) && hyphenFit(net)
      let node: string | undefined
      let allLocked = true
      const out = new Map<string, PrevOut>()
      await limited([...wanted.keys()], ROW_CONCURRENCY, async (txid) => {
        let decoded: DecodedTx | undefined
        if (useHyphen) {
          decoded = (await hyphenRawTx(net, txid, signal))?.value.tx
          allLocked = false
        } else {
          const raw = await dapiTx(net, txid, signal)
          decoded = raw?.tx
          node ??= raw?.node
          allLocked &&= raw?.isChainLocked === true
        }
        if (!decoded) return
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
      })
      const stamped = dapi(out, { node, immutable: !useHyphen && allLocked })
      return useHyphen ? { ...stamped, source: 'hyphen', fallback: 'dapi-down' } : stamped
    },

    async headers(net, fromHeight, count, signal) {
      const { headers, node } = await readHeaders(net, fromHeight, count, signal)
      return dapi(headers, { node, height: headers.at(-1)?.height })
    },

    async blockRows(net, q, signal) {
      const count = Math.max(0, Math.floor(q.count))
      const fromHeight = Math.floor(q.fromHeight)
      if (count === 0 || fromHeight < 0) return dapi([])

      const transport = deps.transport()
      const held = (heldUntil.get(net) ?? 0) > deps.now()
      const affordable =
        transport.budget.snapshot(net).pressure === 'ok' &&
        transport.budget.canAfford(net, count + 1)
      if ((held || !affordable) && hyphenFit(net)) {
        const rows = await hyphenRows(net, fromHeight, count, signal)
        if (!held) heldUntil.set(net, deps.now() + FALLBACK_HOLD_MS)
        return rows
      }

      const heights = Array.from(
        { length: Math.min(count, fromHeight + 1) },
        (_, i) => fromHeight - i,
      )
      let node: string | undefined
      const rows = await limited(heights, ROW_CONCURRENCY, async (height) => {
        const answered = await rpc().block(net, { height }, { signal, priority: 'list' })
        node ??= answered.node
        const block = await decoder.block(answered.message.block, net)
        return block
      })
      const lockedUpTo = (await bestChainLockHeight(net, signal)) ?? -1
      const data: BlockRow[] = rows.map((b) => ({
        height: b.height,
        hash: b.hash,
        time: b.time,
        txCount: b.txs.length,
        size: b.size,
        chainLocked: b.height <= lockedUpTo,
      }))
      return dapi(data, { node, height: data[0]?.height })
    },

    async heightAtTime(net, ms, signal) {
      const tip = await client.tip(net, signal)
      const best = tip.data
      if (ms >= best.time) return { ...tip, data: best.height }
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
        const size = Math.min(HEADER_WINDOW, span + 1)
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

    async nodeSelfStatus(net, nodeUrl, signal) {
      const opts = { signal, nodeUrl }
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
  }

  const heldUntil = new Map<NetworkId, number>()

  async function hyphenRows(
    net: NetworkId,
    fromHeight: number,
    count: number,
    signal?: AbortSignal,
  ): Promise<Sourced<BlockRow[]>> {
    const status = await deps.hyphen.status(net, signal)
    const indexed = status.height ?? status.data.blockHeight
    const page =
      fromHeight >= indexed
        ? await deps.hyphen.blocks(net, { limit: count }, signal)
        : await deps.hyphen.blocksFrom(
            net,
            { fromHeight, asOfHeight: indexed, limit: count },
            signal,
          )
    const toRow = (b: HyBlockSummary): BlockRow => ({
      height: b.blockHeight,
      hash: b.blockHash,
      time: b.blockTime,
      txCount: b.txCount,
      size: b.blockSize,
      chainLocked: b.live?.tags?.chainlock === true,
    })
    return fromHyphen(page, page.data.items.map(toRow), 'dapi-budget', {
      height: page.data.asOfHeight,
    })
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
    const block = await decoder.block(hexToBytes(raw.data.rawblock), net)
    const chainLocked = detail.data.live?.tags?.chainlock === true
    return fromHyphen(raw, { ...block, chainLocked }, 'dapi-down', {
      height: block.height,
      immutable: chainLocked,
    })
  }

  return client
}

export const core: CoreClient = createCoreClient()
