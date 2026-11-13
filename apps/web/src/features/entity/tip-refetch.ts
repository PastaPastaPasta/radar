import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { NetworkId } from '@/lib/network'

/**
 * Reads the queries in `keys` again each time `height`, the live Core tip, rises on the same network, unless `settled`.
 * A detail page uses it to refresh itself until it settles; the home page uses it for the figures no stream pushes.
 * A height that falls or repeats, or the first one seen after a network change, is not a new block.
 */
export function useRefetchOnRise(
  net: NetworkId,
  height: number | undefined,
  { keys, settled = false }: { keys: readonly QueryKey[]; settled?: boolean },
): void {
  const queryClient = useQueryClient()
  const last = useRef<{ net: NetworkId; height: number | undefined }>(undefined)
  const wanted = useRef(keys)

  useEffect(() => {
    wanted.current = keys
  })

  useEffect(() => {
    const previous = last.current
    last.current = { net, height }
    if (
      settled ||
      height === undefined ||
      previous?.net !== net ||
      previous.height === undefined ||
      height <= previous.height
    ) {
      return
    }
    for (const queryKey of wanted.current) {
      void queryClient.invalidateQueries({ queryKey, exact: true })
    }
  }, [net, height, settled, queryClient])
}

/** Pauses between the re-reads of a figure that trails the tip: the index takes a few seconds to take in a block. */
export const CATCH_UP_DELAYS_MS = [3_000, 6_000, 12_000] as const

/**
 * Re-reads `key` while the data it holds (`dataHeight`) is below the tip, after each delay in CATCH_UP_DELAYS_MS, then
 * waits for the next block. A read that never catches up costs three requests per block, not a poll.
 */
export function useCatchUpToTip(
  net: NetworkId,
  {
    key,
    tipHeight,
    dataHeight,
    enabled = true,
  }: {
    key: QueryKey
    tipHeight: number | undefined
    dataHeight: number | undefined
    enabled?: boolean
  },
): void {
  const queryClient = useQueryClient()
  const current = useRef({ key, dataHeight })
  useEffect(() => {
    current.current = { key, dataHeight }
  })
  const loaded = dataHeight !== undefined

  useEffect(() => {
    if (!enabled || !loaded || tipHeight === undefined) return
    const behind = () => (current.current.dataHeight ?? Infinity) < tipHeight
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = (n: number) => {
      const delay = CATCH_UP_DELAYS_MS[n]
      if (delay === undefined || !behind()) return
      timer = setTimeout(() => {
        if (!behind()) return
        void queryClient.invalidateQueries({ queryKey: current.current.key, exact: true })
        attempt(n + 1)
      }, delay)
    }
    attempt(0)
    return () => clearTimeout(timer)
  }, [net, tipHeight, enabled, loaded, queryClient])
}
