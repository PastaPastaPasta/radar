import { describe, expect, it } from 'vitest'
import { peQueries } from '@/data/pe/queries'

describe('peQueries.verifyTransaction', () => {
  it('is a dry run that is sent once, not again on focus, reconnect or failure', () => {
    const options = peQueries.verifyTransaction('mainnet', 'AAEC')
    expect(options).toMatchObject({
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    })
  })
})
