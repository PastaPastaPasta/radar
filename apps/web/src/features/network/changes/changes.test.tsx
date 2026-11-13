import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { writeSourceMode } from '@/lib/source-mode'
import { App } from '@/app'

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

afterEach(() => {
  writeSourceMode('all')
})

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('the Changes page', () => {
  it('lists the latest changes with their time, block, masternode and a coloured badge @RA-80', async () => {
    renderAt('/changes')
    await screen.findByRole('heading', { level: 1, name: 'Changes' })
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(50))
    const first = bodyRows()[0]!
    expect(within(first).getByRole('link', { name: /2,569,960/ })).toHaveAttribute(
      'href',
      '/block/2569960',
    )
    expect(first.querySelector('a[href^="/mn/"]')).not.toBeNull()
    expect(first.querySelector('time')).not.toBeNull()
    expect(first.querySelector('[data-change-field="pose"] .dh-badge--good')).not.toBeNull()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['When', 'Block', 'Masternode', 'Change']),
    )
  })

  it('filters by kind, keeps the kind in the address and shows an evonode pill @RA-80', async () => {
    const user = userEvent.setup()
    renderAt('/changes?kind=pose')
    await screen.findByRole('heading', { level: 1, name: 'Changes' })
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(20))
    expect(screen.getByRole('button', { name: 'PoSe bans and revivals' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    for (const row of bodyRows())
      expect(row.querySelector('[data-change-field="pose"]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Address changes' }))
    await waitFor(() => {
      for (const row of bodyRows()) {
        expect(row.querySelector('[data-change-field]')?.getAttribute('data-change-field')).toMatch(
          /^(service|platform_p2p|platform_https)$/,
        )
      }
    })
    expect(document.querySelector('[data-page="/changes"]')).not.toBeNull()
  })

  it('says once that the crawl is needed in Decentralized only mode, and asks nothing @RA-80 @X-05', async () => {
    writeSourceMode('decentralized')
    renderAt('/changes')
    await screen.findByRole('heading', { level: 1, name: 'Changes' })
    expect(await screen.findAllByText(/need Radar's crawl/)).toHaveLength(1)
    expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1)
    expect(screen.queryByRole('table')).toBeNull()
  })
})
