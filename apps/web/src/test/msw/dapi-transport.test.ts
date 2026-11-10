import { describe, expect, it, vi } from 'vitest'
import { isSourceError } from '@/data/errors'
import { takeFixtureMisses } from './handlers/fixtures'
import { FixtureDapiTransport, requestKey } from './dapi-transport'

describe('FixtureDapiTransport', () => {
  it('refuses an unrecorded unary request loudly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const transport = new FixtureDapiTransport()
    const request = new Uint8Array([1, 2, 3])
    const failure = await transport.unary('mainnet', 'getBlock', request).catch((e: unknown) => e)
    expect(isSourceError(failure) && failure.source === 'dapi').toBe(true)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[radar-fixtures]'))
    expect(takeFixtureMisses()).toEqual([
      `DAPI getBlock on mainnet (request ${requestKey(request)})`,
    ])
    error.mockRestore()
  })

  it('refuses an unrecorded stream when it is read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const transport = new FixtureDapiTransport()
    const handle = transport.stream(
      'testnet',
      'subscribeToBlockHeadersWithChainLocks',
      new Uint8Array([9]),
    )
    await expect(handle.messages[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      kind: 'network',
    })
    expect(takeFixtureMisses()).toHaveLength(1)
    error.mockRestore()
  })

  it('steers the budget', () => {
    const transport = new FixtureDapiTransport()
    expect(transport.budget.canAfford('mainnet', 20)).toBe(true)
    transport.budget.setPressure('tight')
    expect(transport.budget.canAfford('mainnet', 1)).toBe(false)
    expect(transport.budget.snapshot().pressure).toBe('tight')
  })
})
