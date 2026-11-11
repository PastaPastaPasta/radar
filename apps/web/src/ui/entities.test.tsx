import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAnnouncer } from './announce'
import { EntityChip } from './entities'
import { Copy, Hash } from './hash'
import { clearHoverCards, registerHoverCard } from './hover-cards'

const TXID = 'cb4c0d655f15ba97aa1a8e71f746db6fd15530df83d6d355396620705f5bcdf0'

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

beforeEach(() => {
  resetAnnouncer()
  clearHoverCards()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Copy', () => {
  it('copies the value, shows a check and announces it politely', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboard()
    render(<Copy value="abc123" label="Copy transaction ID" />)
    const button = screen.getByRole('button', { name: 'Copy transaction ID' })
    await user.click(button)
    expect(writeText).toHaveBeenCalledWith('abc123')
    await waitFor(() => {
      expect(button).toHaveClass('is-done')
    })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Copied')
    })
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('returns to the copy glyph after the confirmation', async () => {
    stubClipboard()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Copy value="abc123" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    await user.click(button)
    await waitFor(() => {
      expect(button).toHaveClass('is-done')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    expect(button).not.toHaveClass('is-done')
  })

  it('is reachable and activates from the keyboard', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboard()
    render(<Copy value="kb" />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(writeText).toHaveBeenCalledWith('kb')
  })

  it('does not confirm when the clipboard refuses', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const execCommand = vi.fn().mockReturnValue(false)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    render(<Copy value="no" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    await user.click(button)
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    expect(button).not.toHaveClass('is-done')
  })
})

describe('Hash', () => {
  it('shortens to head and tail with the full value in the title', () => {
    render(<Hash value={TXID} />)
    const code = screen.getByText(/cb4c0d/, { selector: 'code' })
    expect(code).toHaveTextContent('cb4c0d…cdf0')
    expect(code).toHaveAttribute('title', TXID)
  })

  it('shows the whole value and offers copy by default', () => {
    render(<Hash value={TXID} display="full" />)
    expect(document.querySelector('code')?.textContent).toBe(TXID)
    expect(screen.getByRole('button', { name: 'Copy full value' })).toBeInTheDocument()
  })

  it('leaves out the copy button on request and keeps short values whole', () => {
    render(<Hash value="abc" copy={false} />)
    expect(screen.getByText('abc')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('EntityChip', () => {
  it('formats blocks with separators and names with a dimmed suffix', () => {
    const { container } = render(
      <>
        <EntityChip kind="block" id="2569992" hover={false} />
        <EntityChip kind="name" id="alice.dash" hover={false} />
      </>,
    )
    expect(screen.getByText('2,569,992')).toBeInTheDocument()
    expect(container.querySelector('.rx-tld')).toHaveTextContent('.dash')
  })

  it('shortens long ids and copies the full id', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboard()
    render(<EntityChip kind="tx" id={TXID} hover={false} />)
    expect(document.querySelector('.rx-chip__text')).toHaveTextContent('cb4c0d…cdf0')
    await user.click(screen.getByRole('button', { name: 'Copy Core transaction ID' }))
    expect(writeText).toHaveBeenCalledWith(TXID)
  })

  it('links when given an href and stays plain when told not to', () => {
    render(
      <>
        <EntityChip kind="block" id="1" href="/block/1" hover={false} />
        <EntityChip kind="token" id="DUSD" href={false} hover={false} />
      </>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/block/1')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('opens the registered hover card for its kind after a short delay', async () => {
    registerHoverCard('block', ({ id }) => <div data-testid="card">Block {id} summary</div>)
    const user = userEvent.setup()
    render(<EntityChip kind="block" id="2569992" href="/block/2569992" />)
    expect(screen.queryByTestId('card')).toBeNull()
    await user.hover(screen.getByRole('link'))
    expect(await screen.findByTestId('card', {}, { timeout: 2000 })).toHaveTextContent(
      'Block 2569992 summary',
    )
  })

  it('opens the hover card on keyboard focus', async () => {
    registerHoverCard('tx', ({ id }) => <div data-testid="card">Tx {id.slice(0, 4)}</div>)
    const user = userEvent.setup()
    render(<EntityChip kind="tx" id={TXID} href="/tx/x" />)
    await user.tab()
    expect(screen.getByRole('link')).toHaveFocus()
    expect(await screen.findByTestId('card', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('shows no card for kinds without one, or when hover is off', async () => {
    registerHoverCard('block', () => <div data-testid="card" />)
    const user = userEvent.setup()
    render(
      <>
        <EntityChip kind="block" id="5" href="/b/5" hover={false} />
        <EntityChip kind="epoch" id="88" href="/e/88" />
      </>,
    )
    await user.hover(screen.getByRole('link', { name: /5/ }))
    await user.hover(screen.getByRole('link', { name: /Epoch 88/ }))
    await new Promise((r) => setTimeout(r, 500))
    expect(screen.queryByTestId('card')).toBeNull()
  })
})
