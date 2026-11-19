import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Sourced } from '@/data/envelope'
import type { EpochDto } from '@/data/sdk/methods'
import { useNewestAnswer } from './useLiveSchedule'

const answer = (height: number): Sourced<EpochDto> => ({
  source: 'sdk',
  asOf: height * 1000,
  fetchedAt: height * 1000,
  proved: true,
  height,
  data: {
    index: 88,
    firstBlockTimeMs: 0,
    firstBlockHeight: 1,
    firstCoreBlockHeight: 1,
    feeMultiplierPermille: 1000,
    protocolVersion: 14,
  },
})

describe('useNewestAnswer', () => {
  it('keeps the newest epoch read when a node a block behind answers last, so the figures never move back', () => {
    const first: { a: Sourced<EpochDto> | undefined } = { a: answer(100) }
    const { result, rerender } = renderHook(({ a }) => useNewestAnswer(a), { initialProps: first })
    expect(result.current?.height).toBe(100)
    rerender({ a: answer(101) })
    expect(result.current?.height).toBe(101)
    rerender({ a: answer(100) })
    expect(result.current?.height).toBe(101)
    rerender({ a: undefined })
    expect(result.current?.height).toBe(101)
    rerender({ a: answer(102) })
    expect(result.current?.height).toBe(102)
  })
})
