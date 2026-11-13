import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListModeToggle, useListMode } from './list-mode'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useListMode', () => {
  it('defaults to pages of 25', () => {
    const { result } = renderHook(() => useListMode('t-default'))
    expect(result.current).toMatchObject({ mode: 'pages', limit: 25 })
  })

  it('remembers a choice per list under radar.list.<id>', () => {
    const a = renderHook(() => useListMode('t-a'))
    const b = renderHook(() => useListMode('t-b'))
    act(() => {
      a.result.current.setMode('scroll')
      a.result.current.setLimit(75)
    })
    expect(a.result.current).toMatchObject({ mode: 'scroll', limit: 75 })
    expect(b.result.current).toMatchObject({ mode: 'pages', limit: 25 })
    expect(JSON.parse(localStorage.getItem('radar.list.t-a') ?? '')).toEqual({
      mode: 'scroll',
      limit: 75,
    })
    expect(renderHook(() => useListMode('t-a')).result.current.mode).toBe('scroll')
  })

  it('keeps the same state object while nothing changed', () => {
    const { result, rerender } = renderHook(() => useListMode('t-stable'))
    const first = result.current
    rerender()
    expect(result.current.mode).toBe(first.mode)
    expect(result.current.setMode).toBe(first.setMode)
  })

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useListMode('t-sync'))
    act(() => {
      localStorage.setItem('radar.list.t-sync', JSON.stringify({ mode: 'scroll', limit: 10 }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'radar.list.t-sync' }))
    })
    expect(result.current).toMatchObject({ mode: 'scroll', limit: 10 })
  })

  it('falls back to the defaults for a damaged or foreign value', () => {
    localStorage.setItem('radar.list.t-bad', '{not json')
    expect(renderHook(() => useListMode('t-bad')).result.current).toMatchObject({
      mode: 'pages',
      limit: 25,
    })
    localStorage.setItem('radar.list.t-odd', JSON.stringify({ mode: 'grid', limit: 33 }))
    expect(renderHook(() => useListMode('t-odd')).result.current).toMatchObject({
      mode: 'pages',
      limit: 25,
    })
  })

  it('keeps the choice for the session when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useListMode('t-blocked'))
    expect(result.current.mode).toBe('pages')
    act(() => {
      result.current.setMode('scroll')
    })
    expect(result.current.mode).toBe('scroll')
  })
})

describe('ListModeToggle', () => {
  it('switches the view and the page size and remembers both', async () => {
    const user = userEvent.setup()
    render(<ListModeToggle listId="t-toggle" />)
    const pages = screen.getByRole('button', { name: 'Pages' })
    const scroll = screen.getByRole('button', { name: 'Scroll' })
    expect(pages).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('25')
    await user.click(scroll)
    expect(scroll).toHaveAttribute('aria-pressed', 'true')
    expect(pages).toHaveAttribute('aria-pressed', 'false')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per load' }), '100')
    expect(JSON.parse(localStorage.getItem('radar.list.t-toggle') ?? '')).toEqual({
      mode: 'scroll',
      limit: 100,
    })
  })

  it('offers exactly the five sizes', () => {
    render(<ListModeToggle listId="t-sizes" />)
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['10', '25', '50', '75', '100'])
  })

  it('shows what another toggle for the same list chose', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ListModeToggle listId="t-twin" />
        <ListModeToggle listId="t-twin" />
      </>,
    )
    await user.click(screen.getAllByRole('button', { name: 'Scroll' })[0]!)
    for (const b of screen.getAllByRole('button', { name: 'Scroll' })) {
      expect(b).toHaveAttribute('aria-pressed', 'true')
    }
  })
})
