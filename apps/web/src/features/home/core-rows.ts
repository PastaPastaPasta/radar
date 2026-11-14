import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import { keepPreviousOnNetwork } from '@/features/entity'
import type { NetworkId } from '@/lib/network'

const CORE_ROWS = 12

/** The newest Core blocks, read from the tip down once the tip is known. */
export function useCoreRows(net: NetworkId, tipHeight: number | undefined) {
  return useQuery({
    ...coreQueries.blockRows(net, { fromHeight: tipHeight ?? 0, count: CORE_ROWS }),
    enabled: tipHeight !== undefined,
    placeholderData: keepPreviousOnNetwork(net),
  })
}
