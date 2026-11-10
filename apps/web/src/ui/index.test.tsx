import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as ui from './index'

describe('ui stubs', () => {
  it.each([
    'Card',
    'SectionBand',
    'KeyValue',
    'QueryView',
    'Stat',
    'Amount',
    'Time',
    'Badge',
    'TypeBadge',
    'Sparkline',
    'Meter',
    'Chart',
    'Hash',
    'EntityChip',
    'Copy',
    'SourceLine',
    'Empty',
    'ErrorState',
    'Skeleton',
    'LiveDot',
    'Tabs',
    'DataTable',
    'LinkOut',
    'registerHoverCard',
  ])('exports %s', (name) => {
    expect(ui).toHaveProperty(name)
  })

  it('renders a card with its title, body and source attributes', () => {
    const stamp = { source: 'dapi', asOf: 1, fetchedAt: 1, proved: false } as const
    const { container } = render(
      <ui.Card title="Tip" source={stamp}>
        body
      </ui.Card>,
    )
    expect(screen.getByRole('heading', { name: 'Tip' })).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(container.querySelector('[data-source="dapi"][data-proved="false"]')).not.toBeNull()
  })
})
