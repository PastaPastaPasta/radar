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

  it('names what broke behind a disclosure, and offers Reload and Go home', () => {
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    const page = screen.getByRole('alert')
    expect(page).toHaveAttribute('data-error-page', 'error')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'This page couldn’t be shown',
    )
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
    expect(page.querySelector('details[data-error-detail]')).toHaveTextContent(
      'Error: the page broke',
    )
    expect(page.querySelector('details')).not.toHaveAttribute('open')
  })

  it('retries a chunk that failed online, then reloads once, then shows the page that says so', () => {
    sessionStorage.clear()
    broken.error = new TypeError('Failed to fetch dynamically imported module: /assets/gone.js')
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, search: '?network=testnet' })
    const first = render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the current version of Radar')
    first.unmount()

    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    expect(reload).toHaveBeenCalledOnce()
    const page = screen.getByRole('status')
    expect(page).toHaveAttribute('data-error-page', 'chunk')
    expect(page).toHaveTextContent('This page couldn’t be loaded')
    expect(page).toHaveTextContent('Radar was probably updated')
    expect(page.querySelector('details')).toBeNull()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/?network=testnet',
    )
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })
})

describe('a page whose code fails to load offline @NX-77', () => {
  const failedImport = (message: string) =>
    Object.assign(new Event('vite:preloadError', { cancelable: true }), {
      payload: new TypeError(message),
    })
  const KEY = 'tanstack_router_reload:Failed to fetch dynamically imported module: /assets/x.js'

  afterEach(() => {
    sessionStorage.clear()
  })

  it('stops the router from reloading into the browser error page', () => {
    setOnline(false)
    window.dispatchEvent(failedImport('Failed to fetch dynamically imported module: /assets/x.js'))
    expect(sessionStorage.getItem(KEY)).toBe('1')
  })
})
