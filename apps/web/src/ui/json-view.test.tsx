import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonView, encodeBytes, jsonText } from './json-view'

afterEach(() => {
  vi.restoreAllMocks()
})

const DOC = {
  id: 'abc',
  revision: 3n,
  data: new Uint8Array([0, 1, 171, 255]),
  nested: { deep: { value: 42 } },
  list: [1, 2],
  gone: null,
  ok: true,
}

describe('jsonText', () => {
  it('writes bigints as digit strings and bytes as hex or base64', () => {
    expect(JSON.parse(jsonText({ n: 12345678901234567890n, b: new Uint8Array([1, 255]) }))).toEqual(
      {
        n: '12345678901234567890',
        b: '01ff',
      },
    )
    expect(JSON.parse(jsonText({ b: new Uint8Array([1, 255]) }, 'base64'))).toEqual({ b: 'Af8=' })
  })

  it('survives a cycle and a Map', () => {
    const loop: Record<string, unknown> = { name: 'x' }
    loop.self = loop
    expect(JSON.parse(jsonText(loop))).toEqual({ name: 'x', self: '[circular]' })
    expect(JSON.parse(jsonText({ m: new Map([['a', 1]]) }))).toEqual({ m: { a: 1 } })
  })

  it('encodes large byte arrays', () => {
    expect(encodeBytes(new Uint8Array(70000).fill(65), 'base64')).toHaveLength(93336)
  })
})

describe('JsonView', () => {
  it('opens the root and closes the levels below it by default', () => {
    render(<JsonView value={DOC} />)
    expect(screen.getByText('"abc"')).toBeInTheDocument()
    const nested = screen.getByRole('button', { name: /"nested"/ })
    expect(nested).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('42')).not.toBeInTheDocument()
    expect(within(nested).getByText(/1 key/)).toBeInTheDocument()
  })

  it('opens and closes a branch from the keyboard', async () => {
    const user = userEvent.setup()
    render(<JsonView value={DOC} />)
    const nested = screen.getByRole('button', { name: /"nested"/ })
    nested.focus()
    await user.keyboard('{Enter}')
    expect(nested).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /"deep"/ })).toBeInTheDocument()
    await user.keyboard(' ')
    expect(nested).toHaveAttribute('aria-expanded', 'false')
  })

  it('honours collapsedDepth', () => {
    const { rerender } = render(<JsonView value={DOC} collapsedDepth={3} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    rerender(<JsonView key="closed" value={DOC} collapsedDepth={0} />)
    expect(screen.queryByText('"abc"')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /7 keys/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows bigint digits with an n and bytes in hex or base64', () => {
    const { rerender } = render(<JsonView value={DOC} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('0001abff')).toBeInTheDocument()
    expect(screen.getByText('(4 bytes)')).toBeInTheDocument()
    expect(screen.getByText('0x')).toBeInTheDocument()
    rerender(<JsonView value={DOC} bytes="base64" />)
    expect(screen.getByText('AAGr/w==')).toBeInTheDocument()
    expect(screen.getByText('base64:')).toBeInTheDocument()
  })

  it('cuts a long byte string in the middle and keeps the full value in the title', () => {
    const bytes = Uint8Array.from({ length: 100 }, (_, i) => i)
    render(<JsonView value={{ bytes }} />)
    const shown = screen.getByTitle(encodeBytes(bytes, 'hex'))
    expect(shown.textContent).toMatch(/^[0-9a-f]{96}…[0-9a-f]{32}$/)
    expect(screen.getByText('(100 bytes)')).toBeInTheDocument()
  })

  it('copies the whole document', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<JsonView value={DOC} />)
    await user.click(screen.getByRole('button', { name: 'Copy JSON' }))
    expect(writeText).toHaveBeenCalledOnce()
    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toMatchObject({
      revision: '3',
      data: '0001abff',
    })
  })

  it('leaves the copy button out when asked', () => {
    render(<JsonView value={DOC} copy={false} />)
    expect(screen.queryByRole('button', { name: 'Copy JSON' })).not.toBeInTheDocument()
  })

  it('expands everything and folds back to the first level', async () => {
    const user = userEvent.setup()
    render(<JsonView value={DOC} />)
    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByText('42')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.queryByText('42')).not.toBeInTheDocument()
    expect(screen.getByText('"abc"')).toBeInTheDocument()
  })

  it('shows a long list a hundred at a time', async () => {
    const user = userEvent.setup()
    render(<JsonView value={Array.from({ length: 230 }, (_, i) => i)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(101 + 1)
    await user.click(screen.getByRole('button', { name: 'Show 100 more of 130' }))
    await user.click(screen.getByRole('button', { name: 'Show 30 more of 30' }))
    expect(screen.queryByRole('button', { name: /more of/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('229')).toHaveLength(2)
  })

  it('does not loop on a cycle', () => {
    const loop: Record<string, unknown> = { name: 'x' }
    loop.self = loop
    render(<JsonView value={loop} collapsedDepth={5} />)
    expect(screen.getByText('[circular]')).toBeInTheDocument()
  })

  it('renders empty containers and scalars at the root', () => {
    const { rerender } = render(<JsonView value={{ a: {}, b: [] }} />)
    expect(screen.getByRole('button', { name: /"a"/ })).toHaveTextContent('{}')
    rerender(<JsonView value={null} />)
    expect(screen.getByText('null')).toBeInTheDocument()
    rerender(<JsonView value={12345678901234567890n} />)
    expect(screen.getByText(/12345678901234567890/)).toBeInTheDocument()
  })

  it('makes a height-limited view a focusable, named region', () => {
    render(<JsonView value={DOC} maxHeight={120} label="Decoded transition" />)
    const region = screen.getByRole('region', { name: 'Decoded transition' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveStyle({ maxHeight: '120px' })
  })
})
