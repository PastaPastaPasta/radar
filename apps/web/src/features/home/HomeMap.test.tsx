import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { I18nProvider, i18n } from '@/i18n'
import { server } from '@/test/server'
import { renderInRouter } from '@/ui/test-utils'
import { HomeMap } from './HomeMap'

const point = (city: string, nodes: number, masternodes: number, lon: number) => ({
  city,
  country: 'PL',
  lat: 50,
  lon,
  nodes,
  masternodes,
})

describe('the home map @RA-01', () => {
  it('lists no place without a masternode, and does not count it', async () => {
    server.use(
      http.get('*/mainnet/geo', () =>
        HttpResponse.json({
          points: [
            point('Falkenstein', 30, 20, 12),
            point('Frankfurt', 12, 10, 8),
            point('Warsaw', 4, 0, 21),
          ],
          unlocated: 0,
        }),
      ),
    )
    await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <HomeMap />
        </I18nProvider>
      </QueryClientProvider>,
    )
    const list = await screen.findByRole('list', { name: 'Places with the most masternodes' })
    await waitFor(() => expect(list).toHaveTextContent('Falkenstein'))
    expect(list).not.toHaveTextContent('Warsaw')
    expect(list).not.toHaveTextContent(/: 0 masternodes/)
    expect(document.querySelector('.rx-maplegend__sum')).toHaveTextContent(
      '30 masternodes in 2 places',
    )
  })
})
