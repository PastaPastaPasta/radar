import { endpoint, sourceOff, type HostedSource } from '@/data/endpoints'
import { parseNetworkParam } from '@/lib/network'

/** The hosted APIs nearly every page reads first: Radar's census and Platform Explorer (also the price). */
const EARLY: readonly HostedSource[] = ['radar', 'pe']

/**
 * Opens the connections to the hosted APIs while the first route's code loads, so its first read does not pay for a
 * TLS handshake. Nothing is opened to a source the mode keeps off; Hyphen is same-origin and needs none.
 */
export function preconnectHostedSources(doc: Document = document): void {
  const search = new URLSearchParams(doc.location?.search ?? '')
  const { net } = parseNetworkParam(
    search.get('network') ?? undefined,
    search.get('net') ?? undefined,
  )
  const origins = new Set<string>()
  for (const source of EARLY) {
    if (sourceOff(source)) continue
    const base = endpoint(net, source)
    if (base?.startsWith('https://')) origins.add(new URL(base).origin)
  }
  for (const origin of origins) {
    const link = doc.createElement('link')
    link.rel = 'preconnect'
    link.href = origin
    link.crossOrigin = 'anonymous'
    doc.head.append(link)
  }
}
