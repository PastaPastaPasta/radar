import { useQuery } from '@tanstack/react-query'
import { heightLookup, type BlockRef } from '@/data/pe/blocks-query'
import { peQueries } from '@/data/pe/queries'
import type { NetworkId } from '@/lib/network'

/**
 * One block from Platform Explorer. Explorer opens a block by its hash only, so a height is first turned into a hash
 * by asking the block list for that one height.
 */
export function usePlatformBlock(net: NetworkId, ref: BlockRef) {
  const byHeight = ref.kind === 'height' ? ref.height : undefined
  const lookup = useQuery({
    ...peQueries.blocks(net, heightLookup(byHeight)),
    enabled: byHeight !== undefined,
  })
  const hash = ref.kind === 'hash' ? ref.hash : lookup.data?.data.items[0]?.header.hash
  const block = useQuery({
    ...peQueries.block(net, hash ?? ''),
    enabled: hash !== undefined,
  })
  const missing =
    (byHeight !== undefined && lookup.isSuccess && lookup.data.data.items.length === 0) ||
    (block.isSuccess && block.data.data === null)
  return {
    block,
    lookup,
    missing,
    error: lookup.error ?? block.error,
    refetch: () => {
      void lookup.refetch()
      void block.refetch()
    },
  }
}
