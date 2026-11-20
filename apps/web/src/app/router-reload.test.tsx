import { lazyRouteComponent } from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onPreloadError } from '@/lib/chunk-recovery'
import { ErrorBoundary } from './error-boundary'

const MISSING = 'Failed to fetch dynamically imported module: https://x.invalid/assets/gone-abc.js'

/** A lazy route component whose import fails the way Vite's helper fails it: the event first, then the rejection. */
function failingRoute() {
  return lazyRouteComponent(() => {
    const error = new TypeError(MISSING)
    window.dispatchEvent(
      Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: error }),
    )
    return Promise.reject(error)
  })
}

async function renderRoute() {
  const Route = failingRoute()
  await act(async () => {
    render(
      <ErrorBoundary fallback={(e) => <p>caught: {e.message}</p>}>
        <Suspense fallback={<p>loading</p>}>
          <Route />
        </Suspense>
      </ErrorBoundary>,
    )
    await new Promise((settle) => setTimeout(settle, 50))
  })
}

const reload = vi.fn()

beforeEach(() => {
  // error-boundary registers this listener when it loads; each test decides whether it is there.
  window.removeEventListener('vite:preloadError', onPreloadError)
  sessionStorage.clear()
  reload.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('location', { ...window.location, reload })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TanStack Router’s own reload for a missing route chunk', () => {
  it('reloads by itself, under the key Radar sets, when nothing set it', async () => {
    await renderRoute()
    expect(reload).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(`tanstack_router_reload:${MISSING}`)).toBe('1')
  })

  it('leaves the error to Radar once the preload event has set the key', async () => {
    window.addEventListener('vite:preloadError', onPreloadError)
    await renderRoute()
    expect(await screen.findByText(`caught: ${MISSING}`)).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})
