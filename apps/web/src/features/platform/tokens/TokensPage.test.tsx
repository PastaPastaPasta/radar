import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { SourceError } from '@/data/errors'
import { sdk } from '@/data/sdk'
import { server } from '@/test/server'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Tokens page', () => {
  it('shows no trending ranking when no token has had a transition @PE-24 @NX-01', async () => {
    server.use(
      http.get('https://api.pe.dashhq.org/tokens/rating', () =>
        HttpResponse.json({
          pagination: { page: 1, limit: 50, total: 2 },
          resultSet: [
            { tokenIdentifier: 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB', transitionCount: 0 },
            { tokenIdentifier: 'DYqxCsuDgYsEAJ2ADnimkwNdL7C4xbe4No4so19X9mmd', transitionCount: 0 },
          ],
        }),
      ),
    )
    render(<App history={createMemoryHistory({ initialEntries: ['/tokens'] })} />)
    await waitFor(() => expect(document.getElementById('tokens-list')).not.toBeNull())
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull())
    expect(document.getElementById('tokens-trending')).toBeNull()
  })

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
