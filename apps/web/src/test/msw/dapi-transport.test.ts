import { describe, expect, it } from 'vitest'
import type { Budget } from '@/data/dapi-core'
import { healthRegistry } from '@/data/health'
import { isSourceError } from '@/data/errors'
import { takeFixtureMisses } from './handlers/fixtures'
import { FixtureDapiTransport, requestKey } from './dapi-transport'

describe('FixtureDapiTransport', () => {
  it('refuses an unrecorded unary request loudly', async () => {
    const transport = new FixtureDapiTransport()
    const request = new Uint8Array([1, 2, 3])
    const failure = await transport.unary('mainnet', 'getBlock', request).catch((e: unknown) => e)
    expect(isSourceError(failure) && failure.source === 'dapi').toBe(true)
    expect(takeFixtureMisses()).toEqual([
      `DAPI getBlock on mainnet (request ${requestKey(request)})`,
    ])
  })

  it('refuses an unrecorded stream when it is read', async () => {
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
  })

  it('says a devnet has no node, without counting a missing recording', async () => {
    const transport = new FixtureDapiTransport()
    const failure = await transport
      .unary('devnet-qa', 'getBlockchainStatus', new Uint8Array())
      .catch((e: unknown) => e)
    expect(failure).toMatchObject({ source: 'dapi', kind: 'unavailable' })
    expect(takeFixtureMisses()).toEqual([])
  })

  it('steers the budget', () => {
    const transport = new FixtureDapiTransport()
    const budget: Budget = transport.budget
    expect(budget.canAfford('mainnet', 20)).toBe(true)
    transport.budget.setPressure('tight')
    expect(budget.canAfford('mainnet', 1)).toBe(false)
    expect(transport.budget.snapshot().pressure).toBe('tight')
  })

  it('cuts the connection on request: calls fail without a recording and the source reports down', async () => {
    const transport = new FixtureDapiTransport()
    transport.breakConnection('mainnet')
    const failure = await transport
      .unary('mainnet', 'getBlock', new Uint8Array([4]))
      .catch((e: unknown) => e)
    expect(failure).toMatchObject({ source: 'dapi', kind: 'network' })
    expect(transport.calls).toEqual([])
    expect(takeFixtureMisses()).toEqual([])
    expect(healthRegistry.get('mainnet', 'dapi').state).toBe('down')

    transport.restoreConnection('mainnet')
    expect(healthRegistry.get('mainnet', 'dapi').state).not.toBe('down')
  })
})

describe('a block above the recorded tip', () => {
  it('is not found, as the recorded chain has no such block', async () => {
    const transport = new FixtureDapiTransport()
    const above = new Uint8Array([0x08, 0xbb, 0xf0, 0x9c, 0x01])
    await expect(transport.unary('mainnet', 'getBlock', above)).rejects.toMatchObject({
      kind: 'http',
      status: 5,
    })
  })
})
