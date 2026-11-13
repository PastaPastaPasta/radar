import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderInApp } from '../test-utils'
import { HASH, OWNER, transition } from './fixtures'
import { TransitionTable } from './transition-table'

const noop = () => undefined

describe('TransitionTable', () => {
  it('shows each transition with its type, status, block, gas and owner, and links to its page', async () => {
    await renderInApp(
      <TransitionTable
        rows={[
          transition(),
          transition({
            hash: 'CD'.repeat(32),
            type: 'FUTURE_THING',
            batchType: null,
            status: 'FAIL',
          }),
        ]}
        state="ready"
        onRetry={noop}
      />,
    )
    const table = screen.getByRole('table', { name: 'Platform state transitions' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    const first = within(rows[0]!)
    expect(first.getByText('Document create')).toBeInTheDocument()
    expect(first.getByText('Success')).toBeInTheDocument()
    expect(first.getByText('468,960')).toBeInTheDocument()
    expect(first.getByText('1,234,567')).toBeInTheDocument()
    const owner = rows[0]?.querySelector(`[data-entity="identity"][data-id="${OWNER}"]`)
    expect(owner).not.toBeNull()
    expect(rows[0]?.querySelector(`[data-entity="transition"][data-id="${HASH}"]`)).not.toBeNull()
    const second = within(rows[1]!)
    expect(second.getByText('Future thing')).toBeInTheDocument()
    expect(second.getByText('Failed')).toBeInTheDocument()
    expect(table).toHaveClass('rx-table--cards')
    expect(table).toHaveClass('rx-table--link')
  })

  it('draws only the columns asked for and tolerates missing facts', async () => {
    await renderInApp(
      <TransitionTable
        rows={[transition({ blockHeight: null, gasUsed: null, owner: null })]}
        state="ready"
        columns={['time', 'type', 'owner', 'gas', 'block']}
      />,
    )
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads).toEqual(['Time', 'Type', 'Owner', 'Gas', 'Block'])
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('carries its loading, error and empty states and pages', async () => {
    const retry = vi.fn()
    const view = await renderInApp(
      <TransitionTable rows={[]} state="error" error={new Error('down')} onRetry={retry} />,
    )
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument()
    view.unmount()
    await renderInApp(
      <TransitionTable
        rows={[transition()]}
        state="ready"
        paging={{
          kind: 'page',
          page: 2,
          limit: 1,
          total: 5,
          to: (page) => ({ to: '/platform/txs', search: { page } as never }),
        }}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    expect(screen.getByText('2–2 of 5')).toBeInTheDocument()
  })
})
