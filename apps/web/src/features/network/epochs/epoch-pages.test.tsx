import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { App } from '@/app'
import { getDapiTransport, setDapiTransport } from '@/data/dapi-core'
import { sdk } from '@/data/sdk/client'
import { writeSourceMode } from '@/lib/source-mode'
import { fixtureBody } from '@/test/fixtures/load'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'
import { resetAnnouncer } from '@/ui/announce'
import { server } from '@/test/server'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))
vi.mock('@/features/entity/platform/use-identity-name', () => ({
  useIdentityName: () => undefined,
}))

function renderAt(url: string) {
  const history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} />)
  return history
}

/** The recorded current-epoch answer: block 469,065 of epoch 88, its time, and the epoch's first block. */
const MAINNET_TIP = { height: 469_065, timeMs: 1_794_337_718_422 }

const card = (id: string) =>
  waitFor(() => {
    const el = document.getElementById(id)
    expect(el).not.toBeNull()
    return el!
  })

const rows = (el: HTMLElement) => within(el).getAllByRole('row').slice(1)

const noDapi = getDapiTransport()
beforeEach(() => {
  setDapiTransport(new FixtureDapiTransport())
  resetAnnouncer()
})
afterEach(() => {
  server.events.removeAllListeners()
  writeSourceMode('all')
  setDapiTransport(noDapi)
})

