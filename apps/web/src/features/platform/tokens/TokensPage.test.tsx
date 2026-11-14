import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { SourceError } from '@/data/errors'
import { sdk } from '@/data/sdk'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Tokens page', () => {
  it('says the prices are missing when the SDK cannot read them @X-09', async () => {
    const real = sdk.call.bind(sdk)
    vi.spyOn(sdk, 'call').mockImplementation((net, method, args, signal) =>
      method === 'tokens.directPurchasePrices'
        ? Promise.reject(
            new SourceError({ source: 'sdk', kind: 'unavailable', message: 'The SDK is down' }),
          )
        : real(net, method, args, signal),
    )

    render(<App history={createMemoryHistory({ initialEntries: ['/tokens'] })} />)

    expect(
      await screen.findByText(/Platform SDK isn.t available here|isn.t available here/),
    ).toBeInTheDocument()
  })
  it('keeps the prices it has when a later read of them fails', async () => {
    const real = sdk.call.bind(sdk)
    let reads = 0
    vi.spyOn(sdk, 'call').mockImplementation((net, method, args, signal) => {
      const answer = () => real(net, method, args, signal)
      if (method !== 'tokens.directPurchasePrices') return answer()
      reads += 1
      return reads === 1
        ? answer()
        : Promise.reject(
            new SourceError({ source: 'sdk', kind: 'unavailable', message: 'The SDK is down' }),
          )
    })

    render(<App history={createMemoryHistory({ initialEntries: ['/tokens'] })} />)
    await waitFor(() => expect(reads).toBe(1))
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull())

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60 * 60_000)
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(reads).toBeGreaterThan(1))
    await new Promise((r) => setTimeout(r, 200))

    expect(screen.queryByText(/isn.t available here/)).toBeNull()
  })
})
