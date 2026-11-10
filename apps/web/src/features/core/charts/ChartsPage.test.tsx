import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderAt } from '../hy-shared/test-utils'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))

describe('Charts page', () => {
  it('shows hash rate and processed transactions with a table equivalent each @HY-02', async () => {
    renderAt('/charts')
    expect(await screen.findByRole('heading', { level: 1, name: 'Charts' })).toBeInTheDocument()
    const hash = await screen.findByRole('table', { name: /Hash rate by block height/ })
    await waitFor(() => expect(within(hash).getAllByRole('row').length).toBeGreaterThan(10))
    const txs = screen.getByRole('table', { name: /Transactions processed by block height/ })
    expect(within(txs).getAllByRole('row').length).toBeGreaterThan(10)
    expect(within(hash).getAllByRole('row')[1]).toHaveTextContent(/H\/s/)
  })

  it('offers 1 h, 1 d, 1 w, 1 m, 1 y and all ranges, and 1 d is selected first @HY-02', async () => {
    renderAt('/charts')
    const range = await screen.findByRole('group', { name: 'Range' })
    const labels = within(range)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(labels).toEqual(['1 h', '1 d', '1 w', '1 m', '1 y', 'All'])
    expect(within(range).getByRole('button', { name: '1 d' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it.each([
    ['1h', '1 h'],
    ['1w', '1 w'],
    ['1m', '1 m'],
    ['1y', '1 y'],
    ['all', 'All'],
  ])(
    'loads the %s range from Hyphen and says which blocks it covers @HY-02',
    async (range, label) => {
      renderAt(`/charts?range=${range}`)
      const group = await screen.findByRole('group', { name: 'Range' })
      expect(within(group).getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await waitFor(() => expect(document.querySelector('[data-chart-span]')).not.toBeNull())
      expect(document.querySelector('[data-chart-span]')).toHaveTextContent(/Blocks .* to /)
    },
  )

  it('changes range from the control @HY-02', async () => {
    const user = userEvent.setup()
    renderAt('/charts')
    const group = await screen.findByRole('group', { name: 'Range' })
    await user.click(within(group).getByRole('button', { name: '1 w' }))
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: '1 w' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
  })

  it('works on testnet @HY-19', async () => {
    renderAt('/charts?network=testnet')
    const hash = await screen.findByRole('table', { name: /Hash rate by block height/ })
    await waitFor(() => expect(within(hash).getAllByRole('row').length).toBeGreaterThan(10))
  })
})
