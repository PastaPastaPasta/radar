import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { healthRegistry } from '@/data/health'
import { Card } from './layout'
import { registerProofInspector } from './proof'
import { Empty, ErrorState, LiveControl, LiveDot, Skeleton, SourceLine } from './states'
import { NOW, stamp } from './test-utils'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  registerProofInspector(undefined)
})

function failSource(source: 'dapi' | 'pe' | 'rate') {
  const net = 'mainnet'
  for (let i = 0; i < 4; i++) {
    healthRegistry.report(net, source, { ok: false, latencyMs: 100, kind: 'network' })
  }
}

describe('SourceLine', () => {
  it('names the source and its age and carries the data attributes', () => {
    const { container } = render(<SourceLine stamp={stamp({ source: 'dapi' })} compact />)
    expect(screen.getByText(/Served by DAPI/)).toBeInTheDocument()
    expect(screen.getByText('2 s ago')).toBeInTheDocument()
    const mark = container.querySelector('[data-source="dapi"]')
    expect(mark).toHaveAttribute('data-proved', 'false')
    expect(mark).toHaveAttribute('data-state', 'ok')
  })

  it('shows the proof-checked mark as a button that opens the proof inspector', async () => {
    const open = vi.fn()
    registerProofInspector(open)
    const proof = { kind: 'identity', height: 12 } as never
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <SourceLine
        stamp={stamp({ source: 'sdk', proved: true, proof, asOf: NOW - 4000 })}
        compact
      />,
    )
    const button = screen.getByRole('button', { name: /Proof-checked/ })
    expect(button).toHaveAttribute('data-proved', 'true')
    await user.click(button)
    expect(open).toHaveBeenCalledWith(proof)
  })

  it('does not call a figure proof-checked when it was not proved', () => {
    render(<SourceLine stamp={stamp({ source: 'sdk', proved: false })} compact />)
    expect(screen.queryByText(/Proof-checked/)).toBeNull()
    expect(screen.getByText(/Served by DAPI · not proved/)).toBeInTheDocument()
  })

  it('goes orange when the figure is older than its source allows', () => {
    const { container } = render(
      <SourceLine stamp={stamp({ source: 'pe', asOf: NOW - 6 * 60_000 })} compact />,
    )
    expect(container.querySelector('.rx-src--stale')).not.toBeNull()
    expect(screen.getByText('(out of date)')).toBeInTheDocument()
  })

  it('goes red and says so when the source is down', () => {
    failSource('rate')
    const { container } = render(
      <SourceLine stamp={stamp({ source: 'rate', asOf: NOW - 40_000 })} compact />,
    )
    expect(container.querySelector('.rx-src--down')).not.toBeNull()
    expect(screen.getByText(/The price feed isn't answering/)).toBeInTheDocument()
    expect(screen.getByText(/last good/)).toBeInTheDocument()
    expect(screen.getByText('(source down)')).toBeInTheDocument()
  })

  it('hides the age of immutable figures and explains the fallback', () => {
    render(
      <>
        <SourceLine stamp={stamp({ immutable: true })} compact />
        <SourceLine stamp={stamp({ source: 'hyphen', fallback: 'dapi-budget' })} compact />
      </>,
    )
    expect(screen.getByText('Served by DAPI')).toBeInTheDocument()
    expect(screen.getByText(/DAPI busy/)).toBeInTheDocument()
  })

  it('joins several stamps', () => {
    render(
      <SourceLine
        stamp={[stamp({ source: 'dapi' }), stamp({ source: 'radar', asOf: NOW - 780_000 })]}
        compact
      />,
    )
    expect(screen.getByText(/Served by DAPI/)).toBeInTheDocument()
    expect(screen.getByText(/Crawled by Radar/)).toBeInTheDocument()
  })

  it('does not claim a crawl for a Radar answer that carries no time', () => {
    render(
      <SourceLine
        stamp={stamp({ source: 'radar', asOf: NOW - 2000, asOfFetched: true })}
        compact
      />,
    )
    expect(screen.getByText(/Fetched from Radar/)).toHaveTextContent('2 s ago')
    expect(screen.queryByText(/Crawled/)).not.toBeInTheDocument()
  })

  it('reads as one plain line when not compact', () => {
    render(<SourceLine stamp={stamp({ source: 'radar', asOf: NOW - 780_000 })} />)
    expect(screen.getByText(/Crawled by Radar/)).toHaveTextContent('13 min ago')
  })
})

describe('Card', () => {
  it('renders its title, body and source attributes', () => {
    const { container } = render(
      <Card title="Tip" source={stamp()} layer="core">
        body
      </Card>,
    )
    expect(screen.getByRole('heading', { name: 'Tip' })).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(container.querySelector('[data-source="dapi"][data-proved="false"]')).not.toBeNull()
    expect(container.querySelector('section')).toHaveAttribute('data-layer', 'core')
  })

  it('warns above the body when a source is down and offers a retry', async () => {
    failSource('dapi')
    const onRetry = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(
      <Card title="Tip" source={stamp({ fetchedAt: NOW - 4 * 60_000 })} onRetry={onRetry}>
        stale body
      </Card>,
    )
    expect(container.querySelector('.rx-down')).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(/DAPI isn't answering/)
    expect(screen.getByRole('status')).toHaveTextContent('4 min ago')
    expect(screen.getByText('stale body')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('swaps the body for skeleton, empty and error states', () => {
    const { rerender, container } = render(
      <Card title="T" state="loading">
        body
      </Card>,
    )
    expect(container.querySelector('[data-skeleton="line"]')).not.toBeNull()
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('body')).toBeNull()
    rerender(
      <Card title="T" state="empty">
        body
      </Card>,
    )
    expect(screen.getByText('Nothing to show')).toBeInTheDocument()
    rerender(
      <Card title="T" state="error" error={{ kind: 'timeout', source: 'pe' }}>
        body
      </Card>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Platform Explorer isn't answering/)
  })
})

describe('Empty, ErrorState, Skeleton', () => {
  it.each(['none-yet', 'no-match', 'not-found', 'unsupported-network', 'blocked'] as const)(
    'renders the %s empty state with a title, body and action',
    (kind) => {
      render(<Empty kind={kind} title="Title here" body="Body here" action={<a href="/x">Go</a>} />)
      expect(screen.getByText('Title here')).toBeInTheDocument()
      expect(screen.getByText('Body here')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Go' })).toBeInTheDocument()
    },
  )

  it('maps error kinds to plain sentences that say the rest still works', () => {
    const { rerender } = render(<ErrorState error={{ kind: 'rate-limited' }} source="dapi" />)
    expect(screen.getByRole('alert')).toHaveTextContent('DAPI is busy')
    rerender(<ErrorState error={{ kind: 'invalid-response' }} source="radar" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Radar bug/)
    rerender(<ErrorState error={{ kind: 'proof-failed' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent("A proof didn't verify")
    rerender(<ErrorState error={new Error('boom')} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The rest of this page still works.')
  })

  it('retries and has a compact row form', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(
      <ErrorState error={{ kind: 'http' }} source="pe" onRetry={onRetry} compact />,
    )
    expect(container.querySelector('[data-compact="1"]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('hides skeletons from assistive technology', () => {
    const { container } = render(<Skeleton shape="row" count={3} />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('.rx-skel-row')).toHaveLength(3)
  })
})

describe('LiveDot and LiveControl', () => {
  it('labels each state', () => {
    const { rerender } = render(<LiveDot state="live" />)
    expect(screen.getByText('Live')).toBeInTheDocument()
    rerender(<LiveDot state="stale" />)
    expect(screen.getByText('Behind')).toBeInTheDocument()
    rerender(<LiveDot state="down" />)
    expect(screen.getByText('Down')).toBeInTheDocument()
  })

  it('toggles pause and counts what arrived meanwhile', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { rerender } = render(<LiveControl paused={false} onToggle={onToggle} />)
    const pause = screen.getByRole('button', { name: 'Pause live updates' })
    expect(pause).toHaveAttribute('aria-pressed', 'false')
    await user.click(pause)
    expect(onToggle).toHaveBeenCalled()
    rerender(<LiveControl paused onToggle={onToggle} newCount={4} />)
    expect(screen.getByText('Paused · 4 new')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume live updates' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('does not tick the age while nothing is mounted', () => {
    render(<SourceLine stamp={stamp()} compact />)
    expect(screen.getByText('2 s ago')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(screen.getByText('22 s ago')).toBeInTheDocument()
  })
})
