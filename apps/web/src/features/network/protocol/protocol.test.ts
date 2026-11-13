import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { ACTIVATION_SHARE, protocolQueries, tallyOf, thresholdOf } from './queries'

const call = vi.hoisted(() => vi.fn())
vi.mock('@/data/sdk/client', () => ({ sdk: { call } }))

const answer = (entries: [string, number][], height = 100) => ({
  data: new Map(entries),
  source: 'sdk' as const,
  asOf: height,
  fetchedAt: height,
  proved: true,
  height,
})

const hash = (n: number) => n.toString(16).padStart(64, '0')

afterEach(() => {
  call.mockReset()
})

describe('thresholds', () => {
  it('needs two thirds of the evonodes, rounded up, as Radar counts them', () => {
    expect(ACTIVATION_SHARE).toBe(0.67)
    expect(thresholdOf(363)).toBe(244)
    expect(thresholdOf(42)).toBe(29)
    expect(thresholdOf(0)).toBe(0)
  })

  it('tallies evonodes per version', () => {
    expect(
      tallyOf([
        { proTxHash: 'a', version: 14 },
        { proTxHash: 'b', version: 15 },
        { proTxHash: 'c', version: 14 },
      ]),
    ).toEqual(
      new Map([
        [14, 2],
        [15, 1],
      ]),
    )
  })
})

describe('protocolQueries.votes', () => {
  const run = (net: 'mainnet' = 'mainnet') => {
    const client = new QueryClient()
    const q = protocolQueries.votes(net)
    return client.fetchQuery(q)
  }

  it('reads one page when the node answers fewer than a full one', async () => {
    call.mockResolvedValueOnce(
      answer([
        [hash(1), 14],
        [hash(2), 15],
      ]),
    )
    const out = await run()
    expect(call).toHaveBeenCalledTimes(1)
    expect(call.mock.calls[0]![2]).toEqual({ count: 100 })
    expect(out.data.rows).toHaveLength(2)
    expect(out.data.pages).toBe(1)
    expect(stampOf(out).proved).toBe(true)
  })

  it('pages from the last node of a full page, counts the repeated first node once and says the figure is combined', async () => {
    const first = Array.from({ length: 100 }, (_, i): [string, number] => [hash(i), 14])
    const second: [string, number][] = [
      [hash(99), 14],
      [hash(100), 15],
      [hash(101), 15],
    ]
    call.mockResolvedValueOnce(answer(first)).mockResolvedValueOnce(answer(second, 101))
    const out = await run()
    expect(call).toHaveBeenCalledTimes(2)
    expect(call.mock.calls[1]![2]).toEqual({ startProTxHash: hash(99), count: 100 })
    expect(out.data.rows).toHaveLength(102)
    expect(out.data.tally.get(15)).toBe(2)
    expect(out.data.pages).toBe(2)
    expect(stampOf(out).proved).toBe(false)
  })

  it('stops when a full page adds nothing new', async () => {
    const page = Array.from({ length: 100 }, (_, i): [string, number] => [hash(i), 14])
    call.mockResolvedValue(answer(page))
    const out = await run()
    expect(call).toHaveBeenCalledTimes(2)
    expect(out.data.rows).toHaveLength(100)
  })
})
