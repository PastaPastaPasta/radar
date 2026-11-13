import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'

const PREFIX = 'radar.scroll.'
const FRAMES = 40

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
 * route renders, before the list has its height, so the offset is clamped to the top; this waits for the height.
 * A new visit has a new history key and so starts at the top.
 */
export function useRestoreScroll(ready: boolean): void {
  const key = useRouterState({
    select: (s) => String(s.location.state.__TSR_key ?? s.location.href),
  })
  useEffect(() => {
    if (!ready) return
    const target = read(key)
    let frame = 0
    let pending = 0
    let tracking = false
    const track = () => {
      write(key, window.scrollY)
    }
    const start = () => {
      tracking = true
      window.addEventListener('scroll', track, { passive: true })
    }
    const step = () => {
      if (target > 0 && Math.abs(window.scrollY - target) > 2 && frame++ < FRAMES) {
        window.scrollTo(0, target)
        pending = requestAnimationFrame(step)
        return
      }
      start()
    }
    if (target > 0) pending = requestAnimationFrame(step)
    else start()
    return () => {
      cancelAnimationFrame(pending)
      if (tracking) window.removeEventListener('scroll', track)
    }
  }, [key, ready])
}
