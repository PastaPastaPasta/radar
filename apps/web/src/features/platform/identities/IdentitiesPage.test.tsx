import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeSourceMode } from '@/lib/source-mode'
import { renderAt } from '../../core/hy-shared/test-utils'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  writeSourceMode('all')
})

const rows = () => document.querySelectorAll('#identities-list tbody tr')

describe('Identity list @PE-14', () => {
  it('lists identities with type, balance and counts, each linking to its page @PE-14', async () => {
    renderAt('/identities')
    const table = await screen.findByRole('table', { name: /Identities/ })
    for (const head of [
      'Identity',
      'Type',
      'Balance',
      'Transitions',
      'Documents',
      'Contracts',
      'Created',
    ]) {
      expect(within(table).getByRole('columnheader', { name: head })).toBeInTheDocument()
    }
    await waitFor(() => {
      expect(rows().length).toBe(25)
    })
    expect(rows()[0]?.querySelector('a[href^="/identity/"]')).not.toBeNull()
  })

  it('shows a USD estimate on every balance @PE-37', async () => {
    renderAt('/identities')
    await waitFor(() => {
      expect(rows().length).toBe(25)
    })
    await waitFor(() => {
      expect(document.querySelectorAll('#identities-list tbody .rx-fiat').length).toBe(25)
    })
  })

  it('narrows to one type and names the filter @PE-14', async () => {
    const user = userEvent.setup()
    renderAt('/identities')
    await waitFor(() => {
      expect(rows().length).toBe(25)
    })
    await user.click(
      within(screen.getByRole('group', { name: 'Identity type' })).getByRole('button', {
        name: 'Masternode',
      }),
    )
    await waitFor(() => {
      const types = Array.from(
        document.querySelectorAll('#identities-list tbody tr td:nth-child(2)'),
      ).map((c) => c.textContent)
      expect(types.length).toBeGreaterThan(0)
      expect(new Set(types)).toEqual(new Set(['Masternode']))
    })
    expect(screen.getByText('Type: Masternode')).toBeInTheDocument()
  })

  it('remembers scrolling as the way to read the list, and loads the next page on request @PE-14', async () => {
    const user = userEvent.setup()
    renderAt('/identities')
    await waitFor(() => {
      expect(rows().length).toBe(25)
    })
    await user.click(
      within(screen.getByRole('group', { name: 'List view' })).getByRole('button', {
        name: 'Scroll',
      }),
    )
    expect(JSON.parse(localStorage.getItem('radar.list.identities') ?? '{}')).toMatchObject({
      mode: 'scroll',
    })
    await user.click(await screen.findByRole('button', { name: 'Show more' }))
    await waitFor(() => {
      expect(rows().length).toBe(50)
    })
  })

  it('is one notice and a search by ID or name in Decentralized only mode @PE-14', async () => {
    writeSourceMode('decentralized')
    renderAt('/identities')
    await screen.findByLabelText('Identity ID or name')
    expect(document.querySelectorAll('[data-unavailable="mode"]').length).toBe(1)
    expect(rows().length).toBe(0)
  })
})
