import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { App } from '@/app'
import { delay, http, HttpResponse } from 'msw'
import { writeSourceMode } from '@/lib/source-mode'
import { fixtureBody } from '@/test/fixtures/load'
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
  it('does not call an epoch complete once it has run past its expected end @NX-01 @RA-60', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 400 * 86_400_000 })
    try {
      renderAt('/platform')
      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Epoch 88 is running past its expected end',
        }),
      ).toHaveAttribute('data-claim')
      expect(screen.queryByText(/100% through/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens with how far the epoch is, then its pool and what a block pays @NX-01 @RA-60', async () => {
    const doc = await fixtureBody<{ schedule: { ts: number } }>('radar', 'mainnet', 'platform')
    vi.useFakeTimers({ toFake: ['Date'], now: doc.schedule.ts * 1000 })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    renderAt('/platform')
    expect(await screen.findByRole('heading', { level: 1, name: 'Platform' })).toBeInTheDocument()
    const h1 = await screen.findByRole('heading', { level: 1, name: /^Epoch 88 is \d+% through$/ })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const lead = await card('epoch-now')
    expect(h1.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      lead.compareDocumentPosition(await card('vitals')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const clock = within(lead).getByRole('meter', { name: 'Epoch 88 progress' })
    expect(clock).toHaveAttribute('aria-valuetext', expect.stringMatching(/% through/))
    expect(lead.querySelector('.rx-clock__axis')).not.toHaveTextContent('% through')
    expect(lead.querySelector('.rx-clock__n')).toBeNull()
    await waitFor(() =>
      expect(lead.querySelector('[data-epoch-rewards] [data-amount]')).not.toBeNull(),
    )
    for (const label of [
      'Pool so far',
      'Last pool',
      'Per block',
      'Median monthly earnings',
      'Median yield',
    ])
      expect(within(lead).getByText(label)).toBeInTheDocument()
    // The pool and the pay are the epoch that just ended, not the oldest one Radar still lists.
    expect(within(lead).getAllByText('Epoch 87')).toHaveLength(2)
    const line = document.querySelector('.rx-page__src')!
    await waitFor(() => expect(line.querySelector('[data-source="radar"]')).not.toBeNull())
    expect(line.querySelector('[data-source="sdk"][data-proved="true"]')).not.toBeNull()
  })

  it('shows the proof-checked vital signs after it, and says the quorum count is not proved @NX-01', async () => {
    renderAt('/platform')
    const vitals = await card('vitals')
    await waitFor(() => expect(vitals).toHaveTextContent('Platform height'))
    await waitFor(() => expect(vitals).toHaveTextContent(/Total credits/))
    await waitFor(() => expect(vitals.querySelector('[data-amount]')).not.toBeNull())
    expect(vitals).toHaveTextContent('Protocol version')
    expect(vitals).not.toHaveTextContent(/Epoch\s*88/)
    await waitFor(() => expect(vitals).toHaveTextContent('Not proof-checked'))
    const figure = (label: string) =>
      within(vitals).getByText(label).closest<HTMLElement>('.rx-stat')!
    for (const label of ['Platform height', 'Total credits', 'Protocol version'])
      await waitFor(() => expect(figure(label)).toHaveAttribute('data-reports', 'sdk:proved'))
    await waitFor(() => expect(figure('Active quorums')).toHaveAttribute('data-reports', 'sdk'))
    expect(
      figure('Platform height').querySelector('.rx-fig__src [data-proved="true"]'),
    ).not.toBeNull()
    expect(
      figure('Active quorums').querySelector('.rx-fig__src [data-proved="false"]'),
    ).not.toBeNull()
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
    expect(proposers.querySelector('[data-source]')).toBeNull()
    expect(proposers).not.toHaveClass('rx-phone5')
    expect(proposers.querySelector('table')).toHaveClass('rx-table--cards')
    expect(proposers.querySelector('table')).not.toHaveClass('rx-table--scrolls')
    expect(within(proposers).getByRole('columnheader', { name: 'Rank' })).toBeInTheDocument()
    const ranks = rows.slice(1).map((r) => r.querySelectorAll('td')[0]?.textContent ?? '')
    blocks.forEach((count, i) => {
      if (blocks[i + 1] === count) expect(ranks[i]).toBe(ranks[i + 1])
    })
    await waitFor(() =>
      expect(
        document.querySelector('#chain [data-section-sources] [data-proved="false"]'),
      ).not.toBeNull(),
    )
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

  it('opens an exact .dash name at once, and says at once when the input cannot be placed @NX-03', async () => {
    const user = userEvent.setup()
    renderAt('/platform')
    const box = await screen.findByRole('textbox', {
      name: 'Identity ID, name.dash, token ID or epoch number',
    })
    await user.type(box, 'what is this?!{Enter}')
    expect(await screen.findByText(/not an identity ID, a name, a token ID/)).toBeInTheDocument()
    expect(document.querySelector('[data-page="/platform"]')).not.toBeNull()
    await user.clear(box)
    await user.type(box, 'ab.dash{Enter}')
    expect(await screen.findByText(/not an identity ID, a name, a token ID/)).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, 'Pshenmic.dash{Enter}')
    await waitFor(() => expect(document.querySelector('[data-page="/name/$label"]')).not.toBeNull())
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

  it('holds a list still, and says it is paused, while the pointer is over it @PE-02', async () => {
    const user = userEvent.setup()
    renderAt('/platform')
    const blocks = await ready('newest-blocks')
    const list = blocks.querySelector<HTMLElement>('[data-list="blocks"]')!
    await user.hover(list)
    expect(list).toHaveAttribute('data-held', 'true')
    expect(within(blocks).getByRole('status')).toHaveTextContent('Paused')
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
    for (const id of ['board-active-identities', 'board-tokens', 'board-contracts']) {
      await card(id)
    }
    expect(document.getElementById('board-contracts-rated')).toBeNull()
  })

  it('ranks each board by the figure it shows, whatever order PE answers in @NX-01 @PE-05', async () => {
    const PE = 'https://api.pe.dashhq.org'
    const id = (n: number) => `${String(n).padStart(2, '1')}${'A'.repeat(41)}`
    const page = (items: unknown[]) =>
      HttpResponse.json({
        pagination: { page: 1, limit: 50, total: items.length },
        resultSet: items,
      })
    const windows: string[] = []
    server.use(
      http.get(`${PE}/dataContracts/active`, ({ request }) => {
        windows.push(new URL(request.url).searchParams.get('timestamp_start') ?? '')
        // /dataContracts/active groups by contract ID; merging the same ID is a safeguard, kept by this answer.
        return page(
          [
            [0, 0],
            [1, 31],
            [2, 271],
            [3, 105],
            [2, 0],
            [1, 4],
          ].map(([i, n]) => ({
            identifier: id(i!),
            transitionsCount: n,
          })),
        )
      }),
      http.get(`${PE}/identities/active`, () =>
        page([1, 1, 4, 1, 2, 0].map((n, i) => ({ identifier: id(i), transactionsCount: n }))),
      ),
    )
    renderAt('/platform')
    const rows = (board: string) =>
      Array.from(document.querySelectorAll(`[data-board="${board}"] li`)).map((li) => ({
        rank: li.querySelector('.rx-board__rank')?.textContent,
        figure: li.querySelector('.rx-board__fig')?.textContent,
      }))
    await waitFor(() =>
      expect(rows('board-contracts')).toEqual([
        { rank: '1', figure: '271' },
        { rank: '2', figure: '105' },
        { rank: '3', figure: '35' },
      ]),
    )
    expect(Date.now() - Date.parse(windows[0]!)).toBeGreaterThan(29 * 86_400_000)
    await waitFor(() =>
      expect(rows('board-active-identities')).toEqual([
        { rank: '1', figure: '4' },
        { rank: '2', figure: '2' },
        { rank: '=3, tied', figure: '1' },
        { rank: '=3, tied', figure: '1' },
        { rank: '=3, tied', figure: '1' },
      ]),
    )
  })

  it('puts a board with nothing above zero in the short row and says so in its card @NX-01', async () => {
    const PE = 'https://api.pe.dashhq.org'
    server.use(
      http.get(`${PE}/tokens/rating`, () =>
        HttpResponse.json({
          pagination: { page: 1, limit: 50, total: 2 },
          resultSet: [
            { tokenIdentifier: 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB', transitionCount: 0 },
            { tokenIdentifier: 'DYqxCsuDgYsEAJ2ADnimkwNdL7C4xbe4No4so19X9mmd', transitionCount: 0 },
          ],
        }),
      ),
    )
    renderAt('/platform')
    const richest = await ready('board-richest')
    expect(within(richest).getByRole('button', { name: 'Transitions' })).toBeInTheDocument()
    const tokens = await ready('board-tokens')
    expect(tokens.closest('[data-group="short"]')).not.toBeNull()
    expect(tokens.querySelector('[data-board-none]')).toHaveTextContent(
      'No activity in the last 30 days.',
    )
    expect(tokens.querySelectorAll('li')).toHaveLength(0)
    expect(document.querySelector('[data-quiet-boards]')).toBeNull()
  })

  it('counts validators, linking to the platform masternode view @PE-06', async () => {
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
  })

  it('names the newest indexed block, who proposed it and the quorum that signed it @PE-06', async () => {
    renderAt('/platform')
    const block = await ready('latest-block')
    const facts = block.querySelector('[data-last-proposer]')!
    expect(facts).toHaveTextContent('470,592')
    expect(facts.querySelector('[data-entity="evonode"]')?.getAttribute('data-id')).toMatch(
      /^0ac126ca993c3633e9ce99e9b5f0f93a4566973bc2ef9136d97e14c8dc80d931$/i,
    )
    expect(facts.querySelector('[data-signing-quorum] [data-entity="quorum"]')).toHaveAttribute(
      'data-id',
      '0000000000000016d05699f6ddf7ede9e7ce3a0949df14d4df8d5a881e683dce',
    )
    // The quorums are counted and sized once, under "On the chain"; no second list or height repeats them.
    expect(document.getElementById('quorum-list')).toBeNull()
    expect(document.querySelectorAll('[data-quorum-sizes]')).toHaveLength(1)
  })

  it('shows no rows of the last network while the next one answers @PE-05 @PE-36', async () => {
    const history = createMemoryHistory({ initialEntries: ['/platform'] })
    render(<App history={history} />)
    const contracts = await ready('board-contracts')
    await waitFor(() => expect(contracts.querySelectorAll('li').length).toBeGreaterThan(0))
    const mainnetIds = [...contracts.querySelectorAll('[data-board] [data-id]')].map((el) =>
      el.getAttribute('data-id'),
    )
    const TESTNET_PE = 'https://api.testnet.pe.dashhq.org'
    server.use(
      http.get(`${TESTNET_PE}/dataContracts/active`, async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    act(() => history.push('/platform?network=testnet'))
    await waitFor(() =>
      expect(document.getElementById('board-contracts')).toHaveAttribute('data-state', 'loading'),
    )
    const after = document.getElementById('board-contracts')!
    for (const id of mainnetIds) expect(after.querySelector(`[data-id="${id}"]`)).toBeNull()
    expect(after.querySelectorAll('li')).toHaveLength(0)
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
    expect(
      await screen.findByRole('heading', { level: 1, name: /^Epoch 88 is/ }),
    ).toBeInTheDocument()
    expect(document.querySelector('#epoch-now [role="meter"]')).not.toBeNull()
    expect(document.querySelector('[data-epoch-rewards]')).toBeNull()
    expect(document.getElementById('pulse')).toBeNull()
    expect(document.getElementById('chart-transitions')).toBeNull()
    expect(hosted).toEqual([])
    await waitFor(() => expect(document.querySelector('#vitals .rx-amt .rx-fiat')).toBeNull())
  })
})
