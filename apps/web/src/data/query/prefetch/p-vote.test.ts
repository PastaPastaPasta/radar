import { describe, expect, it } from 'vitest'
import {
  contestRef,
  customPollsArgs,
  namesDocsArgs,
  peContestsQuery,
  peContestVotesQuery,
  peVotesQuery,
  POLL_BUCKETS,
  upcomingPollsArgs,
} from './p-vote'

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

describe('names query', () => {
  it('searches the normalised prefix under the dash domain, in label order, one row past the page', () => {
    expect(namesDocsArgs('Ali', undefined)).toEqual({
      contractId: DPNS,
      type: 'domain',
      where: [
        ['normalizedParentDomainName', '==', 'dash'],
        ['normalizedLabel', 'startsWith', 'a11'],
      ],
      orderBy: [
        ['normalizedParentDomainName', 'asc'],
        ['normalizedLabel', 'asc'],
      ],
      limit: 26,
    })
  })

  it('browses every name when the search is empty or blank, and resumes after a cursor', () => {
    const args = namesDocsArgs('  ', 'doc-id')
    expect(args.where).toEqual([['normalizedParentDomainName', '==', 'dash']])
    expect(args).toMatchObject({ startAfter: 'doc-id' })
    expect(namesDocsArgs(undefined, undefined)).not.toHaveProperty('startAfter')
  })
})

describe('contest reference', () => {
  it('names a DPNS contest by the parent domain and the normalised label', () => {
    const ref = contestRef('Reza.dash', {})
    expect(ref).toMatchObject({
      label: 'Reza',
      contractId: DPNS,
      type: 'domain',
      index: 'parentNameAndLabel',
      indexValues: ['dash', 'reza'],
      isDpns: true,
    })
  })

  it('takes another contract, type and index from the search, and its label as the only index value', () => {
    const ref = contestRef('thing', { contract: 'C'.repeat(44), type: 'card', index: 'byName' })
    expect(ref).toMatchObject({
      isDpns: false,
      type: 'card',
      index: 'byName',
      indexValues: ['thing'],
    })
  })
})

describe('polls queries', () => {
  it('reads the next end dates in time order without a clock-dependent argument', () => {
    expect(upcomingPollsArgs()).toEqual({ limit: POLL_BUCKETS, orderAscending: true })
  })

  it('bounds a custom range from the start of the first day to the end of the last, in UTC', () => {
    expect(customPollsArgs('2026-11-01', '2026-11-30')).toEqual({
      limit: POLL_BUCKETS,
      orderAscending: true,
      startTimeMs: Date.UTC(2026, 10, 1),
      startTimeIncluded: true,
      endTimeMs: Date.UTC(2026, 10, 30, 23, 59, 59, 999),
      endTimeIncluded: true,
    })
    expect(customPollsArgs(undefined, undefined)).toEqual({
      limit: POLL_BUCKETS,
      orderAscending: true,
    })
  })
})

describe('Platform Explorer queries', () => {
  const base = { page: 1, limit: 25 } as const

  it('asks for active or finished contests only when exactly one is wanted', () => {
    expect(peContestsQuery({ ...base, status: ['active'] })).toMatchObject({
      voting_finished: false,
    })
    expect(peContestsQuery({ ...base, status: ['finished'] })).toMatchObject({
      voting_finished: true,
    })
    expect(peContestsQuery({ ...base, status: ['won'] })).toMatchObject({ voting_finished: true })
    expect(peContestsQuery({ ...base, status: ['active', 'finished'] })).not.toHaveProperty(
      'voting_finished',
    )
    expect(peContestsQuery(base)).toEqual({ limit: 25, order: 'desc' })
  })

  it('sends the contract, type, dates, order and page under PE’s names', () => {
    expect(
      peContestsQuery({
        page: 3,
        limit: 10,
        contract: 'C',
        type: 'domain',
        from: '2026-01-02',
        to: '2026-02-03',
        sort: 'oldest',
      }),
    ).toEqual({
      limit: 10,
      order: 'asc',
      page: 3,
      contract_id: 'C',
      document_type_name: 'domain',
      timestamp_start: '2026-01-02T00:00:00.000Z',
      timestamp_end: '2026-02-03T23:59:59.999Z',
    })
  })

  it('sends vote filters with PE’s numeric choice', () => {
    expect(peVotesQuery({ ...base, voter: 'V', towards: 'T', choice: 'lock', page: 2 })).toEqual({
      limit: 25,
      order: 'desc',
      page: 2,
      voter_identity: 'V',
      towards_identity: 'T',
      choice: 2,
    })
    expect(peVotesQuery({ ...base, choice: 'towards' })).toMatchObject({ choice: 0 })
  })

  it('pages one contest’s votes, newest first, by choice when one is named', () => {
    expect(peContestVotesQuery(1)).toEqual({ limit: 25, order: 'desc' })
    expect(peContestVotesQuery(2, 1)).toEqual({ limit: 25, order: 'desc', page: 2, choice: 1 })
  })
})
