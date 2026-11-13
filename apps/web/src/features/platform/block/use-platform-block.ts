import { useQuery } from '@tanstack/react-query'
import { peQueries } from '@/data/pe/queries'
import type { NetworkId } from '@/lib/network'

import { HASH, HEIGHT } from '@/data/pe/blocks-query'

export type BlockRef = { kind: 'hash'; hash: string } | { kind: 'height'; height: number }

export function parseBlockRef(id: string): BlockRef | undefined {
  if (HASH.test(id)) return { kind: 'hash', hash: id.toLowerCase() }
  if (HEIGHT.test(id)) return { kind: 'height', height: Number(id) }
  return undefined
}

/**
 * One block from Platform Explorer. Explorer opens a block by its hash only, so a height is first turned into a hash
 * by asking the block list for that one height.
 */
export function usePlatformBlock(net: NetworkId, ref: BlockRef | undefined, enabled: boolean) {
  const byHeight = ref?.kind === 'height' ? ref.height : undefined
  const lookup = useQuery({
    ...peQueries.blocks(net, {
      height_min: byHeight,
      height_max: byHeight,
      limit: 1,
      order: 'desc',
    }),
    enabled: enabled && byHeight !== undefined,
  })
  const hash =
    ref?.kind === 'hash' ? ref.hash : lookup.data?.data.items[0]?.header.hash
  const block = useQuery({
    ...peQueries.block(net, hash ?? ''),
    enabled: enabled && hash !== undefined,
  })
  const missing =
    (byHeight !== undefined && lookup.isSuccess && lookup.data.data.items.length === 0) ||
    (block.isSuccess && block.data.data === null)
  return {
    block,
    lookup,
    missing,
    pending: byHeight !== undefined ? lookup.isPending || (hash !== undefined && block.isPending) : block.isPending,
    error: lookup.error ?? block.error,
    refetch: () => {
      void lookup.refetch()
      void block.refetch()
    },
  }
}
