import { describe, expect, it } from 'vitest'
import { peParams, rangeText, sortOf } from './contracts-query'

const base = { page: 1, limit: 25 as const, sort: '-created' }

describe('contracts list query', () => {
  it('asks the newest first by default, with no filter', () => {
    expect(peParams(base, 1, 25)).toEqual({
      page: 1,
      limit: 25,
      order: 'desc',
      order_by: 'block_height',
      owner: undefined,
      is_system: undefined,
      with_tokens: undefined,
      documents_count_min: undefined,
      documents_count_max: undefined,
      timestamp_start: undefined,
      timestamp_end: undefined,
    })
  })

  it('sends each filter under Platform Explorer’s own name', () => {
    const q = peParams(
      {
        ...base,
        sort: 'docs',
        owner: 'abc',
        system: true,
        tokens: true,
        docs: { min: 5, max: 20 },
        from: '2026-01-02',
        to: '2026-02-03',
      },
      3,
      50,
    )
    expect(q).toMatchObject({
      page: 3,
      limit: 50,
      order: 'asc',
      order_by: 'documents_count',
      owner: 'abc',
      is_system: 'true',
      with_tokens: 'true',
      documents_count_min: '5',
      documents_count_max: '20',
      timestamp_start: '2026-01-02T00:00:00.000Z',
      timestamp_end: '2026-02-03T23:59:59.999Z',
    })
  })

  it('reads a sort and writes a range', () => {
    expect(sortOf('-docs')).toEqual({ name: 'docs', desc: true })
    expect(sortOf('nonsense')).toEqual({ name: 'created', desc: false })
    expect(rangeText({ min: 3 })).toBe('3..')
    expect(rangeText(undefined)).toBeUndefined()
  })
})
