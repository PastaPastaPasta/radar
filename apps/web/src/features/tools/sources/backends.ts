import { endpoint, type EndpointSource, type HostedSource } from '@/data/endpoints'
import type { DevnetConfig, NetworkId } from '@/lib/network'

export type BackendId =
  'dapi' | 'sdk' | 'quorums' | 'hyphen' | 'insight' | 'pe' | 'rate' | 'radar' | 'site'

export type BackendState = 'in-use' | 'off' | 'not-offered'

export interface Backend {
  id: BackendId
  /** Run by one operator. False for the evonodes, which anyone on the network runs and Radar picks among. */
  hosted: boolean
  /**
   * Where requests go: a host (with a path where one host serves two things), or `EVONODES` for the nodes picked
   * from the node list. Null where the network has no such backend.
   */
  host: string | null
  /** Where the edge passes the request on to, when the host is this site's own pass-through. */
  upstream?: string
  state: BackendState
}

/** Stands for the evonodes Radar picks from the node list: many hosts, none of them fixed. */
export const EVONODES = 'evonodes'

const HYPHEN_UPSTREAM: Partial<Record<NetworkId, string>> = {
  mainnet: 'hy.kw.vg',
  testnet: 'ts.kw.vg',
}

const hostOf = (url: string, origin: string): string => {
  const u = new URL(url, origin)
  return u.pathname === '/' ? u.host : `${u.host}${u.pathname}`
}

/**
 * Every backend the app can contact on `net`, in the order the page lists them. Decentralized only mode leaves the
 * hosted indexes, the crawler API and the price feed off; the node list, the quorum keys and this site stay in use,
 * because without them there are no nodes to ask, no proofs to check and no app.
 */
export function backends(
  net: NetworkId,
  opts: { origin: string; decentralizedOnly: boolean; devnets?: readonly DevnetConfig[] },
): Backend[] {
  const at = (source: EndpointSource) => {
    const url = endpoint(net, source, opts.devnets)
    return url === null ? null : hostOf(url, opts.origin)
  }
  const gated = (id: HostedSource, extra: Partial<Backend> = {}): Backend => {
    const base = at(id)
    const host = base !== null && id === 'rate' ? `${base}/rate` : base
    return {
      id,
      hosted: true,
      host,
      state: host === null ? 'not-offered' : opts.decentralizedOnly ? 'off' : 'in-use',
      ...extra,
    }
  }
  const quorums = at('quorums')
  return [
    { id: 'dapi', hosted: false, host: EVONODES, state: 'in-use' },
    { id: 'sdk', hosted: false, host: EVONODES, state: 'in-use' },
    {
      id: 'quorums',
      hosted: true,
      host: quorums,
      state: quorums === null ? 'not-offered' : 'in-use',
    },
    gated('hyphen', { upstream: HYPHEN_UPSTREAM[net] }),
    gated('insight'),
    gated('pe'),
    gated('rate'),
    gated('radar'),
    { id: 'site', hosted: true, host: new URL(opts.origin).host, state: 'in-use' },
  ]
}
