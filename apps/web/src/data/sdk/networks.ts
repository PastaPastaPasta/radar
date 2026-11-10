import { isDevnet, type DevnetConfig, type NetworkId } from '@/lib/network'
import { endpoint } from '../endpoints'
import type { SdkNetworkConfig } from './methods'

/** Trust context and node list for a network (§3.1); devnets come from the saved configuration. */
export function sdkConfigFor(
  net: NetworkId,
  devnets: readonly DevnetConfig[] = [],
): SdkNetworkConfig | null {
  if (!isDevnet(net)) return { net, network: net }
  const name = net.replace(/^devnet-/, '')
  const config = devnets.find((d) => d.name === name)
  if (!config) return null
  const quorumUrl = endpoint(net, 'quorums', devnets)
  return {
    net,
    network: 'devnet',
    devnetName: name,
    ...(quorumUrl ? { quorumUrl } : {}),
    addresses: config.dapiAddresses.map((a) => (a.startsWith('http') ? a : `https://${a}`)),
  }
}
