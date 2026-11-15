import { useNetworkSourceHealth } from '@/data/health'
import { useNetwork } from '@/features/entity'
import DevnetUnreachable from '@/features/you/devnet/DevnetUnreachable'
import { isDevnet } from '@/lib/network'

/** Says so, once, when a devnet's DAPI addresses have all failed; nothing shows for any other network or a healthy devnet. */
export function DevnetWatch() {
  const net = useNetwork()
  const down = useNetworkSourceHealth(net, 'dapi').state === 'down'
  return isDevnet(net) && down ? <DevnetUnreachable /> : null
}
