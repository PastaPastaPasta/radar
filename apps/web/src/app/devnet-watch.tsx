import { ErrorBoundary } from '@/app/error-boundary'
import { useNetworkSourceHealth } from '@/data/health'
import { useNetwork } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { deferred } from '@/ui/deferred'

const Unreachable = deferred(() =>
  import('@/features/you/devnet/DevnetUnreachable').then((m) => m.default),
)

/** Says so, once, when a devnet's DAPI addresses have all failed; nothing loads for any other network or a healthy devnet. */
export function DevnetWatch() {
  const net = useNetwork()
  const down = useNetworkSourceHealth(net, 'dapi').state === 'down'
  if (!isDevnet(net) || !down) return null
  return (
    <ErrorBoundary fallback={() => null}>
      <Unreachable />
    </ErrorBoundary>
  )
}
