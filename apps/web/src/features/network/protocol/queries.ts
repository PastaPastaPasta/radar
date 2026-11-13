import { queryOptions } from '@tanstack/react-query'
import { stampOf, type Sourced } from '@/data/envelope'
import { dataClass, viewKeys } from '@/data/query'
import { sdk } from '@/data/sdk/client'
import { combined } from '@/features/network/epochs/queries'
import type { NetworkId } from '@/lib/network'

/** Evonodes per call; the SDK starts a page at (and includes) the ProTxHash it is given. */
const VOTES_PAGE = 100
/** More pages than any network has evonodes for; a runaway answer stops here. */
const MAX_PAGES = 8

export interface VoteRow {
  proTxHash: string
  version: number
}

export interface Votes {
  rows: VoteRow[]
  /** Evonodes per protocol version they vote for. */
  tally: Map<number, number>
  pages: number
}

export function tallyOf(rows: readonly VoteRow[]): Map<number, number> {
  const tally = new Map<number, number>()
  for (const r of rows) tally.set(r.version, (tally.get(r.version) ?? 0) + 1)
  return tally
}

/** The share of evonodes whose vote activates a Platform protocol version. */
export const ACTIVATION_SHARE = 0.67

/** Evonodes needed to activate: the share of all evonodes, rounded up. */
export const thresholdOf = (evonodes: number): number => Math.ceil(evonodes * ACTIVATION_SHARE)

export const protocolQueries = {
  /** Every evonode's vote: pages of 100 by ProTxHash, the SDK repeating the page's first node as the last one before. */
  votes: (net: NetworkId) =>
    queryOptions({
      queryKey: viewKeys(net, 'chain-votes'),
      queryFn: async ({ signal }): Promise<Sourced<Votes>> => {
        const answers: Sourced<Map<string, number>>[] = []
        const seen = new Map<string, number>()
        let start: string | undefined
        for (let page = 0; page < MAX_PAGES; page++) {
          const answer = await sdk.call(
            net,
            'protocol.versionUpgradeVoteStatus',
            start === undefined
              ? { count: VOTES_PAGE }
              : { startProTxHash: start, count: VOTES_PAGE },
            signal,
          )
          answers.push(answer)
          const before = seen.size
          for (const [proTxHash, version] of answer.data) seen.set(proTxHash, version)
          if (answer.data.size < VOTES_PAGE || seen.size === before) break
          start = [...answer.data.keys()].at(-1)
        }
        const rows = [...seen].map(([proTxHash, version]): VoteRow => ({ proTxHash, version }))
        const stamp = answers.length === 1 ? stampOf(answers[0]!) : combined(answers)
        return { ...stamp, data: { rows, tally: tallyOf(rows), pages: answers.length } }
      },
      ...dataClass('live'),
    }),
}
