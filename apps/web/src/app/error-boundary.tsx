import { t } from '@lingui/core/macro'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import {
  countRouterReloads,
  guardRouterReloads,
  isChunkFailure,
  mayReloadForChunk,
  onPreloadError,
  reloadForChunk,
} from '@/lib/chunk-recovery'
import { Icon } from '@/ui/icon'

export { isChunkFailure }

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    onPreloadError(event)
  })
  countRouterReloads()
  guardRouterReloads()
}

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

const online = () => typeof navigator === 'undefined' || navigator.onLine

/** The failures already retried once in this page load, by message. */
const retried = new Set<string>()

type Recovery = 'retrying' | 'reloading' | 'failed'

/**
 * A failed chunk is retried once, then the page reloads once into the current build, then the error page shows. Offline
 * nothing is tried: the page waits for the connection.
 */
function useChunkRecovery(error: Error, retry: () => void): Recovery {
  const chunk = isChunkFailure(error)
  const [state] = useState<Recovery>(() => {
    if (!chunk || !online()) return 'failed'
    if (!retried.has(error.message)) return 'retrying'
    return mayReloadForChunk(error) ? 'reloading' : 'failed'
  })
  useEffect(() => {
    if (state === 'retrying') {
      retried.add(error.message)
      retry()
    } else if (state === 'reloading') {
      reloadForChunk(error)
    }
  }, [state, error, retry])
  return state
}

function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Radar`
  }, [title])
}

/** Home on the network the page was on, loaded in full so a stale build's code is not asked for again. */
function homeHref(): string {
  const network = new URLSearchParams(window.location.search).get('network')
  return network ? `/?${new URLSearchParams({ network }).toString()}` : '/'
}

const keys = new WeakMap<Error, number>()
let nextKey = 0
/** Each failure gets a fresh page, so a retry that fails again starts the recovery's next step. */
const keyOf = (error: Error) => {
  let k = keys.get(error)
  if (k === undefined) keys.set(error, (k = nextKey++))
  return k
}

type Kind = 'chunk' | 'offline' | 'error'

function kindOf(error: Error): Kind {
  if (!online()) return 'offline'
  return isChunkFailure(error) ? 'chunk' : 'error'
}

function ErrorPage({ error, retry }: { error: Error; retry: () => void }) {
  const kind = kindOf(error)
  const recovery = useChunkRecovery(error, retry)

  useEffect(() => {
    if (kind !== 'offline') return
    const back = () => {
      if (isChunkFailure(error)) window.location.reload()
      else retry()
    }
    window.addEventListener('online', back)
    return () => {
      window.removeEventListener('online', back)
    }
  }, [kind, error, retry])

  const copy = {
    offline: {
      title: t`You’re offline`,
      body: t`This page loads when the connection returns. Radar will try again by itself.`,
    },
    chunk: {
      title: t`This page couldn’t be loaded`,
      body: t`Radar was probably updated while this tab was open, so part of the page it asked for no longer exists. Reload to get the current version.`,
    },
    error: {
      title: t`This page couldn’t be shown`,
      body: t`Something in this page broke. The rest of Radar still works: reload to try again, or start from the home page.`,
    },
  }[kind]
  useTitle(copy.title)

  if (kind === 'chunk' && recovery !== 'failed') {
    return (
      <div role="status" aria-busy="true" data-error-page="recovering" className="rx-empty">
        <p className="rx-empty__t">{t`Loading the current version of Radar…`}</p>
      </div>
    )
  }

  return (
    <article
      role={kind === 'error' ? 'alert' : 'status'}
      data-error-page={kind}
      data-offline-notice={kind === 'offline' ? '' : undefined}
      className="rx-empty rx-empty--error"
    >
      <span className="rx-empty__tile">
        <Icon name={kind === 'offline' ? 'globe' : 'alert'} />
      </span>
      <h1 className="rx-empty__t text-2xl">{copy.title}</h1>
      <p className="rx-empty__b">{copy.body}</p>
      <p className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className="dh-btn dh-btn--primary"
          onClick={() => {
            window.location.reload()
          }}
        >
          {t`Reload`}
        </button>
        <a
          href={homeHref()}
          className="dh-btn"
          onClick={(e) => {
            e.preventDefault()
            window.location.assign(homeHref())
          }}
        >
          {t`Go home`}
        </a>
      </p>
      {kind === 'error' ? (
        <details className="rx-empty__b text-left" data-error-detail>
          <summary>{t`Technical detail`}</summary>
          <code className="break-all">
            {error.name}: {error.message}
          </code>
        </details>
      ) : null}
    </article>
  )
}

/** The router's error component for every route: the branded page, inside the shell. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter({ warn: false }) as ReturnType<typeof useRouter> | undefined
  const [retry] = useState(() => () => {
    if (router) void router.invalidate()
    else reset()
  })
  const err = error instanceof Error ? error : new Error(String(error))
  return <ErrorPage key={keyOf(err)} error={err} retry={retry} />
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
    return <ErrorPage key={keyOf(error)} error={error} retry={this.reset} />
  }
}
