import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { core } from '@/data/core/client'
import { resetHealthRegistry } from '@/data/health'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { renderAt } from '../hy-shared/test-utils'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))

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

afterEach(() => vi.restoreAllMocks())

describe('Governance page', () => {
  it('shows the budget split and a proposal table with status, votes and amounts @HY-13', async () => {
    renderAt('/governance')
    expect(await screen.findByRole('heading', { level: 1, name: 'Governance' })).toBeInTheDocument()
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

  it('narrows the table by status, with the counts of each @HY-13', async () => {
    const user = userEvent.setup()
    renderAt('/governance')
    await screen.findByRole('table', { name: 'Budget proposals' })
    const group = screen.getByRole('group', { name: 'Filter proposals by status' })
    const total = document.querySelectorAll('[data-proposal]').length
    const count = (name: string) =>
      Number(
        within(group)
          .getByRole('button', { name: new RegExp(`^${name}`) })
          .textContent?.match(/[\d,]+$/)![0]
          .replace(/,/g, ''),
      )
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

  it('sizes the proposal expander to at least 24px in both directions, as an inline style the component CSS cannot override @HY-13', async () => {
    renderAt('/governance')
    const row = await screen.findByRole('button', { name: 'DashDaoGrowthEngine' })
    expect(row.style.minBlockSize).toBe('24px')
    expect(row.style.minInlineSize).toBe('24px')
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
    expect(document.querySelector('#proposals [data-source="insight"]')).not.toBeNull()
    expect(document.querySelector('#proposals [data-source="hyphen"]')).toBeNull()
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
    const card = document.querySelector('#proposals')!
    expect(card.querySelector('[data-source="insight"]')).not.toBeNull()
    expect(card.querySelector('[data-source="hyphen"]')).not.toBeNull()
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
    expect(document.querySelector('[data-derived-funding]')).toHaveTextContent(
      'worked out by Radar from Insight’s vote counts and the time of the next superblock',
    )
  })

  it('shows no proposal as funded, and says why, when the superblock time cannot be found', async () => {
    vi.spyOn(core, 'tip').mockRejectedValue(new Error('no DAPI'))
    renderAt('/governance?network=testnet')
    await screen.findByRole('button', { name: 'test' })
    expect(document.querySelector('[data-derived-funding]')).toHaveTextContent(
      'time of the next superblock isn’t known',
    )
    for (const row of document.querySelectorAll('[data-proposal]')) {
      expect(row).not.toHaveTextContent(/\bFunded\b/)
    }
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
