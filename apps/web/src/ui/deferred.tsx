import { useEffect, useState, type ComponentType, type ReactNode } from 'react'

/**
 * A component whose code loads on first mount, showing `fallback` until it arrives. Use it instead of
 * `React.lazy`: it never suspends. React 19 can re-render three or more Suspense boundaries that wait on
 * pending chunks in an endless loop of retry renders inside `act()` (react/react#37556), which
 * starves the event loop the chunks need to arrive and grows the heap until the test worker dies.
 */
export function deferred<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: ReactNode | ((props: P) => ReactNode) = null,
): ComponentType<P> {
  let loaded: ComponentType<P> | undefined
  let failed: { error: unknown } | undefined
  let loading: Promise<void> | undefined
  const start = () =>
    (loading ??= load().then(
      (component) => {
        loaded = component
      },
      (error: unknown) => {
        failed = { error }
      },
    ))

  function Deferred(props: P) {
    const [, setSettled] = useState(false)
    useEffect(() => {
      let mounted = true
      void start().then(() => {
        if (mounted) setSettled(true)
      })
      return () => {
        mounted = false
      }
    }, [])
    if (failed) throw failed.error
    const Loaded = loaded
    if (Loaded) return <Loaded {...props} />
    return typeof fallback === 'function' ? fallback(props) : fallback
  }
  return Deferred
}
