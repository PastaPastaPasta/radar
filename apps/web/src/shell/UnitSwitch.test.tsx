import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'
import { UnitSwitch } from './UnitSwitch'

const options = () => screen.getAllByRole('option').map((o) => o.textContent)

function renderSwitch(initial = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderInRouter(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <UnitSwitch />
      </I18nProvider>
    </QueryClientProvider>,
    initial,
  )
}

describe('UnitSwitch', () => {
  it('names the mainnet units on mainnet', async () => {
    await renderSwitch()
    expect(options()).toEqual(['DASH', 'mDASH', 'µDASH', 'duffs', 'USD'])
  })

  it('names the test coin on testnet, as every amount on the page does @HY-17', async () => {
    await renderSwitch('/?network=testnet')
    expect(options()).toEqual(['tDASH', 'tmDASH', 'tµDASH', 'duffs', 'USD'])
  })
})
