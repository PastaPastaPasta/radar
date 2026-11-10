import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { isSourceError } from '@/data/errors'
import { healthRegistry } from '@/data/health'
import { pe } from '@/data/pe/client'

const MAIN = 'https://api.pe.dashhq.org'

describe('pe.status health reporting', () => {
  it('reports one failure per probe when PE answers 503 with only an error', async () => {
    await pe.status('mainnet')
    server.use(
      http.get(`${MAIN}/status`, () => HttpResponse.json({ error: 'down' }, { status: 503 })),
    )

    for (let i = 0; i < 2; i++) {
      const e = await pe.status('mainnet').catch((error: unknown) => error)
      expect(isSourceError(e) && [e.kind, e.status]).toEqual(['http', 503])
    }
    expect(healthRegistry.get('mainnet', 'pe').state).not.toBe('down')

    await pe.status('mainnet').catch(() => undefined)
    const h = healthRegistry.get('mainnet', 'pe')
    expect(h.state).toBe('down')
    expect(h.lastError).toMatchObject({ kind: 'http' })
  })

  it('does not fill the latency window with zeros', async () => {
    server.use(
      http.get(`${MAIN}/status`, () => HttpResponse.json({ error: 'down' }, { status: 503 })),
    )
    await pe.status('mainnet').catch(() => undefined)
    expect(healthRegistry.get('mainnet', 'pe').p50LatencyMs).toBeGreaterThan(0)
  })

  it('recovers on the next healthy status', async () => {
    server.use(
      http.get(`${MAIN}/status`, () => HttpResponse.json({ error: 'down' }, { status: 503 })),
    )
    for (let i = 0; i < 3; i++) await pe.status('mainnet').catch(() => undefined)
    expect(healthRegistry.get('mainnet', 'pe').state).toBe('down')
    server.resetHandlers()
    await pe.status('mainnet')
    expect(healthRegistry.get('mainnet', 'pe').state).not.toBe('down')
  })
})
