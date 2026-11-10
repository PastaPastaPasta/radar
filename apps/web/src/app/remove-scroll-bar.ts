import { useEffect } from 'react'

const LOCK_ATTRIBUTE = 'data-scroll-locked'

function lockCount(): number {
  const count = Number.parseInt(document.body.getAttribute(LOCK_ATTRIBUTE) ?? '0', 10)
  return Number.isFinite(count) ? count : 0
}

/**
 * Stands in for react-remove-scroll-bar, which locks scrolling with a <style> element that the
 * production CSP refuses. This marks <body> the same way and leaves the styling to
 * `body[data-scroll-locked]` in radar-components.css.
 */
export function RemoveScrollBar(): null {
  useEffect(() => {
    document.body.setAttribute(LOCK_ATTRIBUTE, String(lockCount() + 1))
    return () => {
      const next = lockCount() - 1
      if (next <= 0) document.body.removeAttribute(LOCK_ATTRIBUTE)
      else document.body.setAttribute(LOCK_ATTRIBUTE, String(next))
    }
  }, [])
  return null
}
