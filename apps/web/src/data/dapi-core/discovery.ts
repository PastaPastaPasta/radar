import { dapiDefaultPort, endpoint } from '../endpoints'
import { SourceError } from '../errors'
import { isDevnet, type DevnetConfig, type NetworkId } from '@/lib/network'
import type { FetchLike } from './grpc-web'

export interface NodeInfo {
  /** "https://ip:port" */
  url: string
  /** "ip:port", the form stamps carry. */
  host: string
  proTxHash?: string
}

export type DiscoverySource = 'cache' | 'live' | 'seed' | 'devnet'

export const NODE_LIST_TTL_MS = 60 * 60 * 1000
const DISCOVERY_TIMEOUT_MS = 8_000

/** Where the discovered list is kept between visits (§4.5 `meta`). */
export interface NodeListStore {
  get(net: NetworkId): Promise<{ nodes: NodeInfo[]; at: number } | undefined>
  put(net: NetworkId, nodes: NodeInfo[], at: number): Promise<void>
}

export function nodeFromHost(host: string, proTxHash?: string): NodeInfo | undefined {
  const match = /^(?:\[([^\]]+)\]|([^:\s/]+)):(\d{1,5})$/.exec(
    host.trim().replace(/^https?:\/\//, ''),
  )
  if (!match) return undefined
  const name = match[1] ?? match[2]!
  const shown = match[1] ? `[${name}]` : name
  return {
    url: `https://${shown}:${match[3]}`,
    host: `${shown}:${match[3]}`,
    ...(proTxHash ? { proTxHash } : {}),
  }
}

/** Keeps ENABLED nodes whose version check passed (§4.2); the port is the node's HTTPS port or the network default. */
export function parseQuorumNodes(body: unknown, net: NetworkId): NodeInfo[] {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  const fallbackPort = dapiDefaultPort(net)
  const out: NodeInfo[] = []
  for (const entry of data as Record<string, unknown>[]) {
    if (entry?.status !== 'ENABLED' || entry.versionCheck !== 'success') continue
    const address = typeof entry.address === 'string' ? entry.address : undefined
    if (!address) continue
    const port = typeof entry.platformHTTPPort === 'number' ? entry.platformHTTPPort : fallbackPort
    if (port === null || port === undefined) continue
    const at = address.lastIndexOf(':')
    const node = nodeFromHost(
      `${at > 0 ? address.slice(0, at) : address}:${port}`,
      typeof entry.proTxHash === 'string' ? entry.proTxHash : undefined,
    )
    if (node) out.push(node)
  }
  return out
}

export async function loadSeeds(net: NetworkId): Promise<NodeInfo[]> {
  if (net !== 'mainnet' && net !== 'testnet') return []
  const seed = (await (net === 'mainnet'
    ? import('./seed.mainnet.json')
    : import('./seed.testnet.json'))) as {
    default: { nodes: { url: string; proTxHash?: string }[] }
  }
  return seed.default.nodes.flatMap((n) => nodeFromHost(n.url, n.proTxHash) ?? [])
}

export function devnetNodes(net: NetworkId, devnets: readonly DevnetConfig[]): NodeInfo[] {
  const name = net.replace(/^devnet-/, '')
  const config = devnets.find((d) => d.name === name)
  return (config?.dapiAddresses ?? []).flatMap((a) => nodeFromHost(a) ?? [])
}

export interface DiscoveryDeps {
  fetch: FetchLike
  now: () => number
  store?: NodeListStore
  devnets: () => readonly DevnetConfig[]
}

/** The node list from the quorum service. Throws when it can't be read. */
export async function fetchNodeList(net: NetworkId, deps: DiscoveryDeps): Promise<NodeInfo[]> {
  const base = endpoint(net, 'quorums', deps.devnets())
  if (!base)
    throw new SourceError({
      source: 'dapi',
      kind: 'unavailable',
      message: 'No node list for this network',
    })
  let res: Response
  try {
    res = await deps.fetch(`${base}/masternodes`, {
      credentials: 'omit',
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new SourceError({
      source: 'dapi',
      kind: 'network',
      message: 'The node list could not be fetched',
      cause,
    })
  }
  if (!res.ok) {
    throw new SourceError({
      source: 'dapi',
      kind: 'http',
      message: `The node list answered HTTP ${res.status}`,
      status: res.status,
    })
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (cause) {
    throw new SourceError({
      source: 'dapi',
      kind: 'invalid-response',
      message: 'The node list is not JSON',
      cause,
    })
  }
  const nodes = parseQuorumNodes(body, net)
  if (nodes.length === 0) {
    throw new SourceError({
      source: 'dapi',
      kind: 'invalid-response',
      message: 'The node list holds no usable node',
    })
  }
  return nodes
}

export interface Discovered {
  nodes: NodeInfo[]
  source: DiscoverySource
  /** Resolves with the live list when the first answer came from a seed or a stale cache; never rejects. */
  refreshed?: Promise<NodeInfo[] | undefined>
}

/**
 * A list from the last hour, else an older one or the bundled seeds right away with a live refresh behind them, so
 * the first call never waits for the 170 KB list; the pool swaps to the live list when it lands. Devnets use their
 * configured addresses and refresh nothing.
 */
export async function discoverNodes(net: NetworkId, deps: DiscoveryDeps): Promise<Discovered> {
  if (isDevnet(net)) {
    const nodes = devnetNodes(net, deps.devnets())
    if (nodes.length === 0) {
      throw new SourceError({
        source: 'dapi',
        kind: 'unavailable',
        message: 'No DAPI address is configured for this devnet',
      })
    }
    return { nodes, source: 'devnet' }
  }
  const cached = await deps.store?.get(net).catch(() => undefined)
  if (cached && deps.now() - cached.at < NODE_LIST_TTL_MS && cached.nodes.length > 0) {
    return { nodes: cached.nodes, source: 'cache' }
  }
  const refreshed = fetchNodeList(net, deps).then(
    async (nodes) => {
      await deps.store?.put(net, nodes, deps.now()).catch(() => undefined)
      return nodes
    },
    () => undefined,
  )
  // A list from an earlier visit spreads the load better than 30 bundled addresses, so it goes first.
  if (cached && cached.nodes.length > 0) return { nodes: cached.nodes, source: 'cache', refreshed }
  const seeds = await loadSeeds(net)
  if (seeds.length > 0) return { nodes: seeds, source: 'seed', refreshed }
  const live = await refreshed
  if (live) return { nodes: live, source: 'live' }
  throw new SourceError({
    source: 'dapi',
    kind: 'unavailable',
    message: 'No DAPI node is known for this network',
  })
}
