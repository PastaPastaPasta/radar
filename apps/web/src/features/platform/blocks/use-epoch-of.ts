import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { sdkQueries } from '@/data/sdk/queries'
import { useNetwork } from '@/features/entity'

/** Epochs asked for, newest first, to name the epoch of each block shown. */
const EPOCH_WINDOW = 100

interface EpochStart {
  index: number
  firstBlockHeight: number
}

/** The epoch a block belongs to: the last epoch that started at or before its height; `undefined` before the first one listed. */
export function epochForHeight(epochs: readonly EpochStart[], height: number): number | undefined {
  let found: number | undefined
  let start = -1
  for (const e of epochs) {
    if (e.firstBlockHeight <= height && e.firstBlockHeight > start) {
      found = e.index
      start = e.firstBlockHeight
    }
  }
  return found
}

/** The query, when it has an error and nothing to show for it; a failed refresh that left an answer in place is not missing. */
const failed = <Q extends { isError: boolean; data: unknown }>(q: Q): Q | undefined =>
  q.isError && q.data === undefined ? q : undefined

/** The epoch of a block, read from the proof-checked list of the most recent epochs. */
export function useEpochOf() {
  const net = useNetwork()
  const current = useQuery(sdkQueries['epoch.current'](net, {}))
  const index = current.data?.data.index
  const infos = useQuery({
    ...sdkQueries['epoch.epochsInfo'](net, {
      startEpoch: index ?? 0,
      count: EPOCH_WINDOW,
      ascending: false,
    }),
    enabled: index !== undefined,
  })
  const epochs = useMemo(() => infos.data?.data ?? [], [infos.data])
  return {
    /** Undefined until the list has arrived. */
    epochOf: useMemo(
      () => (epochs.length > 0 ? (height: number) => epochForHeight(epochs, height) : undefined),
      [epochs],
    ),
    stamp: infos.data,
    /** Why the epoch list is missing, while it is. */
    missing: epochs.length === 0 ? (failed(current) ?? failed(infos)) : undefined,
  }
}
