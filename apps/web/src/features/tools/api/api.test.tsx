import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { writeSourceMode } from '@/lib/source-mode'
import { API_ENDPOINTS, CURL_EXAMPLES, endpointTitle } from './endpoints'
import { renderAt } from '../test-utils'

afterEach(() => {
  writeSourceMode('all')
})

describe('endpoints', () => {
  it('has a unique anchor for every endpoint of the Radar API @RA-90', () => {
    const ids = API_ENDPOINTS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(API_ENDPOINTS.map(endpointTitle)).toEqual([
      'GET /api/v1/status',
      'GET /api/v1/releases',
      'GET /api/v1/health',
      'GET /api/v1/{net}/summary',
      'GET /api/v1/{net}/history?scope=mn&dim=version&days=30&top=8',
      'GET /api/v1/{net}/geo',
      'GET /api/v1/{net}/masternodes',
      'GET /api/v1/{net}/masternodes/{protx}',
      'GET /api/v1/{net}/masternodes/{protx}/payments?before={height}&limit=100',
      'GET /api/v1/{net}/masternodes/{protx}/bench',
      'GET /api/v1/{net}/bench',
      'POST /api/v1/{net}/masternodes/{protx}/check',
      'GET /api/v1/{net}/platform',
      'GET /api/v1/{net}/activation',
      'GET /api/v1/{net}/changes',
      'GET /api/v1/{net}/reference',
    ])
  })
})

describe('the API page', () => {
  it('lists every endpoint with an anchor, two curl examples and how the data is collected @RA-90', async () => {
    renderAt('/api')
    await screen.findByRole('heading', { level: 1, name: 'Radar API' })
    for (const e of API_ENDPOINTS) {
      const card = document.getElementById(e.id)
      expect(card, e.id).not.toBeNull()
      expect(within(card!).getByRole('heading', { level: 3 })).toHaveTextContent(endpointTitle(e))
      expect(card!.querySelector(`a[href="#${e.id}"]`)).not.toBeNull()
    }
    expect(document.querySelectorAll('[data-curl]')).toHaveLength(CURL_EXAMPLES.length)
    expect(screen.getByRole('heading', { name: 'How the data is collected' })).toBeInTheDocument()
    expect(screen.getByText(/The API URLs are unchanged/)).toBeInTheDocument()
    expect(document.querySelector('[data-api-hosted]')).toBeNull()
  })

  it('copies the link to one endpoint @RA-90', async () => {
    const user = userEvent.setup()
    renderAt('/api')
    const card = await waitFor(() => {
      const el = document.getElementById('geo')
      expect(el).not.toBeNull()
      return el!
    })
    await user.click(
      within(card).getByRole('button', { name: /Copy link to GET \/api\/v1\/\{net\}\/geo/ }),
    )
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toMatch(/\/api(\?.*)?#geo$/)
    })
  })

  it('says the API itself is a hosted service in Decentralized only mode, and still lists the endpoints @RA-90 @X-05', async () => {
    writeSourceMode('decentralized')
    renderAt('/api')
    await screen.findByRole('heading', { level: 1, name: 'Radar API' })
    expect(document.querySelector('[data-api-hosted]')).not.toBeNull()
    expect(document.querySelector('[data-unavailable]')).toBeNull()
    expect(document.querySelectorAll('[data-endpoint]')).toHaveLength(API_ENDPOINTS.length)
  })
})
