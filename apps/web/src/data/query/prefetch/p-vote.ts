// P-VOTE: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { decentralizedOnly } from '@/lib/source-mode'
import { systemContract } from '@/lib/well-known'
import { peQueries } from '../../pe/queries'
import type { PeQuery } from '../../pe/params'
import { sdkQueries } from '../../sdk/queries'
import { prefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

/** DPNS: the contract, the contested document type and its index, and the top-level domain every name sits under. */
export const DPNS = {
  type: 'domain',
  index: 'parentNameAndLabel',
  tld: 'dash',
  contractId: () => systemContract('dpns').id,
} as const

const VALID_LABEL = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]$/
const CONTESTED_LABEL = /^[a-zA-Z01-]{3,19}$/

/** `alice.dash` and `Alice` both give `alice`: the label without the top-level domain. */
export function labelOf(name: string): string {
  return name.trim().replace(/\.dash$/i, '')
}

/** DPNS keeps only this form (lower case; o→0, i and l→1), so a prefix search or a lookup must ask for it. */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/o/g, '0').replace(/[il]/g, '1')
}

export type LabelProblem = 'empty' | 'too-short' | 'too-long' | 'characters' | 'hyphen-edge'

/** Why a label can't be a DPNS name, or `null` when it can. */
export function labelProblem(label: string): LabelProblem | null {
  if (label.length === 0) return 'empty'
  if (label.length < 3) return 'too-short'
  if (label.length > 63) return 'too-long'
  if (!/^[a-zA-Z0-9-]+$/.test(label)) return 'characters'
  return VALID_LABEL.test(label) ? null : 'hyphen-edge'
}

export const isValidLabel = (label: string): boolean => labelProblem(label) === null

/** A name whose normalised form is 3 to 19 characters of a–z, 0, 1 and `-` is given out by a masternode vote. */
export const isContestedLabel = (label: string): boolean =>
  isValidLabel(label) && CONTESTED_LABEL.test(normalizeLabel(label))

/** What names the search page shows at a time. */
export const NAMES_PAGE = 25

/** The documents query for one page of DPNS names; `q` is typed text, searched by its homograph-safe prefix. */
export function namesDocsArgs(q: string | undefined, after: string | undefined) {
  const prefix = normalizeLabel((q ?? '').trim())
  return {
    contractId: DPNS.contractId(),
    type: DPNS.type,
    where: [
      ['normalizedParentDomainName', '==', DPNS.tld],
      ...(prefix ? [['normalizedLabel', 'startsWith', prefix]] : []),
    ] as [string, string, unknown][],
    orderBy: [
      ['normalizedParentDomainName', 'asc'],
      ['normalizedLabel', 'asc'],
    ] as [string, 'asc' | 'desc'][],
    limit: NAMES_PAGE + 1,
    ...(after ? { startAfter: after } : {}),
  }
}

/** The vote polls the polls page (and the active contest list's end times) read: the next end dates, soonest first. */
export const POLL_BUCKETS = 100
export const POLLS_PAGE = 25

export const upcomingPollsArgs = () => ({ limit: POLL_BUCKETS, orderAscending: true })

const DAY_MS = 86_400_000
export const POLL_RANGE_MS: Record<'24h' | '7d' | '30d' | '90d', number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
}

/** A custom range reaches from the start of `from` to the end of `to` (UTC). */
const dayStartMs = (date: string): number => Date.parse(`${date}T00:00:00.000Z`)
const dayEndMs = (date: string): number => Date.parse(`${date}T23:59:59.999Z`)

export function customPollsArgs(from: string | undefined, to: string | undefined) {
  return {
    limit: POLL_BUCKETS,
    orderAscending: true,
    ...(from ? { startTimeMs: dayStartMs(from), startTimeIncluded: true } : {}),
    ...(to ? { endTimeMs: dayEndMs(to), endTimeIncluded: true } : {}),
  }
}

/** The ISO bounds PE takes for a `from`/`to` date filter. */
const peFrom = (from: string | undefined) => (from ? `${from}T00:00:00.000Z` : undefined)
const peTo = (to: string | undefined) => (to ? `${to}T23:59:59.999Z` : undefined)

export const VOTE_CHOICE = { towards: 0, abstain: 1, lock: 2 } as const

export interface ContestsFilters {
  contract?: string | undefined
  type?: string | undefined
  status?: ('active' | 'won' | 'locked' | 'finished')[] | undefined
  page: number
  limit: number
  from?: string | undefined
  to?: string | undefined
  sort?: string | undefined
}

/** PE's contested-resource list for the page's filters: active or finished, newest first unless `sort=oldest`. */
export function peContestsQuery(f: ContestsFilters, page = f.page): PeQuery {
  const q: Record<string, string | number | boolean> = {
    limit: f.limit,
    order: f.sort === 'oldest' ? 'asc' : 'desc',
  }
  if (page > 1) q.page = page
  if (f.contract) q.contract_id = f.contract
  if (f.type) q.document_type_name = f.type
  const wanted = new Set(f.status ?? [])
  const active = wanted.has('active')
  const done = wanted.has('finished') || wanted.has('won') || wanted.has('locked')
  if (active !== done) q.voting_finished = done
  const start = peFrom(f.from)
  const end = peTo(f.to)
  if (start) q.timestamp_start = start
  if (end) q.timestamp_end = end
  return q
}

