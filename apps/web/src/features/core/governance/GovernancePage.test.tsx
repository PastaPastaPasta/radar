import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { core } from '@/data/core/client'
import { SourceError } from '@/data/errors'
import { resetHealthRegistry } from '@/data/health'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { renderAt } from '../hy-shared/test-utils'

// The canvas cannot draw here; the stand-in keeps the option it was given, so a test can read what would be drawn.
vi.mock('@/ui/chart-view', () => ({
  default: ({ option }: { option: { series?: unknown } }) => (
    <i data-drawn={JSON.stringify(option.series)} />
  ),
}))

const HASH = '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c'
const OLD = 'e'.repeat(64)

interface HyProposalBody {
  hash: string
  name: string
  votes: { yes: number; no: number; abstain: number }
  [k: string]: unknown
}

/** A proposal only Hyphen's older index has: Insight's node no longer holds it. */
async function olderProposal(): Promise<HyProposalBody> {
  const page = await fixtureBody<{ value: HyProposalBody[] }>(
    'hyphen',
    'testnet',
    'proposals--limit-100',
  )
  return { ...page.value[0]!, hash: OLD, name: 'Older budget request' }
}

/** A DAPI tip at the recorded height, so the next superblock's time and so its budget split are known. */
const tipKnown = () =>
  vi.spyOn(core, 'tip').mockResolvedValue({
    source: 'dapi',
    asOf: Date.now(),
    fetchedAt: Date.now(),
    proved: false,
    data: { height: 2_570_085, hash: '00', time: Date.now() },
  })

afterEach(() => vi.restoreAllMocks())

