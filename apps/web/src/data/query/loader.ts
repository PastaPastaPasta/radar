import type { FetchQueryOptions, QueryClient, QueryKey } from '@tanstack/query-core'
import { parseNetworkParam, type NetworkId } from '@/lib/network'
import { budget } from '../dapi-core/budget'

/**
 * What a prefetch costs, which decides whether a loader may start it (§4.7, §6.3):
 * - `http`: Radar, Platform Explorer, Hyphen and the rate. Always allowed.
 * - `dapi`: one detail-page call at most, and only while the DAPI budget has room.
 * - `sdk`: only when the SDK is already connected, so a loader never starts it.
 */
export type PrefetchCost = 'http' | 'dapi' | 'sdk'

export interface PrefetchItem {
  cost: PrefetchCost
  start(client: QueryClient): Promise<void>
  /** The loader waits for this one (up to the deadline); the rest are started and left running. */
  wait?: boolean
  /** A `dapi` item is allowed only for a detail route: `/block/…`, `/tx/…`. */
  detail?: boolean
}

export function prefetchItem<TData, TKey extends QueryKey>(
  cost: PrefetchCost,
  query: FetchQueryOptions<TData, Error, TData, TKey>,
  flags: { wait?: boolean; detail?: boolean } = {},
): PrefetchItem {
  return { cost, ...flags, start: (client) => client.prefetchQuery(query) }
}

export interface PrefetchGates {
  /** True when one more detail read (two DAPI calls) fits without moving the budget past `ok`. */
  dapi(net: NetworkId): boolean
  sdkReady(net: NetworkId): boolean
}

let sdkProbe: (net: NetworkId) => boolean = () => false

/** The SDK client registers how to tell whether a network's SDK is connected; until then nothing counts as ready. */
export function registerSdkReadyProbe(probe: (net: NetworkId) => boolean): void {
  sdkProbe = probe
}

export const defaultGates: PrefetchGates = {
  dapi(net) {
    try {
      return budget.snapshot(net).pressure === 'ok' && budget.canAfford(net, DETAIL_DAPI_COST)
    } catch {
      return false
    }
  },
  sdkReady: (net) => sdkProbe(net),
}

/** What one detail-page read costs: the block or transaction itself and the ChainLock lookup behind it. */
export const DETAIL_DAPI_COST = 2
export const MAX_DAPI_PREFETCH = 1
export const DEFAULT_LOADER_DEADLINE_MS = 1500

export interface PrefetchOptionsOf {
  /** True when the router is preloading on hover or focus: nothing is awaited. */
  preload?: boolean
  gates?: PrefetchGates
  deadlineMs?: number
}

/** Decides which items may start. Pure, so the budget rules can be tested without a client. */
export function allowedItems(
  net: NetworkId,
  items: readonly PrefetchItem[],
  gates: PrefetchGates,
): PrefetchItem[] {
  let dapi = 0
  return items.filter((item) => {
    switch (item.cost) {
      case 'http':
        return true
      case 'dapi':
        if (!item.detail || dapi >= MAX_DAPI_PREFETCH || !gates.dapi(net)) return false
        dapi++
        return true
      case 'sdk':
        return gates.sdkReady(net)
    }
  })
}

/**
 * The one loader helper routes use (§6.3). It starts every allowed prefetch, waits for the ones
 * marked `wait` until they settle or the deadline passes, and never rejects: a failed source is the
 * page's `ErrorState` to show, not a reason to blank the route.
 */
export async function prefetchForRoute(
  client: QueryClient,
  net: NetworkId,
  items: readonly PrefetchItem[],
  {
    preload = false,
    gates = defaultGates,
    deadlineMs = DEFAULT_LOADER_DEADLINE_MS,
  }: PrefetchOptionsOf = {},
): Promise<void> {
  const started = allowedItems(net, items, gates).map((item) => ({
    item,
    done: item.start(client).catch(() => undefined),
  }))
  if (preload) return
  const awaited = started.filter((s) => s.item.wait).map((s) => s.done)
  if (awaited.length === 0) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deadlineMs)
  })
  try {
    await Promise.race([Promise.all(awaited).then(() => undefined), deadline])
  } finally {
    clearTimeout(timer)
  }
}

/** The network a route's search names, for `loaderDeps` and `loader`. */
export function routeNetwork(search: { network?: string; net?: string }): NetworkId {
  return parseNetworkParam(search.network, search.net).net
}
