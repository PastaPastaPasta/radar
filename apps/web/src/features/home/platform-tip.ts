import { useQuery } from '@tanstack/react-query'
import { mapSourced, type Sourced } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import type { NetworkId } from '@/lib/network'
import { isDevnet } from '@/lib/network'

export interface PlatformTip {
  height: number
  epoch: { number: number; firstBlockHeight: number; startedAt: number }
}

/**
 * The one place the home page reads the Platform tip. Today it comes from Platform Explorer and is stamped
 * `pe`; when the SDK client's `system.status` lands, only this hook's query changes and the stamp turns into
 * "Proof-checked".
 */
export function usePlatformTip(net: NetworkId) {
  return useQuery({
    ...peQueries.status(net),
    enabled: !isDevnet(net),
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
}
