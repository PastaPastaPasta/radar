import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sourced } from '../envelope'
import { isSourceError } from '../errors'
import { healthRegistry, resetHealthRegistry } from '../health'
import { createBatcher } from './batch'

const proved = <T>(data: T): Sourced<T> => ({
  data,
  source: 'sdk',
  asOf: 1_700_000_000_000,
  fetchedAt: 1_700_000_000_000,
  proved: true,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  resetHealthRegistry()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createBatcher with keys missing from the result', () => {
  it('rejects a key the run omitted instead of stamping a proved absence', async () => {
    const batcher = createBatcher<string, number>({
      name: 'identity-balance',
      source: 'sdk',
      maxBatch: 100,
      run: () => Promise.resolve(proved(new Map<string, number | null>([['present', 5]]))),
    })
    const present = batcher.fetch('mainnet', 'present')
    const dropped = batcher.fetch('mainnet', 'dropped').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(15)

    expect((await present).data).toBe(5)
    const error = await dropped
    expect(isSourceError(error) && [error.kind, error.source]).toEqual(['invalid-response', 'sdk'])
  })

  it('still resolves an explicit null as a stamped, proved null', async () => {
    const batcher = createBatcher<string, number>({
      name: 'identity-balance',
      source: 'sdk',
      maxBatch: 100,
      run: () => Promise.resolve(proved(new Map<string, number | null>([['gone', null]]))),
    })
    const p = batcher.fetch('mainnet', 'gone')
    await vi.advanceTimersByTimeAsync(15)
    const out = await p
    expect(out.data).toBeNull()
    expect(out.proved).toBe(true)
  })

  it('reports the omission with the latency of the batch call', async () => {
    const batcher = createBatcher<string, number>({
      name: 'identity-balance',
      source: 'sdk',
      maxBatch: 100,
      run: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(proved(new Map<string, number | null>())), 120),
        ),
    })
    const dropped = batcher.fetch('mainnet', 'x').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(200)
    await dropped

    expect(healthRegistry.get('mainnet', 'sdk').p50LatencyMs).toBe(120)
  })

  it('rejects every waiter of an omitted key and reports the source once', async () => {
    const batcher = createBatcher<string, number>({
      name: 'identity-balance',
      source: 'sdk',
      maxBatch: 100,
      run: () => Promise.resolve(proved(new Map<string, number | null>())),
    })
    const a = batcher.fetch('testnet', 'x').catch((e: unknown) => e)
    const b = batcher.fetch('testnet', 'x').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(15)
    expect(isSourceError(await a) && (await a)).toMatchObject({ kind: 'invalid-response' })
    expect(isSourceError(await b)).toBe(true)

    const health = healthRegistry.get('testnet', 'sdk')
    expect(health.lastError?.kind).toBe('invalid-response')
    expect(health.state).toBe('degraded')
    expect(healthRegistry.get('mainnet', 'sdk').state).toBe('unknown')
  })
})
