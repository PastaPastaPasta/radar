import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * True once the element has come within `margin` of the viewport, and stays true. Without `IntersectionObserver`
 * (old browsers, jsdom) it is true at once, so nothing is held back for good.
 */
export function useInView<T extends Element>(margin = '400px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (seen || !el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true)
      },
      { rootMargin: margin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [seen, margin])
  return [ref, seen]
}

/** True once the browser has had an idle moment after first paint, so loading the SDK never competes with it (§3.3). */
export function useAfterIdle(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback
    const cancel = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
    if (!ric) {
      const timer = setTimeout(() => setIdle(true), 1)
      return () => clearTimeout(timer)
    }
    const id = ric(() => setIdle(true))
    return () => cancel?.(id)
  }, [])
  return idle
}
