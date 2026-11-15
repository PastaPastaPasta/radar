import { t } from '@lingui/core/macro'
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

const CHUNK_FAILURE =
  /dynamically imported module|importing a module script failed|ChunkLoadError|Loading (CSS )?chunk/i

/** A page's code that could not be fetched: the connection dropped, or a newer build replaced the file. */
export const isChunkFailure = (error: Error): boolean =>
  CHUNK_FAILURE.test(`${error.name} ${error.message}`)

/** What an error means for the reader: nothing is wrong with the page, only the connection. */
const isOffline = (error: Error): boolean =>
  (typeof navigator !== 'undefined' && !navigator.onLine) || isChunkFailure(error)

/**
 * The router reloads the page once when a page's code fails to load. Offline, that reload ends on the browser's own
 * error page, so the failure is marked as already tried and the offline notice shows instead.
 */
export function keepPageWhenOffline(event: Event): void {
  const error = (event as Event & { payload?: unknown }).payload
  if (navigator.onLine || !(error instanceof Error)) return
  try {
    sessionStorage.setItem(`tanstack_router_reload:${error.message}`, '1')
  } catch {
    // Storage blocked: the router's reload goes ahead.
  }
}
if (typeof window !== 'undefined') window.addEventListener('vite:preloadError', keepPageWhenOffline)

/** A failed chunk is not fetched again by React or the router, so that page starts over. */
function recover(error: Error, reset: () => void): void {
  if (isChunkFailure(error)) window.location.reload()
  else reset()
}

function Offline({ error, reset }: { error: Error; reset: () => void }) {
  const online = typeof navigator === 'undefined' || navigator.onLine
  useEffect(() => {
    const retry = () => recover(error, reset)
    window.addEventListener('online', retry)
    return () => {
      window.removeEventListener('online', retry)
    }
  }, [error, reset])
  return (
    <div role="status" data-offline-notice className="grid gap-3">
      <h1 className="text-2xl font-semibold">
        {online ? t`This page couldn’t be loaded` : t`You’re offline`}
      </h1>
      <p>
        {online
          ? t`The connection dropped while it loaded. Try again.`
          : t`This page loads when the connection returns. Radar will try again by itself.`}
      </p>
      <p>
        <button type="button" onClick={() => recover(error, reset)}>
          {t`Try again`}
        </button>
      </p>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page failed to render', error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    if (isOffline(error)) return <Offline error={error} reset={this.reset} />
    return (
      <div role="alert" className="grid gap-3">
        <h1 className="text-2xl font-semibold">{t`This page couldn’t be shown`}</h1>
        <p>{t`Something in the page broke. The rest of Radar still works.`}</p>
        <p>
          <button type="button" onClick={this.reset}>
            {t`Try again`}
          </button>
        </p>
      </div>
    )
  }
}
