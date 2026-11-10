import { useEffect, useState, useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let timer: number | undefined
let now = Date.now()

function tick() {
  now = Date.now()
  for (const l of listeners) l()
}

function subscribeNow(cb: () => void): () => void {
  if (listeners.size === 0) now = Date.now()
  listeners.add(cb)
  timer ??= window.setInterval(tick, 10_000)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }
}

/** A clock that ticks every 10 s, shared by every relative time on the page. */
export function useNow(active = true): number {
  const value = useSyncExternalStore(
    active ? subscribeNow : () => () => undefined,
    () => now,
    () => now,
  )
  // eslint-disable-next-line react-hooks/purity -- an inactive clock still has to answer with the current time
  return active ? value : Date.now()
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatches(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return matches
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** True from the first render when `value` differs from the previous one. */
export function useChanged<T>(value: T): number {
  const [state, setState] = useState({ value, n: 0 })
  if (state.value !== value) setState({ value, n: state.n + 1 })
  return state.n
}

/** Changes whenever the resolved theme does, so charts and maps re-read their tokens. */
export function useThemeSignal(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const bump = () => setN((v) => v + 1)
    const observer = new MutationObserver(bump)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', bump)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', bump)
    }
  }, [])
  return n
}

/** Pause state for a live feed, kept for the session (WCAG 2.2.2: pausing persists). */
export function usePausedFeed(key: string): [boolean, (paused: boolean) => void] {
  const storageKey = `radar.paused.${key}`
  const [paused, setPaused] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })
  const set = (next: boolean) => {
    setPaused(next)
    try {
      if (next) sessionStorage.setItem(storageKey, '1')
      else sessionStorage.removeItem(storageKey)
    } catch {
      // session storage unavailable: pause lasts for this page view
    }
  }
  return [paused, set]
}
