import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
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
})
