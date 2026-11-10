import { useEffect } from 'react'

const LOCK_ATTRIBUTE = 'data-scroll-locked'
const GUTTER_ATTRIBUTE = 'data-scroll-gutter'

function lockCount(): number {
  const count = Number.parseInt(document.body.getAttribute(LOCK_ATTRIBUTE) ?? '0', 10)
  return Number.isFinite(count) ? count : 0
}

/**
 * Stands in for react-remove-scroll-bar, which locks scrolling with a <style> element that the
 * production CSP refuses. This marks <body> the same way and leaves the styling to
 * `body[data-scroll-locked]` in radar-components.css. When the first lock starts on a page that has a
 * scrollbar, <html> is marked so the gutter stays reserved and the layout does not shift.
 */
export function RemoveScrollBar(): null {
  useEffect(() => {
    if (lockCount() === 0 && window.innerWidth > document.documentElement.clientWidth) {
      document.documentElement.setAttribute(GUTTER_ATTRIBUTE, '')
    }
    document.body.setAttribute(LOCK_ATTRIBUTE, String(lockCount() + 1))
    return () => {
      const next = lockCount() - 1
      if (next <= 0) {
        document.body.removeAttribute(LOCK_ATTRIBUTE)
        document.documentElement.removeAttribute(GUTTER_ATTRIBUTE)
      } else document.body.setAttribute(LOCK_ATTRIBUTE, String(next))
    }
  }, [])
  return null
}
