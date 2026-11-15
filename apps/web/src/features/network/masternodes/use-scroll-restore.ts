import { useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'

const PREFIX = 'radar.scroll.'
/** The longest the list is held at its offset while rows are measured and the page settles. */
const HOLD_MS = 4000
/** How long the offset must stay put, uncorrected, before the list is left to the reader. */
const STABLE_MS = 700
const INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

function read(key: string): number {
  try {
    return Number(sessionStorage.getItem(PREFIX + key)) || 0
  } catch {
    return 0
  }
}

function write(key: string, y: number): void {
  try {
    sessionStorage.setItem(PREFIX + key, String(Math.round(y)))
  } catch {
    // Storage may be blocked; the page then simply opens at the top.
  }
}

/**
 * Puts a long, virtualised list back where it was on back, forward and reload. The router restores the offset as the
 * route renders, before the list has its height, so the offset is clamped to the top; this waits for the height, and
 * then holds the offset while the list measures its rows, which would otherwise move it, until the reader scrolls.
 * A new visit has a new history key and so starts at the top.
 */
export function useRestoreScroll(ready: boolean): void {
  const key = useRouterState({
    select: (s) => String(s.location.state.__TSR_key ?? s.location.href),
  })
  const router = useRouter()
  useEffect(() => {
    if (!ready) return
    const target = read(key)
    let pending = 0
    let tracking = false
    const save = () => {
      if (tracking) write(key, window.scrollY)
    }
    const release = () => {
      cancelAnimationFrame(pending)
      for (const type of INPUT_EVENTS) window.removeEventListener(type, release)
      tracking = true
    }
    const started = performance.now()
    let lastCorrection = started
    const step = (now: number) => {
      if (Math.abs(window.scrollY - target) > 2) {
        window.scrollTo(0, target)
        lastCorrection = now
      }
      if (now - lastCorrection >= STABLE_MS || now - started >= HOLD_MS) {
        release()
        return
      }
      pending = requestAnimationFrame(step)
    }
    if (target > 0) {
      for (const type of INPUT_EVENTS) window.addEventListener(type, release, { passive: true })
      pending = requestAnimationFrame(step)
    } else tracking = true
    // The router scrolls to the top as it leaves, so the offset is read just before that, not from scroll events.
    const unsubscribe = router.subscribe('onBeforeLoad', save)
    window.addEventListener('pagehide', save)
    return () => {
      cancelAnimationFrame(pending)
      for (const type of INPUT_EVENTS) window.removeEventListener(type, release)
      unsubscribe()
      window.removeEventListener('pagehide', save)
    }
  }, [key, ready, router])
}
