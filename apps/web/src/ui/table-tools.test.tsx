import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { zRange } from '@/lib/search-schemas'
import { DateRangeFilter, RangeFilter } from './table-tools'

describe('RangeFilter', () => {
  it('shows the two sides of a value and marks the group as on', () => {
    render(<RangeFilter label="Balance" value="10..250" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Balance minimum' })).toHaveValue('10')
    expect(screen.getByRole('textbox', { name: 'Balance maximum' })).toHaveValue('250')
    expect(screen.getByRole('group', { name: 'Balance' })).toHaveClass('bg-select-soft')
  })

  it('reads an open-ended side', () => {
    render(<RangeFilter label="Gas" value="..5" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Gas minimum' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Gas maximum' })).toHaveValue('5')
  })

  it('ignores a value zRange rejects', () => {
    render(<RangeFilter label="Gas" value="abc" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Gas minimum' })).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear Gas' })).not.toBeInTheDocument()
  })

  it('sends a zRange string on Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RangeFilter label="Balance" onChange={onChange} />)
    await user.type(screen.getByRole('textbox', { name: 'Balance minimum' }), '1.5')
    expect(onChange).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'Balance maximum' }), '99{Enter}')
    expect(onChange).toHaveBeenCalledExactlyOnceWith('1.5..99')
    expect(zRange.parse(onChange.mock.calls[0]?.[0])).toEqual({ min: 1.5, max: 99 })
  })

  it('sends one side alone when focus leaves the pair, not when it moves inside it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <>
        <RangeFilter label="Gas" onChange={onChange} />
        <button type="button">elsewhere</button>
      </>,
    )
    await user.type(screen.getByRole('textbox', { name: 'Gas minimum' }), '100')
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('100..')
  })

  it('refuses text and a minimum above the maximum with a message', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RangeFilter label="Balance" onChange={onChange} />)
    const min = screen.getByRole('textbox', { name: 'Balance minimum' })
    await user.type(min, 'abc{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter plain numbers')
    expect(min).toBeInvalid()
    await user.clear(min)
    await user.type(min, '9')
    await user.type(screen.getByRole('textbox', { name: 'Balance maximum' }), '3{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('minimum is above the maximum')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clears with the clear button and by emptying both boxes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<RangeFilter label="Balance" value="1..2" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Clear Balance' }))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    rerender(<RangeFilter label="Balance" value="1..2" onChange={onChange} />)
    await user.clear(screen.getByRole('textbox', { name: 'Balance minimum' }))
    await user.clear(screen.getByRole('textbox', { name: 'Balance maximum' }))
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('follows a value that changes from outside', () => {
    const { rerender } = render(<RangeFilter label="Gas" value="1..2" onChange={vi.fn()} />)
    rerender(<RangeFilter label="Gas" value="5..8" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Gas minimum' })).toHaveValue('5')
    rerender(<RangeFilter label="Gas" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Gas maximum' })).toHaveValue('')
  })
})

describe('DateRangeFilter', () => {
  it('shows both dates', () => {
    render(<DateRangeFilter label="Created" from="2026-10-01" to="2026-10-31" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Created from')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('Created to')).toHaveValue('2026-10-31')
    expect(screen.getByRole('group', { name: 'Created' })).toHaveClass('bg-select-soft')
  })

  it('sends whole dates as zIsoDate strings and keeps the other side', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter label="Created" to="2026-10-31" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '2026-10-05' } })
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-05', to: '2026-10-31' })
  })

  it('drops a side that is emptied', () => {
    const onChange = vi.fn()
    render(
      <DateRangeFilter label="Created" from="2026-10-01" to="2026-10-31" onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText('Created to'), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-01' })
  })

  it('refuses a start after the end', () => {
    const onChange = vi.fn()
    render(
      <DateRangeFilter label="Created" from="2026-10-01" to="2026-10-31" onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '2026-11-15' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('after the end date')
  })

  it('clears both sides', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateRangeFilter label="Created" from="2026-10-01" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Clear Created' }))
    expect(onChange).toHaveBeenLastCalledWith({})
  })
})
