import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderAt } from '../hy-shared/test-utils'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))

const HASH = '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c'

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
    expect(await screen.findByRole('table', { name: /Requested payments of open proposals/ })).toBeInTheDocument()
  })

  it('expands a proposal to its details, with a link out to Governance @HY-13 @X-11', async () => {
    const user = userEvent.setup()
    renderAt('/governance')
    const row = await screen.findByRole('button', { name: 'DashDaoGrowthEngine' })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    await user.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    const details = document.querySelector('[data-proposal-details]') as HTMLElement
    expect(within(details).getByText('Paid to')).toBeInTheDocument()
    expect(within(details).getByText('Voting window')).toBeInTheDocument()
    const vote = within(details).getByRole('link', { name: /Vote in Governance/ })
    expect(vote).toHaveAttribute('href', `https://gov.dashhq.org/p/h/${HASH}`)
    expect(vote).toHaveAttribute('rel', 'noopener noreferrer')
    await user.click(row)
    expect(document.querySelector('[data-proposal-details]')).toBeNull()
  })

  it('works on testnet @HY-19', async () => {
    renderAt('/governance?network=testnet')
    expect(await screen.findByRole('button', { name: 'test' })).toBeInTheDocument()
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
    renderAt('/governance/01934d6d5c25ade531176a0283148b3d6aeaef2c0b6d599552e43c2199d2f8cd?network=testnet')
    const link = await screen.findByRole('link', { name: /Vote in Governance/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('network=testnet'))
  })

  it('says when no proposal has the hash @HY-13', async () => {
    renderAt(`/governance/${'0'.repeat(64)}`)
    expect(await screen.findByText('No proposal with this hash on this network.')).toBeInTheDocument()
  })
})
