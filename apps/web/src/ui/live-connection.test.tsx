import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LiveControl, LiveDot } from './states'
import { liveView, resetLiveConnection, setLiveConnection } from './live-connection'

afterEach(() => resetLiveConnection())

describe('liveView', () => {
  it('says Live only while the stream is open @IN-15', () => {
    expect(liveView({ state: 'live' }).word).toBe('Live')
    expect(liveView({ state: 'reconnecting' }).word).toBe('Reconnecting…')
    expect(liveView({ state: 'connecting' }).word).toBe('Connecting…')
    expect(liveView({ state: 'polling' }).word).toBe('Checking every 30 s')
  })

  it('names the time a stopped connection last delivered @IN-15', () => {
    const view = liveView({ state: 'stopped', lastEventAt: Date.UTC(2026, 10, 11, 9, 41) })
    expect(view.word).toMatch(/^Stopped since \d\d:\d\d$/)
    expect(view.dot).toBe('down')
    expect(view.up).toBe(false)
    expect(liveView({ state: 'stopped' }).word).toBe('Stopped')
  })
})

describe('LiveDot and LiveControl', () => {
  it('follow the connection wherever Live is drawn, and recover @IN-15', () => {
    render(
      <>
        <LiveDot state="live" />
        <LiveControl paused={false} onToggle={() => undefined} />
      </>,
    )
    expect(screen.getAllByText('Live')).toHaveLength(2)
    act(() => setLiveConnection({ state: 'stopped', lastEventAt: Date.now() }))
    expect(screen.queryByText('Live')).toBeNull()
    expect(screen.getAllByText(/Stopped since/)).toHaveLength(2)
    expect(document.querySelector('[data-live-dot="down"]')).not.toBeNull()
    act(() => setLiveConnection({ state: 'live' }))
    expect(screen.getAllByText('Live')).toHaveLength(2)
  })

  it('leaves a source-health dot alone: only an explicit live is the connection @IN-15', () => {
    render(<LiveDot state="ok" />)
    act(() => setLiveConnection({ state: 'stopped', lastEventAt: Date.now() }))
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('lets a paused feed say Paused whatever the connection does @IN-15', () => {
    render(<LiveControl paused onToggle={() => undefined} />)
    act(() => setLiveConnection({ state: 'reconnecting' }))
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })
})