describe('Epochs', () => {
  it('shows the clock, the facts and the rewards @RA-60 @NX-50', async () => {
    const doc = await fixtureBody<{ schedule: { ts: number } }>('radar', 'mainnet', 'platform')
    vi.useFakeTimers({ toFake: ['Date'], now: doc.schedule.ts * 1000 })
    onTestFinished(() => {
      vi.useRealTimers()
    })
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
    // The last pool is the epoch that just ended, not the oldest one Radar still lists.
    expect(within(rewards).getAllByText('Epoch 87')).toHaveLength(1)
    // The pool so far is worked out from the proof-checked epoch read, up to the ChainLock it carries.
    await waitFor(() =>
      expect(rewards).toHaveTextContent(
        'Core block rewards to Core block 2,570,099; fees not counted',
      ),
    )
    expect(rewards).toHaveTextContent(/The pool so far over 1,204 blocks: an estimate/)
  })

  it('gives the pool in the same short form as Platform, with the unit on the figure @RA-60', async () => {
    const doc = await fixtureBody<{ now: { pool_so_far: number } }>('radar', 'mainnet', 'platform')
    server.use(
      http.get('*/mainnet/platform', () =>
        HttpResponse.json({ ...doc, now: { ...doc.now, pool_so_far: 150_243_800_000_000 } }),
      ),
    )
    // Without the live read the crawl's pool stands in.
    const original = sdk.call.bind(sdk)
    const spy = vi
      .spyOn(sdk, 'call')
      .mockImplementation((net, method, args, signal) =>
        method === 'epoch.current'
          ? Promise.reject(new Error('not now'))
          : original(net, method, args, signal),
      )
    onTestFinished(() => {
      spy.mockRestore()
    })
    renderAt('/epochs')
    const rewards = await card('rewards')
    await waitFor(() =>
      expect(rewards.querySelector('[data-amount]')?.textContent).toBe('1.5k\u00a0DASH'),
    )
    expect(rewards.querySelector('[data-amount]')).toHaveClass('rx-amt--compact')
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
    // The newest block is long past: the next turn is due, and the rest follow a block apart, never in the past.
    expect(cells(2)[0]).toBe('any moment')
    for (const c of cells(2).slice(1)) expect(c).not.toMatch(/ago/)
    expect(upcoming.querySelector('thead')).not.toHaveTextContent('Slots')
    expect(upcoming).toHaveTextContent(
      'from the validator sets an evonode reported at block 469,065. Not proof-checked',
    )
  })

  it('shows when a turn comes while it is still ahead, and the latest block with its proposer @RA-62', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAINNET_TIP.timeMs + 10_000 })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    renderAt('/epochs')
    const upcoming = await card('upcoming')
    await waitFor(() => expect(rows(upcoming)).toHaveLength(12))
    const first = rows(upcoming)[0]!.querySelectorAll('td')[2]!.textContent
    expect(first).toMatch(/in \d+ min/)
    expect(first).not.toMatch(/ago/)
    const strip = upcoming.querySelector('.rx-livesched')!
    await waitFor(() => expect(strip).toHaveAttribute('data-live', 'live'))
    expect(strip).toHaveTextContent(/Latest block.*469,065.*proposed by/)
    expect(strip).toHaveTextContent(/Next block expected in about 2 min \d+ s/)
    expect(upcoming).not.toHaveTextContent(/Crawled/)
  })

  it('moves the list on when a block lands: the proposer drops off and a twelfth row joins @RA-62', async () => {
    let advance = 0
    const original = sdk.call.bind(sdk)
    const spy = vi.spyOn(sdk, 'call').mockImplementation(async (net, method, args, signal) => {
      const answer = await original(net, method, args, signal)
      if (method !== 'epoch.current' || answer.height === undefined) return answer
      return { ...answer, height: answer.height + advance, asOf: answer.asOf + advance * 135_000 }
    })
    onTestFinished(() => {
      spy.mockRestore()
    })
    renderAt('/epochs')
    const upcoming = await card('upcoming')
    await waitFor(() => expect(rows(upcoming)).toHaveLength(12))
    const ids = () => rows(upcoming).map((r) => r.getAttribute('data-row-id'))
    const before = ids()
    advance = 1
    await waitFor(
      () => expect(upcoming.querySelector('[data-tip-height="469066"]')).not.toBeNull(),
      { timeout: 12_000 },
    )
    await waitFor(() => expect(ids()).toEqual([...before.slice(1), expect.any(String)]))
    expect(ids().at(-1)).not.toBe(before.at(-1))
    expect(upcoming).toHaveTextContent('Moved on 1 block since, assuming no missed turn.')
    expect(document.getElementById('rx-announcer')?.textContent ?? '').not.toMatch(
      /New Platform block/,
    )
  }, 20_000)

  it('says updates are paused when Platform stops answering, and offers to try again @RA-62', async () => {
    const original = sdk.call.bind(sdk)
    const spy = vi
      .spyOn(sdk, 'call')
      .mockImplementation((net, method, args, signal) =>
        method === 'epoch.current'
          ? Promise.reject(Object.assign(new Error('down'), { source: 'sdk', kind: 'network' }))
          : original(net, method, args, signal),
      )
    onTestFinished(() => {
      spy.mockRestore()
    })
    renderAt('/epochs')
    const upcoming = await card('upcoming')
    const strip = await waitFor(() => upcoming.querySelector('.rx-livesched')!)
    await waitFor(() => expect(strip).toHaveAttribute('data-live', 'paused'), { timeout: 12_000 })
    expect(strip).toHaveTextContent('Updates paused')
    expect(within(upcoming).getByRole('button', { name: 'Try again' })).toBeVisible()
    // The change of state is announced once; blocks never are.
    await waitFor(() =>
      expect(document.getElementById('rx-announcer')).toHaveTextContent('Platform updates paused'),
    )
  }, 20_000)

  it('drops everything of the crawl when Decentralized only mode is switched on, and shows a dash once Platform is not answering @RA-60 @RA-62', async () => {
    setDapiTransport(noDapi)
    const original = sdk.call.bind(sdk)
    const spy = vi
      .spyOn(sdk, 'call')
      .mockImplementation((net, method, args, signal) =>
        method === 'epoch.current'
          ? Promise.reject(Object.assign(new Error('down'), { source: 'sdk', kind: 'network' }))
          : original(net, method, args, signal),
      )
    onTestFinished(() => {
      spy.mockRestore()
    })
    renderAt('/epochs')
    const rewards = await card('rewards')
    const upcoming = await card('upcoming')
    // Only the crawl answers: its pool and its order stand in.
    await waitFor(() => expect(rewards).toHaveTextContent('From Radar’s crawl; fees not counted'))
    await waitFor(() =>
      expect(upcoming).toHaveTextContent('From Radar’s last look at the validator sets'),
    )
    act(() => {
      writeSourceMode('decentralized')
    })
    await waitFor(() =>
      expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1),
    )
    const zone = document.getElementById('radar-zone')!
    // The section starts over in the new mode; once its first read has failed, nothing is loading any more and the
    // figures with no source say so with a dash.
    await waitFor(
      () => {
        expect(zone.querySelector('.rx-livesched')).toHaveAttribute('data-live', 'paused')
        const after = document.getElementById('rewards')!
        expect(after.querySelector('[data-skeleton]')).toBeNull()
        expect(after).toHaveTextContent(/Pool so far\s*—/)
      },
      { timeout: 15_000 },
    )
    expect(document.getElementById('rewards')).not.toHaveTextContent('Radar’s crawl;')
    expect(document.getElementById('upcoming')).not.toHaveTextContent('Radar’s last look')
    expect(zone.querySelector('[data-source="radar"]')).toBeNull()
  }, 30_000)

  it('starts over on the other network when the network switches @RA-62', async () => {
    const history = renderAt('/epochs')
    const upcoming = await card('upcoming')
    await waitFor(() => expect(rows(upcoming)).toHaveLength(12))
    const mainnet = rows(upcoming).map((r) => r.getAttribute('data-row-id'))
    history.push('/epochs?network=testnet')
    await waitFor(() =>
      expect(
        document.querySelector('#upcoming [data-tip-height="668393"]'),
        'the testnet tip',
      ).not.toBeNull(),
    )
    const testnet = await card('upcoming')
    await waitFor(() => expect(rows(testnet)).toHaveLength(12))
    const ids = rows(testnet).map((r) => r.getAttribute('data-row-id'))
    expect(ids.some((id) => mainnet.includes(id))).toBe(false)
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

  it('keeps the live pool and schedule in Decentralized only mode and says the crawl parts need Radar, once @RA-60 @RA-62', async () => {
    writeSourceMode('decentralized')
    renderAt('/epochs')
    await card('current-epoch')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1),
    )
    const rewards = await card('rewards')
    await waitFor(() => expect(rewards).toHaveTextContent('Core block rewards to Core block'))
    const upcoming = await card('upcoming')
    await waitFor(() => expect(rows(upcoming)).toHaveLength(12))
    expect(document.getElementById('history')).toBeNull()
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
    await waitFor(() =>
      expect(tally.querySelector('.rx-card__sub')).toHaveTextContent(
        '354 votes are on record: 352 from enabled evonodes and 2 from evonodes that are no longer enabled. The shares are of the votes on record; the activation threshold counts all 363 enabled evonodes.',
      ),
    )
    expect(vote).toHaveTextContent(/Reported by \d+ of \d+ evonodes/)
  })

  it('lists each figure once on the vote section line, under the source that served it @RA-61', async () => {
    renderAt('/protocol')
    const vote = await card('vote')
    await waitFor(() => expect(vote).toHaveTextContent('Activation threshold'))
    const covers = (proved: boolean) =>
      [...document.querySelectorAll(`[data-proved="${proved}"] [data-covers]`)]
        .map((el) => el.textContent ?? '')
        .join(' ')
    await waitFor(() => expect(covers(true)).toContain('Upgrade vote'))
    expect(covers(false)).not.toContain('Upgrade vote')
    expect(covers(false)).toContain('Votes for it')
    expect(covers(true)).not.toContain('Votes for it')
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
    await waitFor(() => expect(vote).toHaveTextContent('more than the 42 enabled now'))
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
