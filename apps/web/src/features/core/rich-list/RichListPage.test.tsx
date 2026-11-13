import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recorded from '@/test/fixtures/http/hyphen/mainnet/balances--limit-25.json'
import metrics from '@/test/fixtures/http/hyphen/mainnet/metrics__latest.json'
import { server } from '@/test/server'
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
    await waitFor(() => expect(first).toHaveTextContent('7.54%'))
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

  it('shares the circulating supply the Charts page shows, with its source @HY-09', async () => {
    renderAt('/rich-list')
    const table = await screen.findByRole('table', { name: /Addresses ranked by balance/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
    const notes = await waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>('[data-share-basis]')]
      expect(found).toHaveLength(2)
      for (const n of found) expect(n).toHaveAttribute('data-share-basis', 'circulating')
      return found
    })
    for (const note of notes) {
      expect(note).toHaveTextContent(/Shares are of the circulating supply, 13\.17 M DASH/)
      expect(note.querySelector('[data-source="hyphen"]')).not.toBeNull()
    }
    expect(within(table).getByRole('columnheader', { name: '% of supply' })).toBeInTheDocument()
    const { value } = recorded.body
    const share = value[0]!.balance / metrics.body.circulatingSupply
    await waitFor(() =>
      expect(within(table).getAllByRole('row')[1]).toHaveTextContent(
        `${(share * 100).toFixed(2)}%`,
      ),
    )
  })

  it('says so and divides by the address balances when the circulating supply is unavailable @HY-09', async () => {
    server.use(
      http.get('*/x/hy/mainnet/metrics/latest', () => new HttpResponse(null, { status: 503 })),
    )
    renderAt('/rich-list')
    const table = await screen.findByRole('table', { name: /Addresses ranked by balance/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(26))
    const notes = await waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>('[data-share-basis]')]
      expect(found).toHaveLength(2)
      for (const n of found) expect(n).toHaveAttribute('data-share-basis', 'balances')
      return found
    })
    expect(notes[1]).toHaveTextContent(/circulating supply isn’t available/)
    expect(notes[1]).toHaveTextContent(/held in positive address balances at block 2,570,013/)
    expect(
      within(table).getByRole('columnheader', { name: '% of address balances' }),
    ).toBeInTheDocument()
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
      await waitFor(() => expect(toggle).toHaveTextContent('7.54%'))
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

    it('puts the three figures in one row and the share note on one line with the rest behind a tap @HY-09', async () => {
      phone()
      const user = userEvent.setup()
      renderAt('/rich-list')
      await screen.findByRole('list', { name: 'Addresses ranked by balance' })
      const summary = document.querySelector<HTMLElement>('[data-rich-summary]')!
      expect(summary.className).toMatch(/\bgrid-cols-3\b/)
      expect(summary.querySelectorAll('.rx-stat')).toHaveLength(3)
      const notes = await waitFor(() => {
        const found = [...document.querySelectorAll<HTMLElement>('[data-share-basis]')]
        expect(found).toHaveLength(1)
        return found
      })
      const note = notes[0]!
      expect(note.tagName).toBe('DETAILS')
      expect(note).not.toHaveAttribute('open')
      expect(within(note).getByText(/Shares are of the circulating supply/)).toBeVisible()
      await user.click(note.querySelector('summary')!)
      expect(note).toHaveAttribute('open')
      const chart = screen.getByRole('img', { name: /Share of the supply held by the top/ })
      expect(note.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
