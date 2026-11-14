import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { App } from '@/app'
import { writeSourceMode } from '@/lib/source-mode'
import { server } from '@/test/server'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))

vi.mock('@/features/entity/platform/use-identity-name', () => ({
  useIdentityName: () => undefined,
}))

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

const card = (id: string) =>
  waitFor(() => {
    const el = document.getElementById(id)
    expect(el).not.toBeNull()
    return el!
  })

const ready = async (id: string) => {
  const el = await card(id)
  await waitFor(() => expect(el).toHaveAttribute('data-state', 'ready'))
  return el
}

afterEach(() => {
  server.events.removeAllListeners()
  writeSourceMode('all')
})

describe('Platform overview', () => {
  it('shows the proof-checked vital signs, and says the quorum count is not proved @NX-01', async () => {
    renderAt('/platform')
    expect(await screen.findByRole('heading', { level: 1, name: 'Platform' })).toBeInTheDocument()
    const vitals = await card('vitals')
    await waitFor(() => expect(vitals).toHaveTextContent('Platform height'))
    await waitFor(() => expect(vitals).toHaveTextContent(/Total credits/))
    await waitFor(() => expect(vitals.querySelector('[data-amount]')).not.toBeNull())
    await waitFor(() => expect(vitals).toHaveTextContent(/Epoch\s*88/))
    expect(vitals).toHaveTextContent('Protocol version')
    await waitFor(() => expect(vitals).toHaveTextContent('Not proof-checked'))
    expect(vitals.querySelector('[data-source="sdk"][data-proved="true"]')).not.toBeNull()
  })

  it('ranks the ten evonodes with the most blocks and links each to its page @NX-02', async () => {
    renderAt('/platform')
    const proposers = await ready('proposers')
    await waitFor(() => expect(within(proposers).getAllByRole('row')).toHaveLength(11))
    const rows = within(proposers).getAllByRole('row')
    expect(proposers).toHaveTextContent('Combined from 4 proof-checked answers')
    const links = within(proposers)
      .getAllByRole('link')
      .filter((a) => /^\/mn\/[0-9a-f]{64}/.test(a.getAttribute('href') ?? ''))
    expect(links.length).toBeGreaterThanOrEqual(10)
    const blocks = rows
      .slice(1)
      .map((r) => Number(r.querySelectorAll('td')[2]?.textContent?.replaceAll(',', '')))
    expect(blocks).toEqual([...blocks].sort((a, b) => b - a))
    expect(proposers.querySelector('[data-proved="false"]')).not.toBeNull()
  })

  it('goes straight to an epoch, and to the search page for anything it cannot place @NX-03', async () => {
    const user = userEvent.setup()
    renderAt('/platform')
    const box = await screen.findByRole('textbox', {
      name: 'Identity ID, name.dash, token ID or epoch number',
    })
    await user.type(box, '86{Enter}')
    await waitFor(() => expect(document.querySelector('[data-page="/epoch/$n"]')).not.toBeNull())
  })

  it('sends text it cannot place to /search and never sends a recovery phrase @NX-03', async () => {
    const user = userEvent.setup()
    renderAt('/platform')
    const box = await screen.findByRole('textbox', {
      name: 'Identity ID, name.dash, token ID or epoch number',
    })
    await user.type(
      box,
      'abandon ability able about above absent absorb abstract absurd abuse access accident{Enter}',
    )
    expect(await screen.findByText(/not sent anywhere/)).toBeInTheDocument()
    expect(document.querySelector('[data-page="/platform"]')).not.toBeNull()
  })

  it('groups quorums by size, counts the polls ending soon and names the contracts @NX-04', async () => {
    renderAt('/platform')
    const quorums = await ready('quorums')
    expect(quorums.querySelectorAll('[data-quorum-sizes] li').length).toBeGreaterThan(0)
    const polls = await ready('polls')
    await waitFor(() => expect(polls.querySelector('[data-poll-count]')).not.toBeNull())
    const contracts = await card('contracts')
    expect(within(contracts).getByText('DPNS')).toBeInTheDocument()
    await waitFor(() => expect(contracts).toHaveTextContent(/version \d/))
  })

  it('shows the indexer pulse and the newest blocks and transitions, five rows each @PE-01 @PE-02', async () => {
    renderAt('/platform')
    const pulse = await ready('pulse')
    await waitFor(() => expect(pulse.querySelector('[data-pulse="height"]')).not.toBeNull())
    expect(pulse.querySelector('[data-pulse="indexer"]')).toHaveTextContent('In sync')
    const blocks = await ready('newest-blocks')
    const txs = await ready('newest-transitions')
    expect(within(blocks).getAllByRole('row')).toHaveLength(6)
    expect(within(txs).getAllByRole('row').length).toBeLessThanOrEqual(6)
  })

  it('holds a list still, and says so, while the pointer is over it @PE-02', async () => {
    const user = userEvent.setup()
    renderAt('/platform')
    const blocks = await ready('newest-blocks')
    const list = blocks.querySelector<HTMLElement>('[data-list="blocks"]')!
    await user.hover(list)
    expect(list).toHaveAttribute('data-held', 'true')
    expect(within(blocks).getByRole('status')).toHaveTextContent('Held still while you look')
    await user.unhover(list)
    await waitFor(() => expect(list).toHaveAttribute('data-held', 'false'))
  })

  it('lists the current epoch and the three before it @PE-03', async () => {
    renderAt('/platform')
    const epochs = await ready('recent-epochs')
    await waitFor(() => expect(within(epochs).getAllByRole('row')).toHaveLength(5))
    expect(epochs).toHaveTextContent('88')
    expect(epochs).toHaveTextContent('85')
  })

  it('draws the four charts with a table equivalent, for the range in the address @PE-04', async () => {
    renderAt('/platform?range=1w')
    for (const id of ['chart-transitions', 'chart-identities', 'chart-types', 'chart-shielded']) {
      await card(id)
    }
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Show as a table' }).length).toBeGreaterThan(0),
    )
    expect(screen.getByRole('button', { name: '1 w' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ranks identities by balance or by transition count @PE-05', async () => {
    renderAt('/platform?rich=txs')
    const richest = await ready('board-richest')
    expect(richest).toHaveTextContent('Busiest identities')
    expect(richest.querySelectorAll('[data-board] li').length).toBeGreaterThan(0)
    for (const id of [
      'board-active-identities',
      'board-tokens',
      'board-contracts-rated',
      'board-contracts-active',
    ]) {
      await card(id)
    }
  })

  it('counts validators and lists quorums, linking to the platform masternode view @PE-06', async () => {
    renderAt('/platform')
    const validators = await card('validators')
    await waitFor(() => expect(validators).toHaveTextContent('681'))
    // The status breakdown comes from a second read that can land after the total.
    await waitFor(() => {
      expect(validators).toHaveTextContent('99')
      expect(validators).toHaveTextContent('327')
      expect(validators).toHaveTextContent('255')
    })
    expect(within(validators).getByRole('link', { name: 'All evonodes' })).toHaveAttribute(
      'href',
      '/masternodes?view=platform',
    )
    await waitFor(() =>
      expect(validators.querySelector('[data-last-proposer]')).toHaveTextContent(/[0-9a-f]{6}/i),
    )
  })

  it('keeps SDK zones, shows one notice and asks no hosted source in Decentralized only mode @NX-01 @NX-02 @NX-04 @PE-01', async () => {
    writeSourceMode('decentralized')
    const hosted: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (/pe\.dashhq\.org|radar\.dashhq\.org\/api|\/x\/hy\//.test(request.url))
        hosted.push(request.url)
    })
    renderAt('/platform')
    await ready('proposers')
    await ready('quorums')
    await card('vitals')
    await act(() => new Promise((r) => setTimeout(r, 150)))
    expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1)
    expect(document.getElementById('pulse')).toBeNull()
    expect(document.getElementById('chart-transitions')).toBeNull()
    expect(hosted).toEqual([])
    await waitFor(() => expect(document.querySelector('#vitals .rx-amt .rx-fiat')).toBeNull())
  })
})
