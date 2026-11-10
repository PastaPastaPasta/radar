import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { radarKeys } from '../query/keys'
import { dataClass, POLL_MS } from '../query/stale'
import { radar } from './client'
import type { RadarHistoryQuery } from './schemas'

export const radarQueries = {
  status: (net: NetworkId = 'mainnet') =>
    queryOptions({
      queryKey: radarKeys(net, 'status'),
      queryFn: ({ signal }) => radar.status(signal, net),
      ...dataClass('crawl'),
      refetchInterval: POLL_MS.radarStatus,
    }),
  health: () =>
    queryOptions({
      queryKey: radarKeys('mainnet', 'health'),
      queryFn: ({ signal }) => radar.health(signal),
      ...dataClass('crawl'),
    }),
  releases: () =>
    queryOptions({
      queryKey: radarKeys('mainnet', 'releases'),
      queryFn: ({ signal }) => radar.releases(signal),
      ...dataClass('crawl'),
    }),
  summary: (net: NetworkId) =>
    queryOptions({
      queryKey: radarKeys(net, 'summary'),
      queryFn: ({ signal }) => radar.summary(net, signal),
      ...dataClass('crawl'),
    }),
  history: (net: NetworkId, q: RadarHistoryQuery) =>
    queryOptions({
      queryKey: radarKeys(net, 'history', {
        dim: q.dim,
        scope: q.scope ?? 'all',
        days: q.days ?? 30,
        top: q.top,
      }),
      queryFn: ({ signal }) => radar.history(net, q, signal),
      ...dataClass('crawl'),
    }),
  geo: (net: NetworkId) =>
    queryOptions({
      queryKey: radarKeys(net, 'geo'),
      queryFn: ({ signal }) => radar.geo(net, signal),
      ...dataClass('crawl'),
    }),
  masternodes: (net: NetworkId) =>
    queryOptions({
      queryKey: radarKeys(net, 'masternodes'),
      queryFn: ({ signal }) => radar.masternodes(net, signal),
      ...dataClass('crawl'),
    }),
  masternode: (net: NetworkId, protx: string) =>
    queryOptions({
      queryKey: radarKeys(net, 'masternode', { protx: protx.toLowerCase() }),
      queryFn: ({ signal }) => radar.masternode(net, protx, signal),
      ...dataClass('structural'),
    }),
  payments: (net: NetworkId, protx: string, q: { before?: number; limit?: number } = {}) =>
    queryOptions({
      queryKey: radarKeys(net, 'payments', {
        protx: protx.toLowerCase(),
        before: q.before,
        limit: q.limit,
      }),
      queryFn: ({ signal }) => radar.payments(net, protx, q, signal),
      ...dataClass('crawl'),
    }),
  bench: (net: NetworkId) =>
    queryOptions({
      queryKey: radarKeys(net, 'bench'),
      queryFn: ({ signal }) => radar.bench(net, signal),
      ...dataClass('crawl'),
    }),
  mnBench: (net: NetworkId, protx: string) =>
    queryOptions({
      queryKey: radarKeys(net, 'mn-bench', { protx: protx.toLowerCase() }),
      queryFn: ({ signal }) => radar.mnBench(net, protx, signal),
      ...dataClass('crawl'),
    }),
  platform: (net: NetworkId) =>
    queryOptions({
      queryKey: radarKeys(net, 'platform'),
      queryFn: ({ signal }) => radar.platform(net, signal),
      ...dataClass('crawl'),
    }),
  activation: (net: NetworkId) =>
    queryOptions({
      queryKey: radarKeys(net, 'activation'),
      queryFn: ({ signal }) => radar.activation(net, signal),
      ...dataClass('crawl'),
      refetchInterval: POLL_MS.radarActivation,
    }),
  changes: (net: NetworkId) =>
    queryOptions({
      queryKey: radarKeys(net, 'changes'),
      queryFn: ({ signal }) => radar.changes(net, signal),
      ...dataClass('crawl'),
    }),
}
