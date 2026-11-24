import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** How far ahead of the viewport a sentinel asks for more, so rows are usually there before the reader is. */
export const NEAR_MARGIN = '400px 0px'

export const observerAvailable = () => typeof IntersectionObserver !== 'undefined'

/**
 * Calls `onNear` while the element is within `NEAR_MARGIN` of the viewport and `enabled` holds. The observer is made
 * again whenever `enabled` turns on or `version` changes (a load landed), so a sentinel still near after a load asks
 * for the next one even when nothing reported "fetching" in between.
 */
export function useNear(
  ref: RefObject<Element | null>,
  onNear: () => void,
  enabled: boolean,
  version: unknown = 0,
): void {
  const latest = useRef(onNear)
  useLayoutEffect(() => {
    latest.current = onNear
  })
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || !observerAvailable()) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) latest.current()
      },
      { rootMargin: NEAR_MARGIN },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, enabled, version])
}

/**
 * The point an infinite list grows from: it loads more as the reader nears it, and says so in a polite live region.
 * Without `IntersectionObserver` it is a button instead, so the rows are still reachable.
 */
export function InfiniteSentinel({
  onNear,
  enabled,
  loading,
  status,
  fallbackLabel,
  version,
  auto = true,
  edge = 'end',
}: {
  onNear: () => void
  /** True while there is more to load and nothing is on its way. */
  enabled: boolean
  loading: boolean
  /** What the live region says: what is loading, or what has been shown. */
  status: string
  fallbackLabel: string
  /** Changes when a load lands (a row count), so the sentinel looks again. */
  version?: unknown
  /** Whether it may load by itself as it nears the view; the fallback button needs only `enabled`. */
  auto?: boolean
  edge?: 'start' | 'end'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const engaged = useEngaged()
  useNear(ref, onNear, enabled && engaged && auto, version)
  const [manual] = useState(() => !observerAvailable())
  return (
    <div ref={ref} className="rx-sentinel" data-sentinel={edge} data-loading={loading || undefined}>
      {loading ? <span className="rx-skel rx-sentinel__bar" aria-hidden="true" /> : null}
      <p className={loading ? 'rx-note rx-dim' : 'dh-sr'} role="status" aria-live="polite">
        {status}
      </p>
      {manual && enabled ? (
        <button type="button" className="dh-btn dh-btn--sm" onClick={onNear}>
          {fallbackLabel}
        </button>
      ) : null}
    </div>
  )
}

/** The sticky bar's height: rows under it are not in view. */
export function barInset(): number {
  if (typeof document === 'undefined') return 64
  const value = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--dh-bar-h'),
  )
  return Number.isFinite(value) && value > 0 ? value : 64
}

/** The first row whose box is in the viewport, below `topInset` (the sticky header). */
export function firstVisibleRow(
  container: HTMLElement,
  topInset = 0,
): { id: string; top: number } | null {
  const rows = container.querySelectorAll<HTMLElement>('[data-row-id]')
  for (const row of rows) {
    const box = row.getBoundingClientRect()
    if (box.bottom > topInset) return { id: row.dataset.rowId ?? '', top: box.top }
  }
  return null
}

/**
 * Keeps the rows the reader is looking at where they are when rows are added or dropped above them: the first row in
 * view is noted on every scroll, and after a change the page scrolls by however far it moved. `pinTop` leaves the view
 * alone while the reader sits at the very top of a list that follows its newest rows, so those are seen arriving. The
 * returned `reset` forgets the noted row, for a jump that moves the view on purpose. The list sets
 * `overflow-anchor: none` so the browser's own anchoring does not move it twice.
 */
export function useScrollAnchor(
  container: RefObject<HTMLElement | null>,
  version: unknown,
  pinTop = false,
): () => void {
  const anchor = useRef<{ id: string; top: number } | null>(null)
  const pinned = useRef(pinTop)
  useEffect(() => {
    pinned.current = pinTop
  })
  useEffect(() => {
    let frame = 0
    const record = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = container.current
        if (!el) return
        const atTop = el.getBoundingClientRect().top >= 0
        anchor.current = pinned.current && atTop ? null : firstVisibleRow(el)
      })
    }
    record()
    window.addEventListener('scroll', record, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', record)
    }
  }, [container])
  useLayoutEffect(() => {
    const el = container.current
    const was = anchor.current
    if (!el || !was) return
    const row = el.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(was.id)}"]`)
    if (!row) return
    const moved = row.getBoundingClientRect().top - was.top
    if (Math.abs(moved) >= 1) window.scrollBy(0, moved)
    anchor.current = { id: was.id, top: row.getBoundingClientRect().top }
  }, [container, version])
  return () => {
    anchor.current = null
  }
}

/** True once the reader has scrolled up at least once since mount, so a list does not grow upward by itself. */
export function useScrolledUp(): boolean {
  const [up, setUp] = useState(false)
  useEffect(() => {
    if (up) return
    let last = window.scrollY
    const onScroll = () => {
      if (window.scrollY < last - 4) setUp(true)
      last = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [up])
  return up
}

const ENGAGING = ['scroll', 'wheel', 'touchmove', 'keydown'] as const

/**
 * True once the reader has scrolled, wheeled, swiped or pressed a key since this list appeared, so opening a page reads
 * only what it shows first, even on a screen tall enough to show the end of the list. A wheel or a swipe counts on a
 * list too short to scroll, so it still loads on the first move.
 */
export function useEngaged(): boolean {
  const [engaged, setEngaged] = useState(false)
  useEffect(() => {
    if (engaged) return
    const start = window.scrollY
    const on = (e: Event) => {
      if (e.type === 'scroll' && Math.abs(window.scrollY - start) < 2) return
      setEngaged(true)
    }
    for (const type of ENGAGING) window.addEventListener(type, on, { passive: true })
    return () => {
      for (const type of ENGAGING) window.removeEventListener(type, on)
    }
  }, [engaged])
  return engaged
}
