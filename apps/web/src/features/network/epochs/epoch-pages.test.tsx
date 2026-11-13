import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { writeSourceMode } from '@/lib/source-mode'
import { server } from '@/test/server'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))
vi.mock('@/features/entity/platform/use-identity-name', () => ({
  useIdentityName: () => undefined,
}))

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

const card = (id: string) =>
  waitFor(() => {
    const el = document.getElementById(id)
    expect(el).not.toBeNull()
    return el!
  })

const rows = (el: HTMLElement) => within(el).getAllByRole('row').slice(1)

afterEach(() => {
  server.events.removeAllListeners()
  writeSourceMode('all')
})

describe('Epochs', () => {
  it('shows the clock, the facts and the rewards @RA-60 @NX-50', async () => {
    renderAt('/epochs')
    const current = await card('current-epoch')
    await waitFor(() => expect(within(current).getByRole('meter')).toBeInTheDocument())
    expect(current).toHaveTextContent(/Epoch\s*88/)
    expect(current).toHaveTextContent('Fee multiplier')
    expect(current.querySelector('a[href^="/platform/block/"]')).not.toBeNull()
    const rewards = await card('rewards')
    await waitFor(() => expect(rewards).toHaveTextContent('Median monthly earnings'))
    expect(rewards).toHaveTextContent('Pool so far')
  })

  it('ranks twenty proposers and re-sorts them @NX-50', async () => {
    const user = userEvent.setup()
    renderAt('/epochs')
    const proposers = await card('proposers')
    await waitFor(() => expect(rows(proposers)).toHaveLength(20))
    const blocks = () =>
      rows(proposers).map((r) =>
        Number(r.querySelectorAll('td')[2]?.textContent?.replaceAll(',', '')),
      )
    expect(blocks()).toEqual([...blocks()].sort((a, b) => b - a))
    await user.click(within(proposers).getByRole('button', { name: /Blocks/ }))
    await waitFor(() => expect(blocks()).toEqual([...blocks()].sort((a, b) => a - b)))
  })

  it('lists twelve upcoming proposers @RA-62', async () => {
    renderAt('/epochs')
    const upcoming = await card('upcoming')
    await waitFor(() => expect(rows(upcoming)).toHaveLength(12))
  })

  it('lists the latest twenty epochs, and a custom range @NX-52', async () => {
    renderAt('/epochs')
    const range = await card('range')
    await waitFor(() => expect(rows(range)).toHaveLength(20))
    expect(range.querySelector('a[href^="/epoch/88"]')).not.toBeNull()
  })

  it('shows a custom range from the address @NX-52', async () => {
    renderAt('/epochs?from=81&to=86')
    const range = await card('range')
    await waitFor(() => expect(rows(range)).toHaveLength(6))
    expect(range).toHaveTextContent('Epochs 81 to 86.')
  })

  it('says the Radar parts need Radar in Decentralized only mode, once @RA-60', async () => {
    writeSourceMode('decentralized')
    renderAt('/epochs')
    await card('current-epoch')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1),
    )
    expect(document.getElementById('rewards')).toBeNull()
    const proposers = await card('proposers')
    await waitFor(() => expect(rows(proposers)).toHaveLength(20))
  })
})

describe('One epoch', () => {
  it('shows a finalized epoch with previous and next links @NX-51', async () => {
    renderAt('/epoch/86')
    expect(await screen.findByRole('heading', { level: 1, name: 'Epoch 86' })).toBeInTheDocument()
    await waitFor(() =>
      expect(document.getElementById('epoch-totals')).toHaveTextContent('Processing fees'),
    )
    expect(screen.getByRole('link', { name: 'Previous epoch' })).toHaveAttribute(
      'href',
      '/epoch/85',
    )
    expect(screen.getByRole('link', { name: 'Next epoch' })).toHaveAttribute('href', '/epoch/87')
    const proposers = await card('epoch-proposers')
    await waitFor(() => expect(rows(proposers).length).toBeGreaterThan(0))
  })

  it('says an epoch that has not started is not there @NX-51', async () => {
    renderAt('/epoch/99999')
    expect(await screen.findByText('Epoch 99,999 has not started')).toBeInTheDocument()
  })

  it('refuses text that is not an epoch @NX-51', async () => {
    renderAt('/epoch/abc')
    expect(await screen.findByText('That is not an epoch number')).toBeInTheDocument()
  })

  it('sends the current epoch to /epochs @NX-51', async () => {
    renderAt('/epoch/88')
    expect(await screen.findByRole('heading', { level: 1, name: 'Epochs' })).toBeInTheDocument()
  })
})

describe('Protocol', () => {
  it('shows the versions, the meter with its threshold and the tally @RA-61 @NX-56', async () => {
    renderAt('/protocol')
    const vote = await card('vote')
    await waitFor(() => expect(within(vote).getByRole('meter')).toBeInTheDocument())
    expect(vote).toHaveTextContent('Current version')
    expect(vote).toHaveTextContent('None proposed')
    await waitFor(() => expect(vote).toHaveTextContent('Activation threshold'))
    expect(vote.querySelector('.rx-meter__mark')).not.toBeNull()
    const tally = await card('tally')
    await waitFor(() => expect(rows(tally)).toHaveLength(1))
    const table = await card('vote-table')
    await waitFor(() => expect(rows(table).length).toBeGreaterThan(0))
  })

  it('states the rule where Radar is off, with one notice @RA-61', async () => {
    writeSourceMode('decentralized')
    renderAt('/protocol')
    const vote = await card('vote')
    await waitFor(() => expect(within(vote).getByRole('meter')).toBeInTheDocument())
    expect(vote).toHaveTextContent('two thirds of the evonodes that vote')
    expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1)
  })
})
