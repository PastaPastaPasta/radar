import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderAt } from '../hy-shared/test-utils'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))

describe('Rich list page', () => {
  it('ranks addresses with balance, share of supply, received, sent and transactions @HY-09', async () => {
    renderAt('/rich-list')
    expect(await screen.findByRole('heading', { level: 1, name: 'Rich list' })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: /Addresses ranked by balance/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
    for (const head of [
      'Rank',
      'Address',
      'Balance',
      '% of supply',
      'Received',
      'Sent',
      'Transactions',
    ]) {
      expect(within(table).getByRole('columnheader', { name: head })).toBeInTheDocument()
    }
    const first = within(table).getAllByRole('row')[1]
    expect(first).toHaveTextContent('7.70%')
  })

  it('pages on with Show more @HY-09', async () => {
    const user = userEvent.setup()
    renderAt('/rich-list')
    const table = await screen.findByRole('table', { name: /Addresses ranked by balance/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(51))
    expect(within(table).getAllByRole('row')[26]).toHaveTextContent('26')
  })

  it('charts the supply held by rank band, with a table equivalent @HY-09', async () => {
    renderAt('/rich-list')
    const table = await screen.findByRole('table', {
      name: /Share of the supply held by the top addresses/,
    })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(7))
    const bands = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('rowheader')[0]?.textContent)
    expect(bands).toEqual(['1', '2–5', '6–10', '11–25', '26–50', '51–100'])
  })

  it('works on testnet @HY-19', async () => {
    renderAt('/rich-list?network=testnet')
    const table = await screen.findByRole('table', { name: /Addresses ranked by balance/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
  })
})
