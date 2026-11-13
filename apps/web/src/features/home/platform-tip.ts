import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { mapSourced, type FallbackReason, type Sourced } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { platformTipQuery, type PlatformTip } from '@/data/sdk/queries'
import type { NetworkId } from '@/lib/network'
import { isDevnet } from '@/lib/network'

export type { PlatformTip }

/** True once the browser has had an idle moment after first paint, so loading the SDK never competes with it (§3.3). */
function useAfterIdle(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback
    const cancel = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
    if (!ric) {
      const timer = setTimeout(() => setIdle(true), 1)
      return () => clearTimeout(timer)
    }
    const id = ric(() => setIdle(true))
    return () => cancel?.(id)
  }, [])
  return idle
}

/**
 * The home page's Platform height and epoch (§3.3). The proof-checked SDK answer wins; until it lands, Platform
 * Explorer's figure stands in, stamped `sdk-cold` (or `sdk-down` once the SDK has failed). Devnets have no Platform
 * Explorer, and Decentralized only mode doesn't ask it, so both show the SDK answer or nothing.
 */
export function usePlatformTip(net: NetworkId) {
  const sdkOnly = useDecentralizedOnly() || isDevnet(net)
  const afterIdle = useAfterIdle()
  const sdkTip = useQuery({ ...platformTipQuery(net), enabled: afterIdle })
  const explorerTip = useQuery({
    ...peQueries.status(net),
    enabled: !sdkOnly && !sdkTip.data,
    select: (s): Sourced<PlatformTip> =>
      mapSourced(s, (d) => ({
        height: d.tenderdash.block.height,
        epoch: {
          number: d.epoch.number,
          firstBlockHeight: Number(d.epoch.firstBlockHeight),
          startedAt: d.epoch.startTime,
        },
      })),
  })
  if (sdkTip.data) return { data: sdkTip.data, isError: false, sdkOnly }
  const fallback: FallbackReason = sdkTip.isError ? 'sdk-down' : 'sdk-cold'
  return {
    data: explorerTip.data ? { ...explorerTip.data, fallback } : undefined,
    isError: sdkTip.isError && (explorerTip.isError || sdkOnly),
    sdkOnly,
  }
}
