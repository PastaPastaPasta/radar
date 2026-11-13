import { createDapiRpc, getDapiTransport, type DapiTransport } from '../dapi-core'
import type { Sourced } from '../envelope'
import { abortedError, isSourceError, SourceError } from '../errors'
import { onNetworkReset } from '../query/network-cache'
import type { NetworkId } from '@/lib/network'
import { parseMnListDiff } from './mn-list-decode'
import type { CoreClient, DapiMnEntry } from './types'

/** The list is tip-relative, but a whole mainnet diff is 1.35 MB: read it once per five minutes. */
export const MN_LIST_TTL_MS = 5 * 60_000
/** Reads that sent a list that failed its checks, or none in time, are repeated on other nodes this many times in all. */
const ATTEMPTS = 3
const IDLE_MS = 30_000
const DEADLINE_MS = 90_000
const ZERO_HASH = '0'.repeat(64)

export interface MasternodeListDeps {
  /** Read on every call, so a transport installed after the list was made takes effect. */
  transport: () => DapiTransport
  /** Block headers by height: the block the list claims to be at is looked up here. */
  headers: CoreClient['headers']
  now: () => number
}

interface Held {
  at: number
  value: Sourced<Map<string, DapiMnEntry>>
}

const bad = (message: string, node?: string) =>
  new SourceError({ source: 'dapi', kind: 'invalid-response', message, node })

const retryable = (e: unknown): boolean =>
  isSourceError(e) &&
  (e.kind === 'invalid-response' || e.kind === 'timeout' || e.kind === 'network')

/**
 * The deterministic masternode list from the first message of `subscribeToMasternodeList` (a full diff from the zero
 * hash). One stream is opened per read and closed at once; the decoded list is kept five minutes per network and
 * shared by every caller in the meantime.
 *
 * What is checked: every field's form, no repeated ProTx, the coinbase payload's masternode-list root against the
 * diff's, and the diff's block hash against the header DAPI reports at the coinbase's height (a node that names
 * another block is refused and benched; a header that cannot be read leaves the list unchecked, not refused). The
 * entries themselves are not hashed against that root, so the list is one node's claim until Core proofs arrive (§4.4a).
 */
export function createMasternodeList(deps: MasternodeListDeps) {
  const held = new Map<NetworkId, Held>()
  const flights = new Map<NetworkId, Promise<Sourced<Map<string, DapiMnEntry>>>>()
  const rpcs = new WeakMap<DapiTransport, ReturnType<typeof createDapiRpc>>()
  const rpc = () => {
    const transport = deps.transport()
    let r = rpcs.get(transport)
    if (!r) rpcs.set(transport, (r = createDapiRpc(transport)))
    return r
  }

  async function firstMessage(
    net: NetworkId,
    avoidNodes: string[],
    signal: AbortSignal,
  ): Promise<{ diff: Uint8Array; node?: string }> {
    const stream = rpc().masternodeListStream(net, {
      signal,
      priority: 'list',
      avoidNodes,
      idleTimeoutMs: IDLE_MS,
      deadlineMs: DEADLINE_MS,
    })
    for await (const event of stream.events) return { diff: event.diff, node: stream.node }
    throw new SourceError({
      source: 'dapi',
      kind: 'unavailable',
      message: 'The node closed the masternode list stream without sending a list',
      node: stream.node,
    })
  }

  async function read(
    net: NetworkId,
    signal: AbortSignal,
  ): Promise<Sourced<Map<string, DapiMnEntry>>> {
    const avoid: string[] = []
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController()
      const link = () => ctrl.abort()
      signal.addEventListener('abort', link, { once: true })
      let node: string | undefined
      try {
        const first = await firstMessage(net, avoid, ctrl.signal)
        node = first.node
        const parsed = parseMnListDiff(first.diff)
        if (parsed.diff.baseBlockHash !== ZERO_HASH) {
          throw bad('The first masternode list message is not a full list', node)
        }
        if (!parsed.rootMatchesCoinbase) {
          throw bad('The masternode list does not match the root in its block’s coinbase', node)
        }
        await checkBlock(net, parsed.height, parsed.diff.blockHash, node, signal)
        const now = deps.now()
        return {
          source: 'dapi',
          asOf: now,
          fetchedAt: now,
          proved: false,
          ...(node ? { node } : {}),
          height: parsed.height,
          data: new Map(parsed.diff.updated.map((e) => [e.proRegTxHash, e])),
        }
      } catch (e) {
        if (signal.aborted) throw abortedError('dapi')
        if (isSourceError(e) && e.kind === 'invalid-response') {
          deps.transport().reportInvalid?.(net, node ?? e.node ?? '', e.message)
        }
        if (!retryable(e) || attempt >= ATTEMPTS - 1) throw e
        if (node) avoid.push(node)
      } finally {
        signal.removeEventListener('abort', link)
        ctrl.abort()
      }
    }
  }

  async function checkBlock(
    net: NetworkId,
    height: number,
    blockHash: string,
    node: string | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    let found: string | undefined
    try {
      found = (await deps.headers(net, height, 1, signal)).data[0]?.hash
    } catch (e) {
      if (signal.aborted) throw e
      return
    }
    if (found !== undefined && found !== blockHash) {
      throw bad(
        `The masternode list names block ${blockHash}, but block ${height} is ${found}`,
        node,
      )
    }
  }

  function forget(net: NetworkId): void {
    held.delete(net)
    flights.delete(net)
  }

  const masternodeList: CoreClient['masternodeList'] = (net, signal) => {
    if (signal?.aborted) return Promise.reject(abortedError('dapi'))
    const hit = held.get(net)
    if (hit && deps.now() - hit.at < MN_LIST_TTL_MS) return Promise.resolve(hit.value)
    let flight = flights.get(net)
    if (!flight) {
      const fresh: Promise<Sourced<Map<string, DapiMnEntry>>> = read(
        net,
        new AbortController().signal,
      )
        .then((value) => {
          if (flights.get(net) === fresh) held.set(net, { at: deps.now(), value })
          return value
        })
        .finally(() => {
          if (flights.get(net) === fresh) flights.delete(net)
        })
      flights.set(net, fresh)
      flight = fresh
    }
    return raceAbort(flight, signal)
  }

  return { masternodeList, forget }
}

function raceAbort<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortedError('dapi'))
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

let shared: ReturnType<typeof createMasternodeList> | undefined
const defaults = (): ReturnType<typeof createMasternodeList> =>
  (shared ??= createMasternodeList({
    transport: getDapiTransport,
    headers: (...args) => import('./client').then(({ core }) => core.headers(...args)),
    now: Date.now,
  }))

onNetworkReset((net) => shared?.forget(net))

/** `core.masternodeList`: the default instance over the installed transport and the Core façade's header reads. */
export const masternodeList: CoreClient['masternodeList'] = (net, signal) =>
  defaults().masternodeList(net, signal)

/** Drops the kept list of a network, for tests. */
export function forgetMasternodeList(net: NetworkId): void {
  shared?.forget(net)
}
