import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { core } from '@/data/core/client'
import { SourceError } from '@/data/errors'
import { server } from '@/test/server'

const MAINNET = {
  regular: '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32',
  listed: '9c663ed039e98d055af0e1dbd30a7b702e77fce302708114915cf2ede9f85874',
  evo: 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff',
  banned: 'a8355582b280be9452f939d34637ab82226ba2c97e1aac15eaf6db878fec0130',
}
const TESTNET = {
  regular: '51238bb9e2b68fc822e8eb15d415e97ebc86f769a72c15e0a6e25d9ea8d38475',
  evo: '05b687978344fa2433b2aa99d41f643e2d8581a789cdc23084889ceca5244ea8',
}
const MISSING = '0'.repeat(64)

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Masternode page', () => {
  it('says Radar’s crawl is missing when only DAPI’s list has the masternode @X-09', async () => {
    server.use(
      http.get(`*/masternodes/${MAINNET.listed}`, () => new HttpResponse(null, { status: 400 })),
    )
    vi.spyOn(core, 'masternodeList').mockResolvedValue({
      data: new Map([
        [
          MAINNET.listed,
          {
            type: 0,
            isValid: true,
            service: '146.190.33.135:9999',
            votingAddress: 'XqAJRzmwb8nUzpT5zWhbjESQdkd3eKFWTc',
            pubKeyOperator: '05'.repeat(48),
          },
        ],
      ]),
      source: 'dapi',
      asOf: Date.now(),
      fetchedAt: Date.now(),
      proved: false,
    } as unknown as Awaited<ReturnType<typeof core.masternodeList>>)
    renderAt(`/mn/${MAINNET.listed}`)

    expect(await screen.findByText(/Radar isn.t answering/)).toBeInTheDocument()
    expect(document.querySelector('[data-masternode-header]')).toHaveTextContent(
      'Valid on DAPI’s list',
    )
  })

  it('says DAPI’s list is missing when only Radar’s crawl has the masternode @X-09', async () => {
    vi.spyOn(core, 'masternodeList').mockRejectedValue(
      new SourceError({ source: 'dapi', kind: 'unavailable', message: 'No node answered' }),
    )
    renderAt(`/mn/${MAINNET.regular}`)

    expect(await screen.findByText(/DAPI isn.t available here/)).toBeInTheDocument()
    expect(document.querySelector('[data-masternode-header]')).toHaveTextContent(
      'Enabled, no PoSe penalty',
    )
  })

  it('shows type, status, PoSe, version, uptime, last paid and earnings for a regular masternode @RA-30', async () => {
    renderAt(`/mn/${MAINNET.regular}`)
    const header = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-masternode-header]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(header).toHaveTextContent('Regular masternode')
    expect(header).toHaveTextContent('85.209.241.228')
    expect(header).toHaveTextContent(':9999')
    expect(header).toHaveTextContent('Enabled, no PoSe penalty')
    expect(header).toHaveTextContent('24.0.0')
    const kpis = document.querySelector<HTMLElement>('[data-masternode-kpis]')!
    expect(kpis).toHaveTextContent('Uptime, 30 days')
    expect(kpis).toHaveTextContent('100%')
    expect(kpis).toHaveTextContent('Last paid')
    expect(kpis).toHaveTextContent('2,568,655')
    expect(kpis).toHaveTextContent('Earned on Core, 90 days')
    expect(kpis).toHaveTextContent('PoSe penalty')
  })

  it('lists the registration with payout, owner and voting addresses linked to their pages, keys, collateral and PoSe @RA-31', async () => {
    renderAt(`/mn/${MAINNET.regular}`)
    const card = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('#registration')
      expect(el).not.toBeNull()
      return el!
    })
    for (const label of [
      'Payout',
      'Owner',
      'Voting',
      'Operator key',
      'Collateral',
      'Registered',
      'PoSe',
    ]) {
      expect(within(card).getByText(label)).toBeInTheDocument()
    }
    const hrefs = within(card)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/address/Xt77nU5qc5wquYng2om1fRSHsnmUB3WL1Z')
    expect(hrefs.filter((h) => h === '/address/XtqJ5rnqadDmgRmZQ769UN6y9zYjMDhBMf')).toHaveLength(2)
    expect(card).toHaveTextContent('Same as the owner address')
    expect(card).toHaveTextContent('1,028,165')
    expect(card).toHaveTextContent('No penalty')
  })

  it('gives every card a source line from Radar’s crawl @RA-30', async () => {
    renderAt(`/mn/${MAINNET.regular}`)
    await waitFor(() => expect(document.querySelector('#registration')).not.toBeNull())
    for (const id of ['uptime', 'registration']) {
      const card = document.getElementById(id)!
      expect(card.querySelector('[data-source="radar"]')).not.toBeNull()
    }
  })

  it('draws the uptime strip with a tone for each day', async () => {
    renderAt(`/mn/${MAINNET.regular}`)
    const strip = await waitFor(() => {
      const el = document.querySelector('[data-uptime-strip]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(strip.querySelectorAll('i').length).toBe(13)
  })

  it('lists recent payments on the payments tab @RA-35', async () => {
    renderAt(`/mn/${MAINNET.regular}?tab=payments`)
    const table = await screen.findByRole('table', { name: 'Recent payments to this masternode' })
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(5)
  })

  it('shows an evonode’s Platform endpoints with certificate, height, versions and daily health @RA-40', async () => {
    renderAt(`/mn/${MAINNET.evo}?tab=network`)
    const card = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('#platform')
      expect(el).not.toBeNull()
      return el!
    })
    expect(document.querySelector('[data-masternode-header]')).toHaveTextContent('Evonode')
    expect(card).toHaveTextContent('HTTPS (DAPI)')
    expect(card).toHaveTextContent('P2P (Tenderdash)')
    expect(card).toHaveTextContent('TLS certificate')
    expect(card).toHaveTextContent('ZeroSSL GmbH')
    expect(card).toHaveTextContent('468,958')
    expect(card).toHaveTextContent('DAPI 5.0.3')
    expect(card).toHaveTextContent('Tenderdash 1.8.2')
    expect(card.querySelector('[data-platform-daily] [data-uptime-strip]')).not.toBeNull()
  })

  it('has no Platform card or tab for a regular masternode', async () => {
    renderAt(`/mn/${MAINNET.regular}?tab=network`)
    await waitFor(() => expect(document.querySelector('#port-check')).not.toBeNull())
    expect(document.querySelector('#platform')).toBeNull()
    expect(
      within(screen.getByRole('navigation', { name: 'Sections' })).queryByRole('link', {
        name: 'Platform',
      }),
    ).toBeNull()
  })

  it('shows the Platform tab for an evonode only', async () => {
    renderAt(`/mn/${MAINNET.evo}`)
    const tabs = await screen.findByRole('navigation', { name: 'Sections' })
    expect(within(tabs).getByRole('link', { name: 'Platform' })).toBeInTheDocument()
  })

  it('lists the DKG checks with fix text and a link to the rule @RA-36', async () => {
    renderAt(`/mn/${MAINNET.regular}`)
    const card = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('#readiness')
      expect(el).not.toBeNull()
      return el!
    })
    expect(card).toHaveTextContent('Ready')
    for (const id of ['protocol', 'relay', 'filters', 'reachable']) {
      await waitFor(() => expect(card.querySelector(`[data-check="${id}"]`)).not.toBeNull())
    }
    expect(card.querySelector('a[data-rule]')).toHaveAttribute(
      'href',
      expect.stringContaining('dkgsession.cpp'),
    )
  })

  it('shows the port check and links the location to the map and the host to its list @RA-32 @RA-33', async () => {
    renderAt(`/mn/${MAINNET.regular}?tab=network`)
    const check = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('#port-check')
      expect(el).not.toBeNull()
      return el!
    })
    for (const label of ['Latest port check', 'User agent', 'Protocol', 'Latency']) {
      expect(check).toHaveTextContent(label)
    }
    expect(within(check).getByRole('button', { name: 'Check now' })).toBeInTheDocument()
    const map = await screen.findByRole('link', { name: 'Show on map' })
    expect(map.getAttribute('href')).toContain(`protx=${MAINNET.regular}`)
    expect(document.querySelector('a[data-host-filter]')?.getAttribute('href')).toMatch(/host=\d+/)
  })

  it('marks a PoSe-banned masternode as banned', async () => {
    renderAt(`/mn/${MAINNET.banned}`)
    const status = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-status]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(status).toHaveTextContent('PoSe banned')
  })

  it('links to Governance for voting, on the matching network', async () => {
    renderAt(`/mn/${MAINNET.regular}`)
    const link = await screen.findByRole('link', { name: /Vote in Governance/ })
    expect(link).toHaveAttribute('href', 'https://gov.dashhq.org/masternodes')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('works on testnet @HY-19', async () => {
    renderAt(`/mn/${TESTNET.regular}?network=testnet`)
    const header = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-masternode-header]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(header).toHaveTextContent('Regular masternode')
    expect(await screen.findByRole('link', { name: /Vote in Governance/ })).toHaveAttribute(
      'href',
      'https://gov.dashhq.org/masternodes?network=testnet',
    )
  })

  it('offers the other network for a ProTx registered only there @RA-41', async () => {
    renderAt(`/mn/${TESTNET.regular}`)
    const link = await screen.findByRole('link', { name: 'Open it on testnet' })
    expect(link).toHaveAttribute('data-other-network', 'testnet')
    expect(link.getAttribute('href')).toContain(`/mn/${TESTNET.regular}`)
    expect(link.getAttribute('href')).toContain('network=testnet')
  })

  it('offers the mainnet for a mainnet ProTx opened on testnet @RA-41', async () => {
    renderAt(`/mn/${MAINNET.regular}?network=testnet`)
    expect(await screen.findByRole('link', { name: 'Open it on mainnet' })).toBeInTheDocument()
  })

  it('offers search for a ProTx nobody lists @RA-41', async () => {
    renderAt(`/mn/${MISSING}`)
    expect(await screen.findByText('No masternode with this ProTx on mainnet.')).toBeInTheDocument()
    const offer = await waitFor(() => {
      const el = document.querySelector('[data-search-offer]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(offer.getAttribute('href')).toContain('/search')
  })

  it('says a malformed ProTx is not one, without asking Radar', async () => {
    renderAt('/mn/not-a-protx')
    expect(await screen.findByText('That isn’t a ProTx hash.')).toBeInTheDocument()
  })
})