describe('Governance page', () => {
  it.each([
    [
      'dapi',
      () =>
        vi
          .spyOn(core, 'masternodeList')
          .mockRejectedValue(
            new SourceError({ source: 'dapi', kind: 'network', message: 'No node answered' }),
          ),
    ],
    [
      'insight',
      () =>
        server.use(
          http.get('*/insight-api/gobject/info', () => HttpResponse.json({}, { status: 503 })),
        ),
    ],
  ])(
    'says %s is not answering, and keeps the proposals, when the threshold or budget source is down @X-09',
    async (source, down) => {
      down()
      renderAt('/governance')
      const alert = await waitFor(
        () => {
          const el = document.querySelector(`#proposals [role="alert"][data-source="${source}"]`)
          expect(el).not.toBeNull()
          return el!
        },
        { timeout: 10_000 },
      )
      expect(alert).toBeInTheDocument()
      expect(document.querySelectorAll('tbody[data-proposal]').length).toBeGreaterThan(0)
    },
  )

  it('says the exact threshold isn’t known, and takes Core’s own flag from Hyphen, until DAPI’s list answers @HY-13', async () => {
    vi.spyOn(core, 'masternodeList').mockReturnValue(new Promise(() => undefined))
    const page = await fixtureBody<{ value: HyProposalBody[] }>(
      'hyphen',
      'mainnet',
      'proposals--limit-100',
    )
    renderAt('/governance')
    const note = await waitFor(() => {
      const el = document.querySelector('[data-funding-threshold]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(note).toHaveAttribute('data-funding-threshold', 'unknown')
    expect(note).toHaveTextContent(
      'The exact funding threshold isn’t known until DAPI’s masternode list answers.',
    )
    const rows = await waitFor(() => {
      const all = document.querySelectorAll<HTMLElement>('tbody[data-proposal]')
      expect(all.length).toBeGreaterThan(0)
      return all
    })
    for (const row of rows) {
      const p = page.value.find((x) => x.hash === row.dataset.proposal)!
      const open = row.dataset.status !== 'ended' && row.dataset.status !== 'invalid'
      if (open) expect(['funded', 'passing'].includes(row.dataset.status!)).toBe(p.funded === true)
      expect(row.querySelector('td.rx-votes--last')).not.toHaveTextContent('/')
    }
  })

  it('shows the budget split and a proposal table with status, votes and amounts @HY-13', async () => {
    tipKnown()
    renderAt('/governance')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /^\d+ of \d+ open proposals? ha(s|ve) the votes to be funded$/,
      }),
    ).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Budget proposals' })
    for (const head of ['Proposal', 'Status', 'Yes', 'No', 'Abstain', 'Amount']) {
      expect(within(table).getByRole('columnheader', { name: head })).toBeInTheDocument()
    }
    const budget = document.querySelector('[data-budget]')
    expect(budget).toHaveTextContent('Funded')
    expect(budget).toHaveTextContent('Not passing')
    expect(
      await screen.findByRole('table', { name: /Requested payments of open proposals/ }),
    ).toBeInTheDocument()
  })

  it('draws each status in one colour: the donut, the tile beside it and the row edge @HY-13', async () => {
    tipKnown()
    renderAt('/governance')
    await screen.findByRole('table', { name: 'Budget proposals' })
    const drawn = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-drawn]')
      expect(el).not.toBeNull()
      return JSON.parse(el!.dataset.drawn!) as {
        data: { name: string; itemStyle: { color: string } }[]
      }[]
    })
    expect(drawn[0]!.data.map((d) => [d.name, d.itemStyle.color])).toEqual([
      ['Funded', 'var(--dh-good)'],
      ['Passing, not yet funded', 'var(--dh-brand)'],
      ['Not passing', 'var(--dh-warn)'],
    ])
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-budget] .rx-stat')]
    expect(tiles.map((t) => t.dataset.tone)).toEqual(['good', 'info', 'warn'])
  })

  it('narrows the table by a typed name or hash and says how many match @HY-13', async () => {
    const user = userEvent.setup()
    renderAt('/governance')
    const table = await screen.findByRole('table', { name: 'Budget proposals' })
    const total = document.querySelectorAll('[data-proposal]').length
    expect(total).toBeGreaterThan(3)
    const box = screen.getByRole('searchbox', { name: 'Filter proposals by name or hash' })
    await user.type(box, 'growthengine')
    await waitFor(() => expect(document.querySelectorAll('[data-proposal]').length).toBe(1))
    expect(within(table).getByRole('button', { name: 'DashDaoGrowthEngine' })).toBeInTheDocument()
    expect(screen.getByText(`1 of ${total} proposals match`)).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, HASH.slice(0, 12).toUpperCase())
    await waitFor(() => expect(document.querySelectorAll('[data-proposal]').length).toBe(1))
    expect(document.querySelector(`[data-proposal="${HASH}"]`)).not.toBeNull()
    await user.clear(box)
    await user.type(box, 'no such proposal anywhere')
    expect(await screen.findByText('No proposals match')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Budget proposals' })).toBeNull()
    await user.clear(box)
    await waitFor(() => expect(document.querySelectorAll('[data-proposal]').length).toBe(total))
  })

  it('keeps the match count in a status region that is on the page before the first filter, so it is announced @HY-13', async () => {
    const user = userEvent.setup()
    renderAt('/governance')
    await screen.findByRole('table', { name: 'Budget proposals' })
    const region = screen.getByRole('status', { name: '' })
    expect(region).toHaveAttribute('data-filter-result')
    expect(region).toBeEmptyDOMElement()
    await user.type(
      screen.getByRole('searchbox', { name: 'Filter proposals by name or hash' }),
      'growthengine',
    )
    await waitFor(() => expect(region).toHaveTextContent(/^1 of \d+ proposals match$/))
    expect(document.querySelector('[data-filter-result]')).toBe(region)
  })

  it('narrows the table by status, with the counts of each @HY-13', async () => {
    const user = userEvent.setup()
    renderAt('/governance')
    await screen.findByRole('table', { name: 'Budget proposals' })
    const group = screen.getByRole('group', { name: 'Filter proposals by status' })
    const total = document.querySelectorAll('[data-proposal]').length
    const count = (name: string) => {
      const label = within(group).getByRole('button', { name: new RegExp(`^${name}`) }).textContent
      return Number(/[\d,]+$/.exec(label ?? '')?.[0].replace(/,/g, ''))
    }
    expect(count('All')).toBe(total)
    const funded = count('Funded')
    const failing = count('Not passing')
    expect(funded + failing).toBeGreaterThan(0)
    for (const [name, n, label] of [
      ['Not passing', failing, 'Not passing'],
      ['Funded', funded, 'Funded'],
    ] as const) {
      await user.click(within(group).getByRole('button', { name: new RegExp(`^${name}`) }))
      expect(within(group).getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await waitFor(() => expect(document.querySelectorAll('[data-proposal]').length).toBe(n))
      for (const row of document.querySelectorAll('[data-proposal]')) {
        expect(
          within(row as HTMLElement).getByText(label, { selector: '.dh-badge, .dh-badge *' }),
        ).toBeInTheDocument()
      }
    }
    await user.click(within(group).getByRole('button', { name: /^All/ }))
    await waitFor(() => expect(document.querySelectorAll('[data-proposal]').length).toBe(total))
  })

  it('groups yes, no, abstain and net votes under one Votes heading @HY-13', async () => {
    renderAt('/governance')
    const table = await screen.findByRole('table', { name: 'Budget proposals' })
    const group = within(table).getByRole('columnheader', { name: 'Votes' })
    expect(group).toHaveAttribute('colspan', '4')
    const heads = [...table.querySelectorAll('thead tr:last-child th')]
    const grouped = heads.filter((h) => h.classList.contains('rx-votes')).map((h) => h.textContent)
    expect(grouped).toEqual(['Yes', 'No', 'Abstain', 'Net votes'])
    const row = document.querySelector('[data-proposal] tr')!
    expect(row.querySelectorAll('td.rx-votes')).toHaveLength(4)
    const line = row.querySelector('.rx-propline')!
    expect(line).toHaveAttribute('aria-hidden', 'true')
    expect(line.textContent).toMatch(/^[\d,]+ yes · [\d,]+ no · [\d,]+ abstain · net -?[\d,]+$/)
  })

  it('expands a proposal to its details, with a link out to Governance @HY-13 @X-11', async () => {
    const user = userEvent.setup()
    renderAt('/governance')
    const row = await screen.findByRole('button', { name: 'DashDaoGrowthEngine' })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    await user.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    const details = document.querySelector<HTMLElement>('[data-proposal-details]')!
    expect(within(details).getByText('Paid to')).toBeInTheDocument()
    expect(within(details).getByText('Voting window')).toBeInTheDocument()
    const vote = within(details).getByRole('link', { name: /Vote in Governance/ })
    expect(vote).toHaveAttribute('href', `https://gov.dashhq.org/p/h/${HASH}`)
    expect(vote).toHaveAttribute('rel', 'noopener noreferrer')
    await user.click(row)
    expect(document.querySelector('[data-proposal-details]')).toBeNull()
  })

  it('gives each proposal name a chevron that says it expands, and keeps it a real button @HY-13', async () => {
    const user = userEvent.setup()
    renderAt('/governance')
    const button = await screen.findByRole('button', { name: 'DashDaoGrowthEngine' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.querySelector('svg.rx-propname__chevron')).not.toBeNull()
    expect(button).toHaveAttribute('aria-controls')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button.querySelector('svg.rx-propname__chevron')).not.toBeNull()
  })

  it('shows when each proposal ends to the minute, not only the day @HY-13', async () => {
    renderAt('/governance')
    await screen.findByRole('table', { name: 'Budget proposals' })
    const ends = [...document.querySelectorAll('td.rx-propends time')]
    expect(ends.length).toBeGreaterThan(5)
    for (const time of ends) {
      expect(time.textContent).toMatch(/^\d{1,2} [A-Z][a-z]{2,4}( \d{4})?,? \d{2}:\d{2} \S+$/)
      expect(time).toHaveAttribute('title', expect.stringMatching(/T\d{2}:\d{2}:\d{2}Z$/))
    }
  })

  it('sizes the proposal expander to at least 24px in both directions, as an inline style the component CSS cannot override @HY-13', async () => {
    renderAt('/governance')
    const row = await screen.findByRole('button', { name: 'DashDaoGrowthEngine' })
    expect(row.style.minBlockSize).toBe('24px')
    expect(row.style.minInlineSize).toBe('24px')
  })

  it('leads each row with the proposal name, with its hash secondary and its status on the leading edge @HY-13', async () => {
    renderAt('/governance')
    const button = await screen.findByRole('button', { name: 'DashDaoGrowthEngine' })
    const body = button.closest('tbody')!
    expect(body).toHaveAttribute('data-status')
    const cell = button.closest('td')!
    expect(cell.className).toContain('rx-propcell')
    const hash = cell.querySelector('[data-proposal-hash]')!
    expect(hash).toHaveAttribute('title', body.getAttribute('data-proposal'))
    expect(hash.textContent).toMatch(/^[0-9a-f]{8}…[0-9a-f]{6}$/)
    expect(button.compareDocumentPosition(hash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const statuses = new Set(
      [...document.querySelectorAll('tbody[data-proposal]')].map((b) =>
        b.getAttribute('data-status'),
      ),
    )
    for (const status of statuses)
      expect(['funded', 'passing', 'failing', 'ended', 'invalid']).toContain(status)
    const table = within(screen.getByRole('table', { name: 'Budget proposals' }))
    expect(table.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(table.getByRole('columnheader', { name: 'Votes' })).toBeInTheDocument()
  })

  it('works on testnet @HY-19', async () => {
    renderAt('/governance?network=testnet')
    expect(await screen.findByRole('button', { name: 'test' })).toBeInTheDocument()
  })

  it('reads testnet proposals from Insight while Hyphen trails, and says so @IN-16 @HY-19', async () => {
    renderAt('/governance?network=testnet')
    await screen.findByRole('button', { name: 'test' })
    await waitFor(() => expect(document.querySelector('[data-source="insight"]')).not.toBeNull())
    expect(document.querySelector('[data-source="hyphen"]')).toBeNull()
    expect(document.querySelector('[data-stale-index]')).toBeNull()
  })
})

describe('Governance page while Hyphen’s index is stale @IN-16 @HY-19', () => {
  const tip = (time: number) =>
    vi.spyOn(core, 'tip').mockResolvedValue({
      source: 'dapi',
      asOf: 0,
      fetchedAt: 0,
      proved: false,
      data: { height: 1_589_232, hash: '00', time },
    })

  it('never paints Hyphen’s list before it has learned to read Insight’s, however slow the probe is', async () => {
    resetHealthRegistry()
    const status = await fixtureBody<Record<string, unknown>>('hyphen', 'testnet', 'status')
    server.use(
      http.get('*/x/hy/testnet/status', async () => {
        await delay(400)
        return HttpResponse.json(status)
      }),
    )
    renderAt('/governance?network=testnet')
    await screen.findByRole('button', { name: 'test' })
    await waitFor(() =>
      expect(document.querySelector('.rx-page__src [data-source="insight"]')).not.toBeNull(),
    )
    expect(document.querySelector('[data-page] [data-source="hyphen"]')).toBeNull()
  })

  it('adds the proposals only Hyphen still has after Insight’s, labelled as Hyphen’s and behind', async () => {
    const old = await olderProposal()
    const page = await fixtureBody<{ value: unknown[] }>(
      'hyphen',
      'testnet',
      'proposals--limit-100',
    )
    server.use(
      http.get('*/x/hy/testnet/proposals', () =>
        HttpResponse.json({ ...page, asOfHeight: 1_577_999, value: [...page.value, old] }),
      ),
    )
    renderAt('/governance?network=testnet')
    const older = await screen.findByRole('button', { name: 'Older budget request' })
    const group = document.querySelector('[data-earlier-proposals]')!
    expect(group).toHaveTextContent('Earlier proposals, from Hyphen’s index')
    const rows = [...document.querySelectorAll<HTMLElement>('[data-proposal]')].map(
      (r) => r.dataset.proposal,
    )
    expect(rows.at(-1)).toBe(OLD)
    expect(rows).toHaveLength(5)
    expect(group.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const line = document.querySelector('.rx-page__src')!
    await waitFor(() => expect(line.querySelector('[data-source="insight"]')).not.toBeNull())
    expect(line.querySelector('[data-source="hyphen"]')).not.toBeNull()
    expect(document.querySelector('#proposals [data-source]:not([role="alert"])')).toBeNull()
    expect(document.querySelector('[data-stale-index]')).toHaveTextContent(
      'Earlier proposals below are from Hyphen’s index',
    )
  })

  it('keeps Insight’s own copy when both indexes have a proposal', async () => {
    renderAt('/governance?network=testnet')
    await screen.findByRole('button', { name: 'test' })
    expect(document.querySelectorAll('[data-proposal]')).toHaveLength(4)
    expect(document.querySelector('[data-earlier-proposals]')).toBeNull()
  })

  it('says Funded and Passing are worked out from Insight’s vote counts and the superblock time', async () => {
    tip(1_760_000_000_000)
    renderAt('/governance?network=testnet')
    await screen.findByRole('button', { name: 'test' })
    await waitFor(() =>
      expect(document.querySelector('[data-derived-funding]')).toHaveTextContent(
        'Funded is worked out by Radar the way Dash Core builds the next superblock',
      ),
    )
  })

  it('shows no proposal as funded, and says why, when the superblock time cannot be found', async () => {
    vi.spyOn(core, 'tip').mockRejectedValue(new Error('no DAPI'))
    renderAt('/governance?network=testnet')
    await screen.findByRole('button', { name: 'test' })
    expect(document.querySelector('[data-derived-funding]')).toHaveTextContent(
      'The next superblock’s budget or time isn’t known, so no proposal is shown as Funded.',
    )
    for (const row of document.querySelectorAll('[data-proposal]')) {
      expect(row).not.toHaveTextContent(/\bFunded\b/)
    }
  })
})

describe('Governance cycle', () => {
  const tipAnswer = (height: number, time: number, fetchedAt = time) => ({
    source: 'dapi' as const,
    asOf: time,
    fetchedAt,
    proved: false,
    data: { height, hash: '00', time },
  })
  const tipAt = (height: number, time: number, fetchedAt = time) =>
    vi.spyOn(core, 'tip').mockResolvedValue(tipAnswer(height, time, fetchedAt))
  /** Mainnet's last three superblocks ran at 157.614 s a block (2,525,632 to 2,558,864 as Hyphen dates them). */
  const countdown = (card: HTMLElement, which: string) =>
    card.querySelector(`[${which}] [data-countdown]`)?.textContent ?? ''
  const cycle = () =>
    waitFor(() => {
      const el = document.querySelector<HTMLElement>('#cycle [data-cycle]')
      expect(el).not.toBeNull()
      return el!
    })

  it('shows the next superblock, a live countdown, the voting deadline and the budget, from Core and DAPI', async () => {
    // Core's answer: next superblock 2,575,480, maturity window 1,662, budget 6,828.2637816 DASH.
    tipAt(2_573_000, Date.now())
    renderAt('/governance')
    const card = await cycle()
    await waitFor(() =>
      expect(card.querySelector('[data-next-superblock]')).toHaveTextContent('#2,575,480'),
    )
    // 2,480 blocks at the measured 157.614 s is 4 d 12 h 34 min, with no seconds while over a day.
    await waitFor(() =>
      expect(countdown(card, 'data-superblock-eta')).toMatch(/^4 d 12 h (33|34) min$/),
    )
    expect(card.querySelector('[data-superblock-eta]')).toHaveTextContent(
      '2,480 blocks to go, at 2.63 minutes a block, as the last superblocks ran',
    )
    // Voting closes at 2,575,480 − 1,662 = 2,573,818, 818 blocks on: 1 d 11 h 48 min.
    const deadline = card.querySelector('[data-voting-deadline]')!
    expect(deadline).toHaveAttribute('data-voting-deadline', '2573818')
    expect(countdown(card, 'data-voting-deadline')).toMatch(/^1 d 11 h (47|48) min$/)
    expect(card.querySelector('[data-cycle-budget]')).toHaveTextContent('6,828.26')
    expect(card.querySelector('[data-cycle-budget]')).toHaveTextContent('16,616 blocks')
    expect(card.querySelector('[data-superblock-eta] [data-source="dapi"]')).not.toBeNull()
    expect(card.querySelector('[data-next-superblock] [data-source="insight"]')).not.toBeNull()
  })

  it('falls back to Dash Core’s 2.62 minutes a block when the past superblocks can’t be dated', async () => {
    tipAt(2_573_000, Date.now())
    server.use(http.get('*/x/hy/mainnet/block/:id', () => HttpResponse.json({}, { status: 503 })))
    renderAt('/governance')
    const card = await cycle()
    await waitFor(() =>
      expect(card.querySelector('[data-superblock-eta]')).toHaveTextContent(
        '2,480 blocks to go, at Dash Core’s 2.62 minutes a block',
      ),
    )
    // 2,480 × 157.2 s is 4 d 12 h 17 min.
    expect(countdown(card, 'data-superblock-eta')).toMatch(/^4 d 12 h (16|17) min$/)
  })

  it('counts from when the tip was read, so a stalled chain never counts down to 0', async () => {
    // The tip is ten hours old, as on a stalled testnet; 10 blocks are still to come.
    tipAt(2_575_470, Date.now() - 36_000_000, Date.now())
    renderAt('/governance')
    const card = await cycle()
    await waitFor(() => expect(countdown(card, 'data-superblock-eta')).toMatch(/^26 min \d\d s$/))
  })

  it('says Insight is behind, not “0 blocks to go”, once DAPI’s tip has reached its next superblock', async () => {
    tipAt(2_575_480, Date.now())
    renderAt('/governance')
    const card = await cycle()
    await waitFor(() =>
      expect(card.querySelector('[data-superblock-eta]')).toHaveTextContent(
        'Insight is behind: DAPI’s tip is already at block #2,575,480.',
      ),
    )
    expect(card.querySelector('[data-countdown]')).toBeNull()
    expect(card.querySelector('[data-superblock-eta]')).not.toHaveTextContent('0 blocks')
  })

  it('reads the tip again when a countdown reaches 0, so the deadline turns to passed', async () => {
    // One block before the deadline, read just under a block ago: the countdown ends in about a second.
    const now = Date.now()
    vi.spyOn(core, 'tip')
      .mockResolvedValueOnce(tipAnswer(2_573_817, now - 156_000, now - 156_000))
      .mockResolvedValue(tipAnswer(2_573_818, now + 2_000))
    renderAt('/governance')
    const card = await cycle()
    await waitFor(
      () =>
        expect(card.querySelector('[data-voting-deadline]')).toHaveTextContent('Deadline passed'),
      { timeout: 8_000 },
    )
  })

  it('ticks the countdown every second', async () => {
    tipAt(2_575_470, Date.now())
    renderAt('/governance')
    const card = await cycle()
    const clock = () => card.querySelector('[data-superblock-eta] [data-countdown]')?.textContent
    await waitFor(() => expect(clock()).toMatch(/^2\d min \d\d s$/))
    const first = clock()
    await waitFor(() => expect(clock()).not.toBe(first), { timeout: 2500 })
  })

  it('says voting has closed once the tip is inside the maturity window', async () => {
    tipAt(2_574_000, Date.now())
    renderAt('/governance')
    const card = await cycle()
    await waitFor(() =>
      expect(card.querySelector('[data-voting-deadline]')).toHaveTextContent('Deadline passed'),
    )
    expect(card.querySelector('[data-voting-deadline]')).toHaveTextContent(
      'the superblock’s payments are being settled',
    )
  })

  it('weighs this cycle’s budget against the passing proposals', async () => {
    tipAt(2_573_000, Date.now())
    renderAt('/governance')
    const card = await cycle()
    const use = await waitFor(() => {
      const el = card.querySelector<HTMLElement>('[data-cycle-use]')
      expect(el).not.toBeNull()
      return el!
    })
    const duffs = (sel: string) =>
      BigInt(use.querySelector(sel)?.getAttribute('data-duffs') ?? '-1')
    await waitFor(() => expect(duffs('[data-cycle-funded]')).toBeGreaterThanOrEqual(0n))
    expect(duffs('[data-cycle-left]')).toBe(682_826_378_160n - duffs('[data-cycle-funded]'))
    expect(duffs('[data-cycle-passing]')).toBeGreaterThanOrEqual(duffs('[data-cycle-funded]'))
  })

  it('lists the last three superblocks with their dates and what each paid, from Hyphen', async () => {
    tipAt(2_573_000, Date.now())
    renderAt('/governance')
    const card = await cycle()
    const rows = await waitFor(() => {
      const all = card.querySelectorAll<HTMLElement>('[data-past-superblocks] tr[data-superblock]')
      expect(all).toHaveLength(3)
      return [...all]
    })
    expect(rows.map((r) => r.dataset.superblock)).toEqual(['2558864', '2542248', '2525632'])
    await waitFor(() => expect(rows[0]!.querySelector('[data-paid]')).toHaveTextContent('5,393'))
    expect(rows[1]!.querySelector('[data-paid]')).toHaveTextContent('6,810')
    expect(rows[2]!.querySelector('[data-paid]')).toHaveTextContent('6,817')
    expect(rows[0]).toHaveTextContent('21 Oct 2026')
    expect(card.querySelector('[data-past-superblocks] [data-source="hyphen"]')).not.toBeNull()
  })

  it('says so when DAPI’s tip can’t be read, and still shows Core’s heights and budget', async () => {
    vi.spyOn(core, 'tip').mockRejectedValue(new Error('no DAPI'))
    renderAt('/governance')
    const card = await cycle()
    await waitFor(() =>
      expect(card.querySelector('[data-next-superblock]')).toHaveTextContent(
        'DAPI’s tip couldn’t be read',
      ),
    )
    expect(card.querySelector('[data-superblock-eta] [data-countdown]')).toBeNull()
    expect(card.querySelector('[data-voting-deadline]')).toHaveTextContent('#2,573,818')
    expect(card.querySelector('[data-cycle-budget]')).toHaveTextContent('6,828.26')
  })

  it('never shows Funded, Passing or the cycle’s totals as 0 while the budget read is pending', async () => {
    // DAPI's recorded tip, so Hyphen's index is current and lists the proposals.
    resetHealthRegistry()
    const info = await fixtureBody<unknown>('insight', 'mainnet', 'gobject__info')
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    server.use(
      http.get('*/insight-api/gobject/info', async () => {
        await held
        return HttpResponse.json(info as Record<string, unknown>)
      }),
    )
    renderAt('/governance')
    await waitFor(() =>
      expect(document.querySelectorAll('tbody[data-proposal]').length).toBeGreaterThan(5),
    )
    const stat = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('[data-budget] .rx-stat')].find((el) =>
        el.textContent?.startsWith(label),
      )!
    for (const label of ['Funded', 'Passing, not yet funded']) {
      expect(stat(label)).toHaveAttribute('aria-busy', 'true')
      expect(stat(label).querySelector('.rx-stat__value')).toBeNull()
    }
    const use = document.querySelector<HTMLElement>('#cycle [data-cycle-use]')
    if (use) {
      expect(use).toHaveAttribute('aria-busy', 'true')
      for (const sel of ['[data-cycle-passing]', '[data-cycle-funded]', '[data-cycle-left]'])
        expect(use.querySelector(sel)).not.toHaveAttribute('data-duffs')
    }
    const text = (sel: string) => document.querySelector(sel)?.textContent ?? ''
    expect(text('#cycle [data-next-superblock]')).not.toContain('#')
    expect(text('#cycle [data-cycle-budget]')).not.toMatch(/\d/)

    release()
    await waitFor(() => expect(stat('Funded')).not.toHaveAttribute('aria-busy'))
    expect(stat('Funded').querySelector('.rx-stat__value')).not.toHaveTextContent(/^0\b/)
    await waitFor(() =>
      expect(document.querySelector('#cycle [data-cycle-use]')).not.toHaveAttribute('aria-busy'),
    )
    for (const sel of ['[data-cycle-passing]', '[data-cycle-funded]', '[data-cycle-left]'])
      expect(text(`#cycle ${sel}`)).not.toMatch(/^0\b/)
  })

  it('says the budget can’t be read, with no 0, when Insight fails', async () => {
    // DAPI's recorded tip, so Hyphen's index is current and lists the proposals.
    resetHealthRegistry()
    server.use(http.get('*/insight-api/gobject/info', () => HttpResponse.json({}, { status: 503 })))
    renderAt('/governance')
    const funded = await waitFor(
      () => {
        const el = [...document.querySelectorAll<HTMLElement>('[data-budget] .rx-stat')].find(
          (x) => x.textContent?.startsWith('Funded') && !x.hasAttribute('aria-busy'),
        )
        expect(el).toBeDefined()
        return el!
      },
      { timeout: 10_000 },
    )
    expect(funded).toHaveTextContent('—')
    expect(funded).toHaveTextContent('Core’s budget couldn’t be read from Insight')
    // No pie or table of a split with Funded at 0.
    expect(document.querySelector('[data-budget-chart="missing"]')).toHaveTextContent(
      'so the split isn’t drawn',
    )
    expect(document.querySelector('[data-drawn]')).toBeNull()
  })

  it('says Insight is not answering when Core’s cycle can’t be read', async () => {
    server.use(http.get('*/insight-api/gobject/info', () => HttpResponse.json({}, { status: 503 })))
    renderAt('/governance')
    await waitFor(
      () =>
        expect(
          document.querySelector('#cycle [role="alert"][data-source="insight"]'),
        ).not.toBeNull(),
      { timeout: 10_000 },
    )
  })
})

describe('Proposal page', () => {
  it('shows the votes, details, vote history and the link to vote @HY-13 @X-11', async () => {
    renderAt(`/governance/${HASH}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Proposal' })).toBeInTheDocument()
    expect(await screen.findByText('DashDaoGrowthEngine', { exact: false })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('[data-votes]')).toHaveTextContent('123'))
    const history = await screen.findByRole('table', { name: /Masternode votes on this proposal/ })
    await waitFor(() => expect(within(history).getAllByRole('row').length).toBeGreaterThan(5))
    const link = screen.getByRole('link', { name: /Vote in Governance/ })
    expect(link).toHaveAttribute('href', `https://gov.dashhq.org/p/h/${HASH}`)
  })

  it('links the testnet proposal to the testnet Governance @HY-19', async () => {
    renderAt(
      '/governance/01934d6d5c25ade531176a0283148b3d6aeaef2c0b6d599552e43c2199d2f8cd?network=testnet',
    )
    const link = await screen.findByRole('link', { name: /Vote in Governance/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('network=testnet'))
    await waitFor(() => expect(document.querySelector('[data-source="insight"]')).not.toBeNull())
    expect(document.querySelector('[data-stale-index]')).toBeNull()
  })

  it('falls back to Hyphen’s index for a proposal Insight no longer holds, and says so @IN-16 @HY-19', async () => {
    const old = await olderProposal()
    server.use(
      http.get(`*/x/hy/testnet/proposal/${OLD}`, () => HttpResponse.json(old)),
      http.get(`*/x/hy/testnet/proposal/${OLD}/votes`, () =>
        HttpResponse.json({ asOfHeight: 1_577_999, value: [] }),
      ),
    )
    renderAt(`/governance/${OLD}?network=testnet`)
    expect(await screen.findByText('Older budget request', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('No proposal with this hash on this network.')).toBeNull()
    await waitFor(() => expect(document.querySelector('[data-source="hyphen"]')).not.toBeNull())
    expect(document.querySelector('[data-stale-index]')).toHaveTextContent(
      'This proposal and its vote history are from Hyphen’s index',
    )
    expect(document.querySelector('[data-derived-funding]')).toBeNull()
    expect(screen.getByText('Counted as valid')).toBeInTheDocument()
  })

  it('says not found on testnet only when neither index has the proposal @IN-16', async () => {
    server.use(
      http.get(`*/x/hy/testnet/proposal/${OLD}`, () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 }),
      ),
    )
    renderAt(`/governance/${OLD}?network=testnet`)
    expect(
      await screen.findByText('No proposal with this hash on this network.'),
    ).toBeInTheDocument()
  })

  it('says when no proposal has the hash @HY-13', async () => {
    renderAt(`/governance/${'0'.repeat(64)}`)
    expect(
      await screen.findByText('No proposal with this hash on this network.'),
    ).toBeInTheDocument()
  })
})
