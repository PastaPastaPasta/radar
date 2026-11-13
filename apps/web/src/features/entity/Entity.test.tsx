import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerLabelOverlay, systemContract } from '@/lib/well-known'
import { clearHoverCards, registerHoverCard } from '@/ui/hover-cards'
import { Entity } from './Entity'
import { renderInApp } from './test-utils'

const DPNS = systemContract('dpns').id
const OTHER = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'

describe('Entity labels', () => {
  it('names a well-known contract and leaves other ids as they are', async () => {
    await renderInApp(
      <>
        <Entity kind="contract" id={DPNS} />
        <Entity kind="identity" id={OTHER} />
      </>,
    )
    expect(await screen.findByRole('link', { name: /DPNS/ })).toBeInTheDocument()
    expect(screen.queryByText('Platform system')).not.toBeInTheDocument()
  })

  it('lets an explicit label win, and follows a label overlay as it changes', async () => {
    await renderInApp(
      <>
        <Entity kind="contract" id={DPNS} label="Names" />
        <Entity kind="identity" id={OTHER} />
      </>,
    )
    expect(await screen.findByText('Names')).toBeInTheDocument()
    let remove: () => void = () => undefined
    act(() => {
      remove = registerLabelOverlay((_n, kind, id) =>
        kind === 'identity' && id === OTHER ? 'My friend' : undefined,
      )
    })
    expect(await screen.findByText('My friend')).toBeInTheDocument()
    act(() => remove())
    expect(screen.queryByText('My friend')).not.toBeInTheDocument()
  })
})

function setTouchScreen(touch: boolean) {
  window.matchMedia = (query: string) => ({
    matches: touch && query.includes('hover: none'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })
}

const finger = (x = 5, y = 5) => ({ pointerType: 'touch', clientX: x, clientY: y })

describe('hover cards on a touch screen @X-06', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    registerHoverCard('identity', ({ id }) => <div data-hover-card="identity">card for {id}</div>)
  })
  afterEach(() => {
    vi.useRealTimers()
    clearHoverCards()
    setTouchScreen(false)
  })

  async function chip() {
    await renderInApp(<Entity kind="identity" id={OTHER} />)
    return screen.getByRole('link', { name: /Bjix/ })
  }

  it('opens the card on a long press, and the tap that ends it does not open the page', async () => {
    setTouchScreen(true)
    const link = await chip()
    const clicked = vi.fn((e: Event) => e.preventDefault())
    link.addEventListener('click', clicked)
    fireEvent.pointerDown(link, finger())
    expect(screen.queryByText(/card for/)).toBeNull()
    act(() => void vi.advanceTimersByTime(500))
    expect(await screen.findByText(`card for ${OTHER}`)).toBeInTheDocument()
    fireEvent.pointerUp(link, finger())
    fireEvent.click(link)
    expect(clicked).not.toHaveBeenCalled()
  })

  it('leaves a short tap to the link, with no card', async () => {
    setTouchScreen(true)
    const link = await chip()
    const clicked = vi.fn((e: Event) => e.preventDefault())
    link.addEventListener('click', clicked)
    fireEvent.pointerDown(link, finger())
    act(() => void vi.advanceTimersByTime(200))
    fireEvent.pointerUp(link, finger())
    act(() => void vi.advanceTimersByTime(500))
    fireEvent.click(link)
    expect(screen.queryByText(/card for/)).toBeNull()
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('does not open while the finger scrolls', async () => {
    setTouchScreen(true)
    const link = await chip()
    fireEvent.pointerDown(link, finger(5, 5))
    fireEvent.pointerMove(link, finger(5, 40))
    act(() => void vi.advanceTimersByTime(600))
    expect(screen.queryByText(/card for/)).toBeNull()
  })

  it('does not open for a mouse press, and a focused chip opens nothing on a touch screen', async () => {
    setTouchScreen(true)
    const link = await chip()
    fireEvent.pointerDown(link, { pointerType: 'mouse', clientX: 5, clientY: 5 })
    act(() => link.focus())
    act(() => void vi.advanceTimersByTime(900))
    expect(screen.queryByText(/card for/)).toBeNull()
  })

  it('stays open when the finger lifts and the chip takes focus', async () => {
    setTouchScreen(true)
    const link = await chip()
    fireEvent.pointerDown(link, finger())
    act(() => void vi.advanceTimersByTime(500))
    await screen.findByText(`card for ${OTHER}`)
    act(() => link.focus())
    fireEvent.pointerUp(link, finger())
    expect(screen.getByText(`card for ${OTHER}`)).toBeInTheDocument()
  })

  it('closes on Escape and on a tap outside', async () => {
    setTouchScreen(true)
    const link = await chip()
    fireEvent.pointerDown(link, finger())
    act(() => void vi.advanceTimersByTime(500))
    await screen.findByText(`card for ${OTHER}`)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByText(/card for/)).toBeNull()
    fireEvent.pointerDown(link, finger())
    act(() => void vi.advanceTimersByTime(500))
    await screen.findByText(`card for ${OTHER}`)
    act(() => {
      void vi.advanceTimersByTime(50)
      fireEvent.pointerDown(document.body, finger(300, 300))
      fireEvent.click(document.body)
    })
    expect(screen.queryByText(/card for/)).toBeNull()
  })

  it('opens on keyboard focus where there is a pointer that hovers', async () => {
    setTouchScreen(false)
    vi.useRealTimers()
    const link = await chip()
    await userEvent.tab()
    expect(link).toHaveFocus()
    expect(await screen.findByText(`card for ${OTHER}`, {}, { timeout: 3000 })).toBeInTheDocument()
  })
})
