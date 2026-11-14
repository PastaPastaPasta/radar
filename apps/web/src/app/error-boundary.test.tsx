import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, isChunkFailure } from './error-boundary'

const broken = { throws: true, error: new Error('the page broke') }

function Page() {
  if (broken.throws) throw broken.error
  return <p>the page</p>
}

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  broken.throws = true
  broken.error = new Error('the page broke')
  setOnline(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  setOnline(true)
})

describe('the page error boundary', () => {
  it('says a page that broke while online is broken @NX-77', () => {
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('This page couldn’t be shown')
  })

  it('says it is offline, not broken, when a page fails to render offline @NX-77', () => {
    setOnline(false)
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('This page couldn’t be shown')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('You’re offline')
    expect(screen.getByRole('status')).toHaveTextContent('loads when the connection returns')
  })

  it('shows the page again by itself when the connection returns @NX-77', () => {
    setOnline(false)
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    broken.throws = false
    setOnline(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByText('the page')).toBeInTheDocument()
  })

  it('reads a failed lazy chunk as the connection, and starts the page over when it returns @NX-77', () => {
    broken.error = new TypeError('Failed to fetch dynamically imported module: /assets/x.js')
    expect(isChunkFailure(broken.error)).toBe(true)
    setOnline(false)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('You’re offline')
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(reload).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('says a chunk that failed while online could not be loaded @NX-77', () => {
    broken.error = new TypeError('error loading dynamically imported module')
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('This page couldn’t be loaded')
  })
})
