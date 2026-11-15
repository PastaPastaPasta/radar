import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { sdk } from '@/data/sdk/client'
import { writeSourceMode } from '@/lib/source-mode'
import { fixtureBody } from '@/test/fixtures/load'
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
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /^Epoch 88 is \d+% through$/,
      ),
    )
    expect(current.querySelector('.rx-clock__n')).toBeNull()
    expect(current).toHaveTextContent('Fee multiplier')
    expect(current.querySelector('a[href^="/platform/block/"]')).not.toBeNull()
    const rewards = await card('rewards')
    await waitFor(() => expect(rewards).toHaveTextContent('Median monthly earnings'))
    expect(rewards).toHaveTextContent('Pool so far')
    // The pool and the pay are the epoch that just ended, not the oldest one Radar still lists.
    expect(within(rewards).getAllByText('Epoch 87')).toHaveLength(2)
  })

  it('gives the pool in the same short form as Platform, with the unit on the figure @RA-60', async () => {
    const doc = await fixtureBody<{ now: { pool_so_far: number } }>('radar', 'mainnet', 'platform')
    server.use(
      http.get('*/mainnet/platform', () =>
        HttpResponse.json({ ...doc, now: { ...doc.now, pool_so_far: 150_243_800_000_000 } }),
      ),
    )
    renderAt('/epochs')
    const rewards = await card('rewards')
    await waitFor(() =>
      expect(rewards.querySelector('[data-amount]')?.textContent).toBe('1.5k\u00a0DASH'),
    )
    expect(rewards).not.toHaveTextContent('1,502.')
  })

  it('does not call an epoch complete once it has run past its expected end @RA-60 @NX-50', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 400 * 86_400_000 })
    try {
      renderAt('/epochs')
      const h1 = await screen.findByRole('heading', {
        level: 1,
        name: 'Epoch 88 is running past its expected end',
      })
      expect(h1).toHaveAttribute('data-claim')
      expect(screen.queryByText(/100% through/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('draws the epoch history in time order and lists it newest first @RA-60', async () => {
    renderAt('/epochs')
    const history = await card('history')
    await waitFor(() => expect(rows(history).length).toBeGreaterThan(1))
    const epochs = rows(history).map((r) => Number(r.querySelector('td, th')?.textContent))
    expect(epochs[0]).toBe(87)
    expect(epochs).toEqual([...epochs].sort((a, b) => b - a))
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

  it('counts the blocks until each turn and never says a turn was ago @RA-62 @NX-50', async () => {
    renderAt('/epochs')
    const upcoming = await card('upcoming')
    await waitFor(() => expect(rows(upcoming)).toHaveLength(12))
    expect(within(upcoming).getByRole('columnheader', { name: 'Blocks away' })).toBeVisible()
    const cells = (i: number) => rows(upcoming).map((r) => r.querySelectorAll('td')[i]?.textContent)
    expect(cells(1)).toEqual(Array.from({ length: 12 }, (_, i) => `+${String(i + 1)}`))
    // The sample is long past: every turn is due.
    expect(cells(2)).toEqual(Array.from({ length: 12 }, () => 'any moment'))
    expect(upcoming.querySelector('thead')).not.toHaveTextContent('Slots')
    expect(upcoming).toHaveTextContent(/from the validator sets .*\d{4}/)
  })

  it('shows when a turn comes while it is still ahead @RA-62', async () => {
    const doc = await fixtureBody<{ schedule: { ts: number; next: { eta: number }[] } }>(
      'radar',
      'mainnet',
      'platform',
    )
    vi.useFakeTimers({ toFake: ['Date'], now: doc.schedule.ts * 1000 })
    try {
      renderAt('/epochs')
      const upcoming = await card('upcoming')
      await waitFor(() => expect(rows(upcoming)).toHaveLength(12))
      const first = rows(upcoming)[0]!.querySelectorAll('td')[2]!.textContent
      expect(first).toMatch(/in \d+ min/)
      expect(first).not.toMatch(/ago/)
      expect(upcoming).toHaveTextContent(/validator sets \d+ s ago/)
    } finally {
      vi.useRealTimers()
    }
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

  it('shows the fees each epoch collected, and says when a range was cut back @W2-37', async () => {
    renderAt('/epochs?from=69&to=500')
    const range = await card('range')
    await waitFor(() => expect(rows(range)).toHaveLength(20))
    expect(range).toHaveTextContent(/latest epoch is 88/)
    expect(within(range).getByRole('columnheader', { name: 'Fees' })).toBeInTheDocument()
    await waitFor(() => {
      const cells = rows(range).map((r) => within(r).getAllByRole('cell').at(-1)?.textContent)
      expect(cells.some((c) => c && c !== '—' && /DASH|\d/.test(c))).toBe(true)
    })
  })

  it('leaves the fees blank in Decentralized only mode @W2-37', async () => {
    writeSourceMode('decentralized')
    renderAt('/epochs?from=81&to=86')
    const range = await card('range')
    await waitFor(() => expect(rows(range)).toHaveLength(6))
    for (const r of rows(range))
      expect(within(r).getAllByRole('cell').at(-1)).toHaveTextContent('—')
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
    expect(screen.getByRole('link', { name: 'Previous: epoch 85' })).toHaveAttribute(
      'href',
      '/epoch/85',
    )
    expect(screen.getByRole('link', { name: 'Next: epoch 87' })).toHaveAttribute(
      'href',
      '/epoch/87',
    )
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
    await waitFor(() => expect(document.querySelector('[data-page="/epochs"]')).not.toBeNull())
    expect(await screen.findByRole('heading', { level: 1, name: /^Epoch/ })).toBeInTheDocument()
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

  it('counts no pending votes when nothing is proposed, and explains the totals @NX-56', async () => {
    renderAt('/protocol')
    const vote = await card('vote')
    await waitFor(() => expect(vote).toHaveTextContent('Activation threshold'))
    expect(vote).toHaveTextContent('None proposed')
    expect(vote).not.toHaveTextContent('Pending votes')
    expect(vote).not.toHaveTextContent('Still needed')
    const tally = await card('tally')
    await waitFor(() => expect(rows(tally)).toHaveLength(1))
    const sub = tally.querySelector('.rx-card__sub')?.textContent ?? ''
    const ofEnabled = /([\d,]+) of the ([\d,]+) enabled/.exec(sub)
    if (ofEnabled) {
      const voters = Number(ofEnabled[1]!.replaceAll(',', ''))
      const enabled = Number(ofEnabled[2]!.replaceAll(',', ''))
      expect(voters).toBeLessThanOrEqual(enabled)
    } else {
      expect(sub).toMatch(/no longer enabled/)
    }
    expect(vote).toHaveTextContent(/Reported by \d+ of \d+ evonodes/)
  })

  it('shows pending votes and how many are still needed while a vote is live', async () => {
    const original = sdk.call.bind(sdk)
    const spy = vi.spyOn(sdk, 'call').mockImplementation(async (net, method, args, signal) => {
      if (method === 'protocol.versionUpgradeState') {
        return {
          source: 'sdk' as const,
          asOf: Date.now(),
          fetchedAt: Date.now(),
          proved: false,
          height: 470554,
          data: {
            currentProtocolVersion: 14,
            nextProtocolVersion: 15,
            voteCount: 100n,
          },
        }
      }
      return original(net, method, args, signal)
    })
    try {
      renderAt('/protocol')
      const vote = await card('vote')
      await waitFor(() => expect(vote).toHaveTextContent('Pending votes263'))
      expect(vote).toHaveTextContent('Still needed144')
      expect(vote).toHaveTextContent('v15')
    } finally {
      spy.mockRestore()
    }
  })

  it('does not say testnet reported more next-epoch versions than it has enabled evonodes', async () => {
    renderAt('/protocol?network=testnet')
    const vote = await card('vote')
    await waitFor(() => expect(vote).toHaveTextContent('Activation threshold'))
    expect(vote).toHaveTextContent('more than the 42 enabled now')
    expect(vote).not.toHaveTextContent('43 of 42')
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
