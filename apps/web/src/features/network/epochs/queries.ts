import { queryOptions } from '@tanstack/react-query'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import { dataClass, viewKeys } from '@/data/query'
import { sdk } from '@/data/sdk/client'
import type { NetworkId } from '@/lib/network'

/** Drive answers at most this many proposers per call. */
const PROPOSERS_PAGE = 100
/** More pages than any network has proposers for; a runaway answer stops here. */
const MAX_PROPOSER_PAGES = 8

export interface Proposer {
  proTxHash: string
  blocks: bigint
}

export interface EpochProposers {
  epoch: number
  /** Every proposer of the epoch so far, most blocks first. */
  proposers: Proposer[]
  total: bigint
  pages: number
}

/** A figure assembled from several proof-checked answers is not itself a proof (§3.1): `proved` is false. */
export function combined(parts: readonly SourceStamp[]): SourceStamp {
  const last = parts[parts.length - 1]!
  return {
    source: 'sdk',
    asOf: Math.max(...parts.map((p) => p.asOf)),
    fetchedAt: Math.max(...parts.map((p) => p.fetchedAt)),
    proved: false,
    height: last.height,
    node: last.node,
  }
}

export const byBlocks = (a: Proposer, b: Proposer): number =>
  a.blocks === b.blocks ? (a.proTxHash < b.proTxHash ? -1 : 1) : a.blocks > b.blocks ? -1 : 1

export const epochsQueries = {
  /** Every evonode that proposed a block in the current epoch: pages of 100 by ProTxHash, then ranked here. */
  proposers: (net: NetworkId, epoch: number) =>
    queryOptions({
      queryKey: viewKeys(net, 'chain-proposers', { epoch }),
      queryFn: async ({ signal }): Promise<Sourced<EpochProposers>> => {
        const answers: Sourced<Map<string, bigint>>[] = []
        let startAfter: string | undefined
        for (let page = 0; page < MAX_PROPOSER_PAGES; page++) {
          const answer = await sdk.call(
            net,
            'epoch.evonodesProposedBlocksByRange',
            startAfter === undefined
              ? { epoch, limit: PROPOSERS_PAGE }
              : { epoch, limit: PROPOSERS_PAGE, startAfter },
            signal,
          )
          answers.push(answer)
          if (answer.data.size < PROPOSERS_PAGE) break
          startAfter = [...answer.data.keys()].at(-1)
        }
        const proposers = answers
          .flatMap((a) =>
            [...a.data].map(([proTxHash, blocks]): Proposer => ({ proTxHash, blocks })),
          )
          .sort(byBlocks)
        const total = proposers.reduce((sum, p) => sum + p.blocks, 0n)
        const stamp = answers.length === 1 ? stampOf(answers[0]!) : combined(answers)
        return { ...stamp, data: { epoch, proposers, total, pages: answers.length } }
      },
      ...dataClass('live'),
    }),
}
