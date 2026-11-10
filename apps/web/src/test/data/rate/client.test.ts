import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { isSourceError } from '@/data/errors'
import { healthRegistry } from '@/data/health'
import { rate } from '@/data/rate/client'
import { rateQueries } from '@/data/rate/queries'

describe('rate client', () => {
  it('reads USD per DASH from the mainnet explorer', async () => {
    const out = await rate.usd()
    expect(out.source).toBe('rate')
    expect(out.data).toEqual({ usd: 47.07, provider: 'Kucoin' })
    expect(out.fetchedAt).toBeGreaterThan(0)
    expect(healthRegistry.get('mainnet', 'rate').state).toBe('ok')
  })

  it('rejects a body without a numeric price', async () => {
    server.use(
      http.get('https://api.pe.dashhq.org/rate', () =>
        HttpResponse.json({ usd: 'n/a', source: 'x' }),
      ),
    )
    const e = await rate.usd().catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('invalid-response')
  })

  it('has one query that is the same on every network', () => {
    expect(rateQueries.usd().queryKey).toEqual(['mainnet', 'rate', 'usd'])
  })
})
