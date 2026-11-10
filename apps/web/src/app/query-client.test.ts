import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { queryDefaults } from '@/data/query'
import { createQueryClient } from './query-client'

describe('createQueryClient', () => {
  it('takes the shared retry and polling defaults', () => {
    const queries = createQueryClient().getDefaultOptions().queries
    expect(queries?.retry).toBe(queryDefaults.queries?.retry)
    expect(queries?.retryDelay).toBe(queryDefaults.queries?.retryDelay)
    expect(queries?.refetchOnWindowFocus).toBe(false)
    expect(queries?.refetchIntervalInBackground).toBe(false)
  })

  it('persists through IndexedDB when it is available', () => {
    expect(createQueryClient().getDefaultOptions().queries?.persister).toBeTypeOf('function')
  })
})
