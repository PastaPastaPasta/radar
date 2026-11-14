import { useQuery } from '@tanstack/react-query'
import { sdkQueries } from '@/data/sdk/queries'
import { useNetwork } from '@/features/entity'
import { systemContract } from '@/lib/well-known'

/** Withdrawal statuses a mined asset unlock can have: Platform's COMPLETE, and BROADCASTED before Core confirms. */
const COMPLETE = 3
const BROADCASTED = 2

/**
 * The Withdrawals document behind an asset unlock. The contract indexes `[status, transactionIndex]`, so the unlock's
 * `index` is asked for under one status at a time, proof-checked; a broadcast one is asked for only when none is complete.
 */
export function useWithdrawalDocument(index: number | undefined) {
  const net = useNetwork()
  const contractId = systemContract('withdrawals').id
  const ask = (status: number) =>
    sdkQueries['documents.query'](net, {
      contractId,
      type: 'withdrawal',
      where: [
        ['status', '==', status],
        ['transactionIndex', '==', index],
      ],
      orderBy: [
        ['status', 'asc'],
        ['transactionIndex', 'asc'],
      ],
      limit: 2,
    })
  const complete = useQuery({ ...ask(COMPLETE), enabled: index !== undefined })
  const broadcast = useQuery({
    ...ask(BROADCASTED),
    enabled: index !== undefined && complete.isSuccess && complete.data.data.length === 0,
  })
  const answered = complete.data?.data.length ? complete : broadcast
  const document = answered.data?.data[0]
  const pending =
    index !== undefined &&
    !document &&
    (complete.isPending ||
      (complete.isSuccess && complete.data.data.length === 0 && broadcast.isPending))
  const failed = complete.isError || broadcast.isError
  return { document, contractId, pending, failed, source: answered.data }
}
