import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceError } from '@/data/errors'
import { sdk } from '@/data/sdk'
import { renderInRouter } from '@/ui/test-utils'
import { epochForHeight, useEpochOf } from './use-epoch-of'

const epochs = [
  { index: 90, firstBlockHeight: 900 },
  { index: 88, firstBlockHeight: 800 },
  { index: 89, firstBlockHeight: 850 },
]

describe('epochForHeight', () => {
  it('names the last epoch that started at or before the height, whatever the order of the list', () => {
    expect(epochForHeight(epochs, 800)).toBe(88)
    expect(epochForHeight(epochs, 849)).toBe(88)
    expect(epochForHeight(epochs, 850)).toBe(89)
    expect(epochForHeight(epochs, 5000)).toBe(90)
  })

  it('has no answer for a height before the first epoch listed', () => {
    expect(epochForHeight(epochs, 799)).toBeUndefined()
    expect(epochForHeight([], 1)).toBeUndefined()
  })
})

describe('useEpochOf', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('says why the epoch list is missing when the SDK cannot read it', async () => {
    vi.spyOn(sdk, 'call').mockRejectedValue(
      new SourceError({ source: 'sdk', kind: 'unavailable', message: 'The SDK is unreachable' }),
    )
    function Probe() {
      const { epochOf, missing } = useEpochOf()
      return <p data-testid="probe">{missing ? 'missing' : epochOf ? 'known' : 'waiting'}</p>
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await renderInRouter(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('missing'))
  })
})