export interface VotesFilters {
  page: number
  limit: number
  voter?: string | undefined
  towards?: string | undefined
  choice?: 'towards' | 'abstain' | 'lock' | undefined
  from?: string | undefined
  to?: string | undefined
}

export function peVotesQuery(f: VotesFilters): PeQuery {
  const q: Record<string, string | number> = { limit: f.limit, order: 'desc' }
  if (f.page > 1) q.page = f.page
  if (f.voter) q.voter_identity = f.voter
  if (f.towards) q.towards_identity = f.towards
  if (f.choice) q.choice = VOTE_CHOICE[f.choice]
  const start = peFrom(f.from)
  const end = peTo(f.to)
  if (start) q.timestamp_start = start
  if (end) q.timestamp_end = end
  return q
}

/** PE's votes for one contest: a page of them, newest first, for one choice when `towards` names a contender. */
export const PE_CONTEST_VOTES_PAGE = 25

export function peContestVotesQuery(page: number, choice?: number): PeQuery {
  const q: Record<string, string | number> = { limit: PE_CONTEST_VOTES_PAGE, order: 'desc' }
  if (page > 1) q.page = page
  if (choice !== undefined) q.choice = choice
  return q
}

/** What a contest is called in links: DPNS contests by their label, others with their contract, type and index. */
export interface ContestRef {
  label: string
  contractId: string
  type: string
  index: string
  indexValues: string[]
  isDpns: boolean
}

export function contestRef(
  label: string,
  search: { contract?: string | undefined; type?: string | undefined; index?: string | undefined },
): ContestRef {
  const dpnsId = DPNS.contractId()
  const contractId = search.contract ?? dpnsId
  const isDpns = contractId === dpnsId && (search.type ?? DPNS.type) === DPNS.type
  const clean = labelOf(label)
  return {
    label: clean,
    contractId,
    type: search.type ?? DPNS.type,
    index: search.index ?? DPNS.index,
    indexValues: isDpns ? [DPNS.tld, normalizeLabel(clean)] : [clean],
    isDpns,
  }
}

/** What identifies a contest on Platform. */
export type ContestKey = Pick<ContestRef, 'contractId' | 'type' | 'index' | 'indexValues'>

export const contestVoteStateArgs = (ref: ContestKey) => ({
  contractId: ref.contractId,
  type: ref.type,
  index: ref.index,
  indexValues: ref.indexValues,
})

export interface NamesSearch extends RouteSearch {
  q?: string | undefined
  after?: string | undefined
}

export const namesPrefetch: Prefetch<NoParams, NamesSearch> = (net, _params, search) => [
  prefetchItem('sdk', sdkQueries['documents.query'](net, namesDocsArgs(search.q, search.after))),
]

export type NameSearch = RouteSearch

export const namePrefetch: Prefetch<{ label: string }, NameSearch> = (net, { label }) => {
  const clean = labelOf(label)
  return isValidLabel(clean)
    ? [prefetchItem('sdk', sdkQueries['dpns.getUsernameByName'](net, { name: `${clean}.dash` }))]
    : []
}

export interface ContestsSearch extends RouteSearch, ContestsFilters {
  limit: 10 | 25 | 50 | 75 | 100
}

export const contestsPrefetch: Prefetch<NoParams, ContestsSearch> = (net, _params, search) =>
  decentralizedOnly()
    ? []
    : [
        prefetchItem('http', peQueries.contestedResources(net, peContestsQuery(search)), {
          wait: true,
        }),
        prefetchItem('http', peQueries.contestedResourcesStats(net)),
      ]

export interface ContestSearch extends RouteSearch {
  contract?: string | undefined
  type?: string | undefined
  index?: string | undefined
  tab: 'tally' | 'votes' | 'raw'
  towards?: string | undefined
  page: number
}

export const contestPrefetch: Prefetch<{ label: string }, ContestSearch> = (
  net,
  { label },
  search,
) => {
  const ref = contestRef(label, search)
  return [
    prefetchItem(
      'sdk',
      sdkQueries['voting.contestedResourceVoteState'](net, contestVoteStateArgs(ref)),
    ),
    ...(decentralizedOnly()
      ? []
      : [prefetchItem('http', peQueries.contestedResource(net, ref.indexValues))]),
  ]
}

export interface VotesSearch extends RouteSearch, VotesFilters {
  limit: 10 | 25 | 50 | 75 | 100
}

export const votesPrefetch: Prefetch<NoParams, VotesSearch> = (net, _params, search) =>
  decentralizedOnly()
    ? []
    : [prefetchItem('http', peQueries.masternodeVotes(net, peVotesQuery(search)), { wait: true })]

export interface PollsSearch extends RouteSearch {
  range: '24h' | '7d' | '30d' | '90d' | 'upcoming' | 'custom'
  from?: string | undefined
  to?: string | undefined
  dir: 'asc' | 'desc'
  page: number
}

export const pollsPrefetch: Prefetch<NoParams, PollsSearch> = (net, _params, search) => [
  prefetchItem(
    'sdk',
    sdkQueries['voting.votePollsByEndDate'](
      net,
      search.range === 'custom' ? customPollsArgs(search.from, search.to) : upcomingPollsArgs(),
    ),
  ),
]
