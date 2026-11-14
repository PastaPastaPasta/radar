import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import { mapSourced, type Sourced } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { useIndexHealth } from '@/data/index-health'
import { hyQueries } from '@/data/hyphen/queries'
import { radarQueries } from '@/data/radar/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { systemContract } from '@/lib/well-known'
import { isDevnet, type NetworkId } from '@/lib/network'
import { dapiFacts, protxToBase58, type DapiFacts } from './mn-info'

/** DAPI's list entry for one ProTx; `null` when the list has none. Never refused by the mode. */
export function useDapiFacts(net: NetworkId, protx: string) {
  return useQuery({
    ...coreQueries.masternodeList(net),
    select: (s): Sourced<DapiFacts | null> =>
      mapSourced(s, (list) => {
        const entry = list.get(protx) ?? list.get(protx.toUpperCase())
        return entry ? dapiFacts(entry) : null
      }),
  })
}

/** Radar's record, switched off in Decentralized only mode. */
export function useRadarRecord(net: NetworkId, protx: string) {
  const off = useDecentralizedOnly()
  return useQuery({ ...radarQueries.masternode(net, protx), enabled: !off && !isDevnet(net) })
}

/** The recent epochs the epoch record and the comparison look at. */
const EPOCH_WINDOW = 12

export function usePlatformLive(net: NetworkId, protx: string) {
  /** The identity an evonode keeps its Platform balance in: its ProTx written in base58. */
  const id = protxToBase58(protx)
  const current = useQuery(sdkQueries['epoch.current'](net, {}))
  const epoch = current.data?.data.index
  const balance = useQuery(sdkQueries['identities.balances'](net, { ids: [id] }))
  const thisEpoch = useQuery({
    ...sdkQueries['epoch.evonodesProposedBlocksByIds'](net, {
      epoch: epoch ?? 0,
      proTxHashes: [protx],
    }),
    enabled: epoch !== undefined,
  })
  const finalized = useQuery({
    ...sdkQueries['epoch.finalizedInfos'](net, {
      startEpoch: Math.max(0, (epoch ?? 0) - EPOCH_WINDOW),
      count: EPOCH_WINDOW,
      ascending: true,
    }),
    enabled: epoch !== undefined,
  })
  const vote = useQuery(
    sdkQueries['protocol.versionUpgradeVoteStatus'](net, { startProTxHash: protx, count: 1 }),
  )
  const withdrawals = useQuery(
    sdkQueries['documents.query'](net, {
      contractId: systemContract('withdrawals').id,
      type: 'withdrawal',
      where: [['$ownerId', '==', id]],
      orderBy: [
        ['status', 'asc'],
        ['$createdAt', 'asc'],
      ],
      limit: 100,
    }),
  )
  return { id, current, balance, thisEpoch, finalized, vote, withdrawals }
}

/** The special transactions Hyphen has for a ProTx, read only while Hyphen's index is fit. */
export function useSpecialTxs(net: NetworkId, protx: string) {
  const index = useIndexHealth(net)
  const enabled = !index.off && !isDevnet(net) && index.probed && index.state !== 'stale'
  const query = useQuery({ ...hyQueries.validator(net, protx), enabled })
  return { index, query, enabled }
}
