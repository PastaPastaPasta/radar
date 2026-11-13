import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { renderAt } from '../identity/test-utils'

const TOKEN = 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB'
const HOLDER = '3NQNyo6DAtXxdWjG4pKxyi51yis9k19UgbtYxZSmFrAh'

afterEach(() => vi.restoreAllMocks())

type Moment = { type: 'block'; blockHeight: bigint } | { type: 'epoch'; epochIndex: number } | null

/** The recorded contract, with a perpetual distribution added to the token and the node's answer for the last claim set. */
function stubDistribution(claim: Moment) {
  const real = sdk.call.bind(sdk)
  const spy = vi.spyOn(sdk, 'call')
  const asked: unknown[] = []
  spy.mockImplementation(async (net, method, args, signal) => {
    if (method === 'tokens.perpetualDistributionLastClaim') {
      asked.push(args)
      const template = (await real(net, 'tokens.contractInfo', { tokenId: TOKEN }, signal)) as {
        data: unknown
      }
      return { ...template, data: claim } as never
    }
    const out = (await real(net, method, args, signal)) as { data: unknown }
    if (method === 'contracts.fetch') {
      const contract = out.data as { tokens: { config: Record<string, unknown> }[] }
      for (const t of contract.tokens) {
        t.config = {
          ...t.config,
          distributionRules: {
            perpetualDistribution: { distributionType: { $type: 'BlockBasedDistribution' } },
          },
        }
      }
    }
    return out as never
  })
  return asked
}

describe('Last claim of a perpetual distribution @NX-32', () => {
  it('asks for an identity before looking up a claim @NX-32', async () => {
    const asked = stubDistribution(null)
    renderAt(`/token/${TOKEN}?tab=distribution`)
    expect(
      await screen.findByText('Enter an identity to see when it last claimed.'),
    ).toBeInTheDocument()
    expect(asked).toEqual([])
  })

  it('says at which Platform block the identity last claimed @NX-32', async () => {
    const asked = stubDistribution({ type: 'block', blockHeight: 1234n })
    renderAt(`/token/${TOKEN}?tab=distribution&who=${HOLDER}`)
    expect(await screen.findByText('Last claimed at Platform block 1,234.')).toBeInTheDocument()
    expect(asked).toEqual([{ identityId: HOLDER, tokenId: TOKEN }])
  })

  it('says in which epoch the identity last claimed @NX-32', async () => {
    stubDistribution({ type: 'epoch', epochIndex: 88 })
    renderAt(`/token/${TOKEN}?tab=distribution&who=${HOLDER}`)
    expect(await screen.findByText('Last claimed in epoch 88.')).toBeInTheDocument()
  })

  it('says the identity has not claimed yet, rather than showing a moment @NX-32', async () => {
    stubDistribution(null)
    renderAt(`/token/${TOKEN}?tab=distribution&who=${HOLDER}`)
    await waitFor(() => {
      expect(
        screen.getByText('This identity has not claimed from this token yet.'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/Last claimed at/)).toBeNull()
  })
})
