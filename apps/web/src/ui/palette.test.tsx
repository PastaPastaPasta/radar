import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PaletteShell, type PaletteGroup, type PaletteItem } from './palette'

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  Element.prototype.scrollIntoView = () => undefined
})

const GROUPS: PaletteGroup[] = [
  {
    id: 'names',
    heading: 'Names',
    icon: 'name',
    items: [
      { id: 'alice', glyph: <i />, title: 'alice.dash', end: '↵' },
      { id: 'alicia', glyph: <i />, title: 'alicia.dash' },
    ],
  },
  {
    id: 'blocks',
    heading: 'Blocks',
    icon: 'block',
    items: [{ id: 'b1', glyph: <i />, title: 'Block 2,569,992' }],
  },
]

function Palette({ onSelect }: { onSelect: (item: PaletteItem, newTab: boolean) => void }) {
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState('ali')
  const [selected, setSelected] = useState('alice')
  return (
    <PaletteShell
      open={open}
      onOpenChange={setOpen}
      query={query}
      onQueryChange={setQuery}
      groups={GROUPS}
      selectedId={selected}
      onSelectedChange={setSelected}
      onSelect={onSelect}
      classifier={{
        label: 'Name',
        icon: 'name',
        layer: 'platform',
        text: 'Looks like a DPNS name',
      }}
      networkHint="Searching mainnet"
      empty="Nothing matches."
    />
  )
}

describe('PaletteShell', () => {
  it('is a labelled dialog with the query focused and groups with counts', async () => {
    render(<Palette onSelect={vi.fn()} />)
    const dialog = await screen.findByRole('dialog', { name: 'Search Radar' })
    expect(within(dialog).getByRole('combobox')).toHaveFocus()
    expect(within(dialog).getByText('Names')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('option')).toHaveLength(3)
    expect(within(dialog).getByText('Looks like a DPNS name')).toBeInTheDocument()
    expect(within(dialog).getByText('Searching mainnet')).toBeInTheDocument()
  })

  it('moves with the arrow keys and opens with Enter', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<Palette onSelect={onSelect} />)
    await screen.findByRole('dialog')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('alicia.dash')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'alicia' }), false)
  })

  it('opens in a new tab with Shift+Enter', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<Palette onSelect={onSelect} />)
    await screen.findByRole('dialog')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'alice' }), true)
  })

  it('selects with the pointer', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<Palette onSelect={onSelect} />)
    await user.click(await screen.findByRole('option', { name: /Block 2,569,992/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), false)
  })

  it('closes on Escape and returns focus to the page', async () => {
    const user = userEvent.setup()
    render(<Palette onSelect={vi.fn()} />)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the empty line when nothing matches', async () => {
    render(
      <PaletteShell
        open
        onOpenChange={vi.fn()}
        query="zzz"
        onQueryChange={vi.fn()}
        groups={[]}
        onSelect={vi.fn()}
        empty="Nothing matches."
      />,
    )
    expect(await screen.findByText('Nothing matches.')).toBeInTheDocument()
  })
})
