import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recorded from '@/test/fixtures/http/hyphen/mainnet/balances--limit-25.json'
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

  it('names the total each share is of, and the shares add up against it @HY-09', async () => {
    renderAt('/rich-list')
    const table = await screen.findByRole('table', { name: /Addresses ranked by balance/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
    const notes = await waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>('[data-share-basis]')]
      expect(found).toHaveLength(2)
      return found
    })
    for (const note of notes) {
      expect(note).toHaveTextContent(/Shares are of the 12\.89 M DASH held in positive address/)
      expect(note).toHaveTextContent(/not of the circulating supply/)
    }
    expect(notes[1]).toHaveTextContent('block 2,570,013')
    const { value, meta } = recorded.body
    const share = value[0]!.balance / meta.includedSupply
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(`${(share * 100).toFixed(2)}%`)
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
      const toggle = within(first).getByRole('button', { expanded: false })
      expect(toggle).toHaveTextContent('1')
      expect(toggle).toHaveTextContent('7.70%')
      expect(toggle.textContent).toMatch(/…/)
      for (const label of ['Received', 'Sent', 'Transactions']) {
        expect(within(first).getByText(label)).not.toBeVisible()
      }
      await userEvent.setup().click(toggle)
      for (const label of ['Received', 'Sent', 'Transactions']) {
        expect(within(first).getByText(label)).toBeVisible()
      }
      expect(within(first).getByRole('link')).toHaveAttribute(
        'href',
        expect.stringContaining('/address/'),
      )
    })

    it('hints at the tap and gives every row a chevron that follows its state @HY-09', async () => {
      phone()
      const user = userEvent.setup()
      renderAt('/rich-list')
      const list = await screen.findByRole('list', { name: 'Addresses ranked by balance' })
      await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(25))
      expect(screen.getByText('Tap a row for received, sent and transactions')).toBeInTheDocument()
      const toggles = within(list).getAllByRole('button')
      expect(toggles).toHaveLength(25)
      for (const toggle of toggles) {
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        expect(toggle.querySelector('.rx-rich-chevron')).not.toBeNull()
      }
      await user.click(toggles[0]!)
      expect(toggles[0]).toHaveAttribute('aria-expanded', 'true')
      expect(toggles[1]).toHaveAttribute('aria-expanded', 'false')
      await user.click(toggles[0]!)
      expect(toggles[0]).toHaveAttribute('aria-expanded', 'false')
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
