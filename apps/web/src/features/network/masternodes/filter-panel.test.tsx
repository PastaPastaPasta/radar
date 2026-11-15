import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { filterMnRows } from '@/data/masternodes/filter'
import type { MnRow } from '@/data/masternodes/rows'
import { I18nProvider, i18n } from '@/i18n'
import { FilterBar } from './FilterBar'
import type { MnSearchControls } from './use-mn-search'

const dkg = (overall: string, failing: string[] = []) => ({
  overall,
  checks: {
    reachable: failing.includes('reachable') ? 'fail' : 'pass',
    protocol: failing.includes('protocol') ? 'fail' : 'pass',
  },
})

const row = (n: number, country: string, readiness: ReturnType<typeof dkg>): MnRow =>
  ({
    protx: n.toString(16).padStart(64, '0'),
    type: 'regular',
    status: 'enabled',
    crawl: { country, asn: 1, as_org: 'Org', dkg_readiness: readiness, reachable: true },
  }) as unknown as MnRow

const rows = [
  row(1, 'DE', dkg('pass')),
  row(2, 'DE', dkg('fail', ['protocol'])),
  row(3, 'NL', dkg('fail', ['reachable', 'protocol'])),
  row(4, 'US', dkg('unknown')),
]

function setup() {
  const filter = vi.fn()
  const controls = {
    search: { sort: '-status', view: 'list', pf: 'all', page: 1 },
    filter,
    sort: vi.fn(),
    page: vi.fn(),
  } as unknown as MnSearchControls
  render(
    <I18nProvider i18n={i18n}>
      <FilterBar rows={rows} matches={4} crawl controls={controls} sortOptions={[]} />
    </I18nProvider>,
  )
  return { filter, user: userEvent.setup() }
}

describe('the filter panel @RA-22', () => {
  it('names countries and finds one by name or code', async () => {
    const { user } = setup()
    await user.click(screen.getAllByRole('button', { name: /^Country/ })[0]!)
    const panel = document.querySelector<HTMLElement>('[data-facet="country"]')!
    expect(within(panel).getByText('Germany')).toBeInTheDocument()
    expect(within(panel).getByText('Netherlands')).toBeInTheDocument()
    await user.type(within(panel).getByRole('searchbox'), 'neth')
    expect(within(panel).queryByText('Germany')).toBeNull()
    expect(within(panel).getByText('Netherlands')).toBeInTheDocument()
  })

  it('offers each DKG check the address accepts, with the rows each holds', async () => {
    const { user, filter } = setup()
    await user.click(screen.getAllByRole('button', { name: /^DKG readiness/ })[0]!)
    const panel = document.querySelector<HTMLElement>('[data-facet="dkg"]')!
    const labels = within(panel)
      .getAllByRole('checkbox')
      .map((c) => c.closest('label')!.textContent)
    expect(labels).toEqual([
      'Passes every check1',
      'Fails a check2',
      'Unknown1',
      'Fails: Reachable1',
      'Fails: Protocol version2',
    ])
    await user.click(within(panel).getByLabelText(/Fails: Protocol version/))
    expect(filter).toHaveBeenCalledWith({ dkg: ['protocol'] })
    expect(filterMnRows(rows, { dkg: ['protocol'] })).toHaveLength(2)
  })
})

describe('the Evonode tag @RA-22', () => {
  it('narrows the list to evonodes, like the other cells', async () => {
    const history = createMemoryHistory({ initialEntries: ['/masternodes'] })
    render(<App history={history} />)
    const tag = (await screen.findAllByRole('button', { name: 'Evonode' })).find(
      (b) => b.getAttribute('data-mn-type') === 'evo',
    )!
    await userEvent.click(tag)
    await waitFor(() => expect(history.location.search).toMatch(/type=evo/))
  })
})
