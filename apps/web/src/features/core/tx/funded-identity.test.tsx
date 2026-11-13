import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { sdk } from '@/data/sdk'
import { renderAt } from '../hy-shared/test-utils'
import { fundedIdentityId } from './funded-identity'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const LOCK = '2972859ef7fdc7a52397b7f844d69888414e22dcaa2be2b6e432a81c7b812cf6'
const UNLOCK = '5d0c5900e0e0d260c7b952f2cf0496d274d538c755b1f56e21a72f42c315a63a'
const stamp = { source: 'sdk' as const, asOf: 1, fetchedAt: 1, proved: false }

afterEach(() => vi.restoreAllMocks())

describe('the identity an asset lock creates @X-02', () => {
  it('derives the id Platform gave to a real identity from its funding transaction', async () => {
    await expect(
      fundedIdentityId('7f955461205855279b2c8a4cbd8a8142f5ba47f7a6dde0744a0ae2329c9f25b3', 0),
    ).resolves.toBe('FLBoSLEkmS8GcrqLHH4SGJzf7cVCpbDMNyegExsFjFvM')
    await expect(
      fundedIdentityId('9c89e86162ad4732ba655d770f37443e338ec6a40722e5e8c2d97e3e3b5dd46f', 0),
    ).resolves.toBe('H8RvjxqyPq6EgYWYQsyQvRCtVRyRxbt2P4iZNBrqis1G')
  })

  it('names each credit output with its own id', async () => {
    const ids = await Promise.all([0, 1, 2].map((i) => fundedIdentityId(LOCK, i)))
    expect(new Set(ids).size).toBe(3)
  })

  it('links the identity the lock created, asking Platform whether it exists', async () => {
    const id = await fundedIdentityId(LOCK, 0)
    const asked: string[] = []
    const real = sdk.call.bind(sdk)
    vi.spyOn(sdk, 'call').mockImplementation(async (net, method, args, signal) => {
      if (method !== 'identities.balances') return real(net, method, args, signal)
      const wanted = (args as { ids: string[] }).ids
      asked.push(...wanted)
      return {
        ...stamp,
        data: new Map(wanted.map((w) => [w, w === id ? 1_000_000n : null])),
      }
    })
    renderAt(`/tx/${LOCK}`)
    const row = await waitFor(
      () => {
        const el = screen.getByText('Identity created').closest('div')!
        expect(
          within(el.parentElement!).getByRole('link', { name: new RegExp(id.slice(0, 4)) }),
        ).toBeInTheDocument()
        return el
      },
      { timeout: 8000 },
    )
    expect(row).toBeInTheDocument()
    expect(asked).toContain(id)
  })

  it('says a lock that created nothing was a top-up', async () => {
    const real = sdk.call.bind(sdk)
    vi.spyOn(sdk, 'call').mockImplementation((net, method, args, signal) =>
      method === 'identities.balances'
        ? Promise.resolve({
            ...stamp,
            data: new Map((args as { ids: string[] }).ids.map((w) => [w, null])),
          })
        : real(net, method, args, signal),
    )
    renderAt(`/tx/${LOCK}`)
    expect(
      await screen.findByText(
        /A top-up credits an identity that already existed/,
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument()
  })
})

describe('the Platform side of an asset unlock @X-02', () => {
  it('links to the withdrawals on Platform', async () => {
    renderAt(`/tx/${UNLOCK}`)
    const link = await screen.findByRole(
      'link',
      { name: 'Withdrawals on Platform' },
      { timeout: 8000 },
    )
    expect(link.getAttribute('href')).toMatch(/^\/platform\/txs\?.*type=identity-credit-withdrawal/)
  })
})
