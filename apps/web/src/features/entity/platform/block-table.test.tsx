import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderInApp } from '../test-utils'
import { PlatformBlockTable } from './block-table'
import { block } from './fixtures'

describe('PlatformBlockTable', () => {
  it('shows each block with its hash, proposer, gas, transition count and age', async () => {
    await renderInApp(
      <PlatformBlockTable
        rows={[block(468963, { totalGasUsed: 9000 }), block(468962)]}
        state="ready"
      />,
    )
    const table = screen.getByRole('table', { name: 'Platform blocks' })
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(heads).toEqual(['Block', 'Hash', 'Proposer', 'Gas', 'Transitions', 'Time'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    const first = rows[0]!
    expect(first.querySelector('[data-entity="platform-block"][data-id="468963"]')).not.toBeNull()
    expect(first.querySelector('[data-entity="evonode"]')).not.toBeNull()
    expect(within(first).getByText('9,000')).toBeInTheDocument()
    expect(within(first).getByText('2')).toBeInTheDocument()
    expect(table).toHaveClass('rx-table--cards')
  })

  it('adds the epoch column only when the caller can say which epoch a block is in', async () => {
    await renderInApp(
      <PlatformBlockTable
        rows={[block(10), block(11)]}
        state="ready"
        epochOf={(r) => (r.header.height === 10 ? 3 : undefined)}
      />,
    )
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Epoch')
    expect(document.querySelector('[data-entity="epoch"][data-id="3"]')).not.toBeNull()
    expect(screen.getAllByText('—')).toHaveLength(1)
  })
})
