import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

export const API_ORIGIN = 'https://radar.dashhq.org'

export interface ApiEndpoint {
  /** The anchor on the page and the id of the card. */
  id: string
  method: 'GET' | 'POST'
  /** The path under the origin, with `{net}` and `{protx}` left as written. */
  path: string
  /** The query the endpoint reads, as written after the path. */
  query?: string
  summary: MessageDescriptor
}

export const GLOBAL_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'status',
    method: 'GET',
    path: '/api/v1/status',
    summary: msg`The crawler's and the chain's state for each network: the latest crawl, our Dash node's sync and the payment index range.`,
  },
  {
    id: 'releases',
    method: 'GET',
    path: '/api/v1/releases',
    summary: msg`Dash Core's published releases from GitHub, newest first, refreshed hourly.`,
  },
  {
    id: 'health',
    method: 'GET',
    path: '/api/v1/health',
    summary: msg`200 while every network's data is fresh and saved, 503 with what is wrong otherwise. For uptime checks.`,
  },
]

export const NETWORK_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'summary',
    method: 'GET',
    path: '/api/v1/{net}/summary',
    summary: msg`The latest finished crawl, the one a day before it and every distribution (dists[scope][dim]), with yields, Platform health and DKG readiness.`,
  },
  {
    id: 'history',
    method: 'GET',
    path: '/api/v1/{net}/history',
    query: '?scope=mn&dim=version&days=30&top=8',
    summary: msg`A time series of one distribution. days is 1, 7, 14, 30, 90 or 365; top is 1 to 20; dim=totals returns the node counts instead.`,
  },
  {
    id: 'geo',
    method: 'GET',
    path: '/api/v1/{net}/geo',
    summary: msg`Reachable nodes counted per city, never by address, and how many have no location.`,
  },
  {
    id: 'masternodes',
    method: 'GET',
    path: '/api/v1/{net}/masternodes',
    summary: msg`Every registered masternode with its latest port check, user agent, location, hosting, uptime and DKG readiness. The map is drawn from this.`,
  },
  {
    id: 'masternode',
    method: 'GET',
    path: '/api/v1/{net}/masternodes/{protx}',
    summary: msg`One masternode: its list entry, collateral, keys, addresses, version history, uptime, payments, returns, changes and, for an evonode, Platform rewards.`,
  },
  {
    id: 'payments',
    method: 'GET',
    path: '/api/v1/{net}/masternodes/{protx}/payments',
    query: '?before={height}&limit=100',
    summary: msg`Older payments of one masternode, newest first. Page with before set to the last height you got.`,
  },
  {
    id: 'masternode-bench',
    method: 'GET',
    path: '/api/v1/{net}/masternodes/{protx}/bench',
    summary: msg`One masternode's speed-test runs from each vantage point, with its rank and combined grade.`,
  },
  {
    id: 'bench',
    method: 'GET',
    path: '/api/v1/{net}/bench',
    summary: msg`A summary of the speed tests from each vantage point.`,
  },
  {
    id: 'check',
    method: 'POST',
    path: '/api/v1/{net}/masternodes/{protx}/check',
    summary: msg`Checks a masternode now with a P2P handshake to its registered address. Five checks a minute per client; a result under a minute old is returned again.`,
  },
  {
    id: 'platform',
    method: 'GET',
    path: '/api/v1/{net}/platform',
    summary: msg`Evonodes' Platform rewards in credits: the current epoch, the protocol upgrade vote, returns, up to 120 epochs, who proposes next and every evonode.`,
  },
  {
    id: 'activation',
    method: 'GET',
    path: '/api/v1/{net}/activation',
    summary: msg`Core's version-bits deployments (Dash Core 24 and evo_shares): their state, windows, signalling and outlook.`,
  },
  {
    id: 'changes',
    method: 'GET',
    path: '/api/v1/{net}/changes',
    summary: msg`The 300 latest masternode list changes, newest first, and when recording started.`,
  },
  {
    id: 'reference',
    method: 'GET',
    path: '/api/v1/{net}/reference',
    summary: msg`The block hashes the speed tests use.`,
  },
]

export const API_ENDPOINTS: ApiEndpoint[] = [...GLOBAL_ENDPOINTS, ...NETWORK_ENDPOINTS]

export interface CurlExample {
  id: string
  command: string
}

export const CURL_EXAMPLES: CurlExample[] = [
  {
    id: 'versions',
    command: `curl ${API_ORIGIN}/api/v1/mainnet/summary | jq '.dists.mn.version'`,
  },
  {
    id: 'upgrade',
    command: `curl ${API_ORIGIN}/api/v1/mainnet/platform | jq '.upgrade'`,
  },
]

export const endpointTitle = (e: ApiEndpoint): string => `${e.method} ${e.path}${e.query ?? ''}`
