import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('keeps received, sent and transaction count on each phone card @HY-09', async () => {
    renderAt('/rich-list')
    const table = await screen.findByRole('table', { name: /Addresses ranked by balance/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
    const cells = [...within(table).getAllByRole('row')[1]!.querySelectorAll('td')]
    for (const label of ['Received', 'Sent', 'Transactions']) {
      const cell = cells.find((c) => c.getAttribute('data-l') === label)
      expect(cell, label).toBeDefined()
      expect(cell?.className).not.toMatch(/(^|\s)h(\s|$)/)
    }
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

  describe('on a phone @HY-09', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })
    const phone = () =>
      vi.stubGlobal(
        'matchMedia',
        (query: string): MediaQueryList =>
          ({
            matches: query === '(max-width: 640px)',
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false,
            onchange: null,
          }) as MediaQueryList,
      )

    it('lists one compact line per address with the rest on tap', async () => {
      phone()
      renderAt('/rich-list')
      const list = await screen.findByRole('list', { name: 'Addresses ranked by balance' })
      await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(25))
      expect(screen.queryByRole('table', { name: /Addresses ranked by balance/ })).toBeNull()
      const first = within(list).getAllByRole('listitem')[0]!
      const summary = first.querySelector('summary')!
      expect(summary).toHaveTextContent('1')
      expect(summary).toHaveTextContent('7.70%')
      expect(summary.textContent).toMatch(/…/)
      for (const label of ['Received', 'Sent', 'Transactions']) {
        expect(within(first).getByText(label)).toBeInTheDocument()
      }
      expect(first.querySelector('details')).not.toHaveAttribute('open')
      expect(within(first).getByRole('link')).toHaveAttribute(
        'href',
        expect.stringContaining('/address/'),
      )
    })

    it('loads more ranks and keeps the summary one tap away', async () => {
      phone()
      const user = userEvent.setup()
      const scrolled = vi.fn()
      window.HTMLElement.prototype.scrollIntoView = scrolled
      renderAt('/rich-list')
      const list = await screen.findByRole('list', { name: 'Addresses ranked by balance' })
      await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(25))
      await user.click(screen.getByRole('button', { name: 'Show more' }))
      await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(50))
      await user.click(screen.getByRole('link', { name: 'Back to summary' }))
      expect(scrolled).toHaveBeenCalled()
      expect(document.getElementById('concentration')).not.toBeNull()
    })
  })
})
