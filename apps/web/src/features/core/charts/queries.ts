import type { NetworkId } from '@/lib/network'
import { hyQueries } from '@/data/hyphen/queries'
import { rangeWindow, type Range } from './ranges'

export const chartQueries = {
  latest: hyQueries.metricsLatest,
  /** Waits for the chain height when the range is all-time, which is sized to it. */
  series: (net: NetworkId, range: Range, tipHeight: number | undefined) => {
    const window = rangeWindow(range, tipHeight)
    return {
      ...hyQueries.metricsChart(net, window ?? rangeWindow('1d', undefined)),
      enabled: window !== undefined,
    }
  },
}
