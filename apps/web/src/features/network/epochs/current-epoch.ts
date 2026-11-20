import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { earlyAnswers } from '@/data/early'
import { mapSourced, type Sourced } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { isDevnet, type NetworkId } from '@/lib/network'

const NONE = {}

/** The current epoch as the page shows it. Platform Explorer's status names no protocol version. */
export interface EpochNow {
  index: number
  firstBlockTimeMs: number
  firstBlockHeight: number
  feeMultiplierPermille?: number
  protocolVersion?: number
}

/**
 * The current epoch (RA-60): the proof-checked SDK read, which starts once the page is idle (§3.3). Until it lands,
 * Platform Explorer's status stands in, stamped `sdk-cold` (`sdk-down` once the SDK has failed), with the Platform
 * height it was read at. Devnets have no Platform Explorer and Decentralized only mode doesn't ask it.
 */
export function useCurrentEpoch(net: NetworkId, sdkEnabled: boolean) {
  const sdk = useQuery({ ...sdkQueries['epoch.current'](net, NONE), enabled: sdkEnabled })
  const sdkOnly = useDecentralizedOnly() || isDevnet(net) || !earlyAnswers()
  const explorer = useQuery({
    ...peQueries.status(net),
    enabled: !sdkOnly && !sdk.data,
    select: (s): Sourced<EpochNow> => ({
      ...mapSourced(s, (d) => ({
        index: d.epoch.number,
        firstBlockTimeMs: d.epoch.startTime,
        firstBlockHeight: d.epoch.firstBlockHeight,
        ...(d.epoch.feeMultiplier != null ? { feeMultiplierPermille: d.epoch.feeMultiplier } : {}),
      })),
      height: s.data.tenderdash.block.height,
      heightChain: 'platform',
    }),
  })
  const result = sdk as UseQueryResult<Sourced<EpochNow>>
  if (sdk.data || sdkOnly || !explorer.data) return result
  return {
    ...result,
    data: { ...explorer.data, fallback: sdk.isError ? 'sdk-down' : 'sdk-cold' },
    isError: false,
  } as UseQueryResult<Sourced<EpochNow>>
}
