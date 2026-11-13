import { describe, expect, it, vi } from 'vitest'
import { SourceError } from '../errors'
import { createSdkClient, callDeadlineMs, type SdkTransport } from './client'
import type { DevnetConfig } from '@/lib/network'
import type { SdkNetworkConfig } from './methods'
import { createProofStore } from './proof-store'
import type { SdkSettings } from './settings'

function setup(settings: { current: SdkSettings }, hang = false, devnets: DevnetConfig[] = []) {
  const connects: SdkNetworkConfig[] = []
  const dropped = vi.fn()
  const transport: SdkTransport = {
    connect: (cfg) => {
      connects.push(cfg)
      return Promise.resolve({ sdkVersion: '5.0.3', protocolVersion: 14, tookMs: 1 })
    },
    call: () =>
      hang
        ? new Promise(() => undefined)
        : Promise.resolve({ ok: true as const, data: 1n, proved: false, tookMs: 1 }),
    decode: () => Promise.reject(new Error('unused')),
  }
  const client = createSdkClient({
    transport: () => Promise.resolve(transport),
    devnets: () => devnets,
    settings: () => settings.current,
    proofs: createProofStore(),
    health: { report: vi.fn() },
    dropTransport: dropped,
    now: () => 1,
    whenIdle: (fn) => fn(),
  })
  return { client, connects, dropped }
}

describe('SdkClient settings', () => {
  it('connects with the saved tuning and quorum address', async () => {
    const { client, connects } = setup({
      current: {
        quorumUrls: { testnet: 'https://q.example' },
        requestTimeoutMs: 12_000,
        retries: 2,
        banFailedAddress: true,
        logLevel: 'info',
      },
    })
    await client.call('testnet', 'system.totalCredits', {})
    expect(connects[0]).toMatchObject({
      net: 'testnet',
      quorumUrl: 'https://q.example',
      settings: { timeoutMs: 12_000, retries: 2, banFailedAddress: true, logs: 'info' },
    })
  })

  it('connects to a saved devnet by its addresses and quorum list, with the same tuning @NX-75', async () => {
    const { client, connects } = setup(
      { current: { quorumUrls: { testnet: 'https://not-for-devnets.example' }, retries: 1 } },
      false,
      [
        {
          name: 'ruby',
          dapiAddresses: ['192.0.2.10:1443'],
          quorumUrl: 'https://quorums.example.org',
        },
      ],
    )
    await client.call('devnet-ruby', 'system.totalCredits', {})
    expect(connects[0]).toMatchObject({
      net: 'devnet-ruby',
      network: 'devnet',
      devnetName: 'ruby',
      quorumUrl: 'https://quorums.example.org',
      addresses: ['https://192.0.2.10:1443'],
      settings: { retries: 1 },
    })
  })

  it('connects again with the new settings after a restart, on a new worker', async () => {
    const settings = { current: { quorumUrls: {} } as SdkSettings }
    const { client, connects, dropped } = setup(settings)
    await client.call('mainnet', 'system.totalCredits', {})
    expect(client.state('mainnet')).toBe('ready')
    settings.current = { quorumUrls: {}, retries: 5 }
    client.restart()
    expect(dropped).toHaveBeenCalledTimes(1)
    expect(client.state('mainnet')).toBe('cold')
    await client.call('mainnet', 'system.totalCredits', {})
    expect(connects).toHaveLength(2)
    expect(connects[1]?.settings?.retries).toBe(5)
  })

  it('ends a call waiting on the old worker as aborted, not at its deadline', async () => {
    const { client } = setup({ current: { quorumUrls: {} } }, true)
    const pending = client.call('mainnet', 'system.totalCredits', {})
    await vi.waitFor(() => expect(client.state('mainnet')).toBe('ready'))
    client.restart()
    await expect(pending).rejects.toSatisfy((e) => e instanceof SourceError && e.kind === 'aborted')
  })

  it('gives a long request timeout room for the worker’s second try', () => {
    expect(callDeadlineMs(undefined)).toBe(20_000)
    expect(callDeadlineMs(5_000)).toBe(20_000)
    expect(callDeadlineMs(60_000)).toBe(124_000)
  })
})
