import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useHold } from './use-hold'

function List({ rows }: { rows: string[] }) {
  const hold = useHold(rows)
  return (
    <div {...hold.props} data-testid="list" data-held={hold.held}>
      <button>inside</button>
      <ul>
        {hold.shown.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  )
}

function Harness() {
  const [rows, setRows] = useState(['a'])
  return (
    <>
      <button onClick={() => setRows(['b', 'a'])}>push</button>
      <List rows={rows} />
    </>
  )
}

describe('useHold @PE-02', () => {
  it('keeps the list still while the pointer is over it and catches up on leaving', () => {
    render(<Harness />)
    const list = screen.getByTestId('list')
    fireEvent.pointerEnter(list)
    fireEvent.click(screen.getByText('push'))
    expect(screen.queryByText('b')).toBeNull()
    expect(list).toHaveAttribute('data-held', 'true')
    fireEvent.pointerLeave(list)
    expect(screen.getByText('b')).toBeInTheDocument()
  })

  it('holds while focus is inside, and lets go when focus leaves the list', () => {
    render(<Harness />)
    const inside = screen.getByText('inside')
    act(() => inside.focus())
    fireEvent.click(screen.getByText('push'))
    expect(screen.queryByText('b')).toBeNull()
    act(() => inside.blur())
    expect(screen.getByText('b')).toBeInTheDocument()
  })
})
