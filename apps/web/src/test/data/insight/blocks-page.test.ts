import { describe, expect, it } from 'vitest'
import type { SourceStamp } from '@/data/envelope'
import { InsBlockListSchema } from '@/data/insight/schemas'
import { fixtureBody } from '@/test/fixtures/load'
import { readInsightPage } from '@/data/insight/blocks-page'

const stamp: SourceStamp = { source: 'insight', asOf: 0, fetchedAt: 0, proved: false }

type Net = 'mainnet' | 'testnet'
interface ListQuery {
  date: string
  limit: number
  startTimestamp: number
}

const slug = (q: ListQuery) =>
  `blocks--blockDate-${q.date},limit-${q.limit},startTimestamp-${q.startTimestamp}`

/** Insight answering from its recorded `/blocks` responses, and the block times those responses hold. */
function recorded(net: Net, headers: Record<number, number>) {
  const asked: ListQuery[] = []
  return {
    asked,
    reads: {
      timeAt: (height: number) =>
        Promise.resolve(headers[height] ? headers[height] * 1000 : undefined),
      list: async (q: ListQuery) => {
        asked.push(q)
        const body = await fixtureBody('insight', net, slug(q))
        return { ...stamp, data: InsBlockListSchema.parse(body) }
      },
    },
  }
}

const heights = (rows: { height: number }[]) => rows.map((r) => r.height)
const run = (top: number, count: number) => Array.from({ length: count }, (_, i) => top - i)

// Mainnet blocks 2,567,398 and 2,567,399 are out of time order: 2,567,399 is the earlier by three seconds. A page
// whose newest-by-time cut falls between them holds 2,567,398 and not 2,567,399.
const INVERSION = { 2567418: 1793914737, 2567399: 1793911437 }
// 2,566,922 is the first block of 5 Nov UTC; 2,566,921 is the last of 4 Nov.
const MIDNIGHT = { 2566930: 1793837711, 2566921: 1793836562 }
const TESTNET_MIDNIGHT = { 1586890: 1794011097, 1586878: 1794009534 }

describe('readInsightPage @IN-02', () => {
  it('reads the block a time inversion hides from the first list, so the page has no gap', async () => {
    const { reads, asked } = recorded('mainnet', INVERSION)
    const first = InsBlockListSchema.parse(
      await fixtureBody(
        'insight',
        'mainnet',
        slug({ date: '2026-11-05', limit: 20, startTimestamp: 1793914737 }),
      ),
    )
    expect(heights(first.blocks)).not.toContain(2567399)
    expect(heights(first.blocks)).toContain(2567398)

    const page = await readInsightPage(2567418, 20, reads)
    expect(heights(page!.rows)).toEqual(run(2567418, 20))
    expect(asked.map((q) => q.limit)).toEqual([20, 1])
  })

  it('reads the day before when a page crosses UTC midnight @IN-02', async () => {
    const { reads, asked } = recorded('mainnet', MIDNIGHT)
    const page = await readInsightPage(2566930, 20, reads)
    expect(heights(page!.rows)).toEqual(run(2566930, 20))
    expect(asked.map((q) => [q.date, q.limit])).toEqual([
      ['2026-11-05', 20],
      ['2026-11-04', 11],
    ])
  })

  it('does the same on testnet with a page of 50 @IN-16', async () => {
    const { reads, asked } = recorded('testnet', TESTNET_MIDNIGHT)
    const page = await readInsightPage(1586890, 50, reads)
    expect(heights(page!.rows)).toEqual(run(1586890, 50))
    expect(asked.map((q) => [q.date, q.limit])).toEqual([
      ['2026-11-07', 50],
      ['2026-11-06', 38],
    ])
  })

  it('returns the contiguous run it has, never a gap, when the next block time cannot be read', async () => {
    const { reads } = recorded('mainnet', { 2567418: 1793914737 })
    const failing = {
      ...reads,
      timeAt: (h: number) =>
        h === 2567418 ? reads.timeAt(h) : Promise.reject(new Error('DAPI is out of budget')),
    }
    const page = await readInsightPage(2567418, 20, failing)
    expect(heights(page!.rows)).toEqual(run(2567418, 19))
  })

  it('stops after a read that finds nothing new', async () => {
    const { reads, asked } = recorded('mainnet', { 2567418: 1793914737, 2567399: 1793914737 })
    const page = await readInsightPage(2567418, 20, reads)
    expect(heights(page!.rows)).toEqual(run(2567418, 19))
    expect(asked).toHaveLength(2)
  })

  it('fails when the first read fails', async () => {
    const { reads } = recorded('mainnet', {})
    await expect(
      readInsightPage(2567418, 20, { ...reads, timeAt: () => Promise.reject(new Error('no')) }),
    ).rejects.toThrow('no')
  })

  it('has no page when the first block time is unknown', async () => {
    const { reads } = recorded('mainnet', {})
    expect(await readInsightPage(2567418, 20, reads)).toBeNull()
  })

  it('returns an empty page for an empty list, not a pending one', async () => {
    const { reads } = recorded('mainnet', {})
    const empty = {
      ...reads,
      timeAt: () => Promise.resolve(1388620800_000),
      list: async () => ({
        ...stamp,
        data: InsBlockListSchema.parse(
          await fixtureBody(
            'insight',
            'mainnet',
            slug({ date: '2014-01-01', limit: 20, startTimestamp: 1388620800 }),
          ),
        ),
      }),
    }
    const page = await readInsightPage(5, 20, empty)
    expect(page?.rows).toEqual([])
  })
})
