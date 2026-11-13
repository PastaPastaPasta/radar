/*
 * The map's bottom sheet on phones, ported from dash-nodes (MIT) `web/assets/sheet.js`.
 *
 * It keeps one height (the map less a strip at the top) whatever it shows and moves only by transform, so a drag
 * follows the finger without relayout. It rests collapsed (handle and head), half (half the map) or full (all its
 * content, as far as it fits); a flick goes on to the next rest in its direction. A vertical drag anywhere on it
 * moves it (touch-action: none in CSS); the body scrolls natively, only at full and only when its content doesn't fit.
 */

const ENGAGE = 8
const FLICK = 0.4
const COAST_MS = 150
const GIVE = 4
const TOP_GAP = 56

export type Rest = 'collapsed' | 'half' | 'full'

interface Rests {
  collapsed: number
  half: number | null
  full: number
}

const NAMES: Rest[] = ['collapsed', 'half', 'full']

/** Past the lowest or highest rest it gives a little, with resistance (`lo` < `hi`, in translateY). */
export function resist(ty: number, lo: number, hi: number): number {
  if (ty < lo) return lo - Math.sqrt(lo - ty) * GIVE
  if (ty > hi) return hi + Math.sqrt(ty - hi) * GIVE
  return ty
}

/** The rest a release `cur` px up, moving at `v` px/ms (downward positive), comes to. */
export function pickRest(names: Rest[], rests: Rests, cur: number, v: number): Rest {
  const at = (n: Rest) => rests[n] ?? 0
  if (Math.abs(v) > FLICK) {
    const next = v > 0 ? names.findLast((n) => at(n) < cur - 1) : names.find((n) => at(n) > cur + 1)
    return next ?? (v > 0 ? names[0]! : names[names.length - 1]!)
  }
  const aim = cur - v * COAST_MS
  return names.reduce((a, n) => (Math.abs(at(n) - aim) < Math.abs(at(a) - aim) ? n : a))
}

export interface BottomSheetOptions {
  panel: HTMLElement
  handle: HTMLElement
  head: HTMLElement
  body: HTMLElement
  /** Whether it is a sheet right now (phones). */
  active: () => boolean
  /** The rest for what the panel shows, used when it becomes a sheet. */
  restFor: () => Rest
  /** Runs when a drag comes to rest. */
  onDragEnd?: (rest: Rest) => void
}

export interface BottomSheet {
  snap: (rest: Rest) => void
  destroy: () => void
}

export function bottomSheet(o: BottomSheetOptions): BottomSheet {
  const { panel, handle, head, body } = o
  let rests: Rests = { collapsed: 0, half: null, full: 0 }
  let height = 0
  let at: Rest = 'collapsed'
  let y = 0
  let sheet = false
  let cancelGesture: (() => void) | null = null
  let swallowUntil = 0
  const lifetime = new AbortController()

  const place = (ty: number) => {
    y = ty
    panel.style.transform = `translate3d(0, ${ty}px, 0)`
  }
  const order = () => NAMES.filter((n) => rests[n] != null)

  function measure() {
    const box = panel.parentElement?.clientHeight ?? 0
    height = Math.max(0, box - TOP_GAP)
    panel.style.height = `${height}px`
    const pad = parseFloat(getComputedStyle(panel).paddingBottom) || 0
    const top = handle.offsetHeight + (head.offsetParent ? head.offsetHeight : 0)
    const full = Math.round(Math.min(height, top + body.scrollHeight + pad))
    const collapsed = Math.min(full, top + pad)
    const half = Math.min(full, Math.max(collapsed, Math.round(box * 0.5)))
    rests = { collapsed, half: full - half > box * 0.2 ? half : null, full }
    if (rests[at] == null) at = 'full'
  }

  function settle(name: Rest, animate = true) {
    measure()
    at = rests[name] != null ? name : 'full'
    if (at !== 'full') body.scrollTop = 0
    if (!animate) panel.classList.add('dragging')
    place(height - (rests[at] ?? 0))
    if (!animate) {
      void panel.offsetHeight
      panel.classList.remove('dragging')
    }
    panel.dataset.snap = at
    panel.dataset.scrolls = String(at === 'full' && body.scrollHeight > body.clientHeight + 1)
    body.inert = at === 'collapsed'
    document.documentElement.style.setProperty(
      '--sheet-h',
      `${Math.min(rests[at] ?? 0, rests.half ?? rests.full)}px`,
    )
  }

  panel.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.isPrimary) return
      cancelGesture?.()
      swallowUntil = 0
      if (!sheet || (e.pointerType === 'mouse' && e.button !== 0)) return
      if (panel.dataset.scrolls === 'true' && body.contains(e.target as Node)) return
      const id = e.pointerId
      const y0 = e.clientY
      const x0 = e.clientX
      const names = order()
      const lo = height - rests.full
      const hi = height - (rests[names[0]!] ?? 0)
      const shown = new DOMMatrixReadOnly(getComputedStyle(panel).transform).m42
      const caught = Math.abs(shown - y) > 0.5
      if (caught) {
        panel.classList.add('dragging')
        place(shown)
      }
      const start = y
      let ty = y
      let engaged = false
      let frame = 0
      const samples: { t: number; finger: number }[] = []
      const ac = new AbortController()
      const end = (ev: { type: string; timeStamp: number }) => {
        if (ac.signal.aborted) return
        ac.abort()
        cancelGesture = null
        cancelAnimationFrame(frame)
        if (!engaged) {
          if (caught) {
            panel.classList.remove('dragging')
            if (sheet) settle(at)
          }
          return
        }
        swallowUntil = performance.now() + 300
        panel.classList.remove('dragging')
        if (!sheet) return
        const recent = samples.filter((s) => ev.timeStamp - s.t < 100)
        const last = recent[recent.length - 1]
        const first = recent[0]
        const v =
          ev.type === 'pointercancel' || !last || !first || recent.length < 2
            ? 0
            : (last.finger - first.finger) / Math.max(1, last.t - first.t)
        y = ty
        settle(pickRest(names, rests, height - ty, v))
        o.onDragEnd?.(at)
      }
      document.addEventListener(
        'pointermove',
        (ev) => {
          if (ev.pointerId !== id) return
          if (!sheet) {
            end(ev)
            return
          }
          const dy = ev.clientY - y0
          if (!engaged) {
            const dx = Math.abs(ev.clientX - x0)
            if (Math.max(dx, Math.abs(dy)) < ENGAGE) return
            if (dx > Math.abs(dy)) {
              end(ev)
              return
            }
            engaged = true
            try {
              panel.setPointerCapture(id)
            } catch {
              // the pointer may already be gone
            }
            panel.classList.add('dragging')
            if (
              document.activeElement instanceof HTMLElement &&
              panel.contains(document.activeElement)
            ) {
              document.activeElement.blur()
            }
          }
          const finger = start + dy
          ty = resist(finger, lo, hi)
          samples.push({ t: ev.timeStamp, finger })
          if (samples.length > 16) samples.shift()
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(() => {
            place(ty)
          })
        },
        { signal: ac.signal },
      )
      document.addEventListener(
        'pointerup',
        (ev) => {
          if (ev.pointerId === id) end(ev)
        },
        { signal: ac.signal },
      )
      document.addEventListener(
        'pointercancel',
        (ev) => {
          if (ev.pointerId === id) end(ev)
        },
        { signal: ac.signal },
      )
      cancelGesture = () => {
        end({ type: 'pointercancel', timeStamp: performance.now() })
      }
    },
    { signal: lifetime.signal },
  )

  panel.addEventListener(
    'click',
    (e) => {
      if (performance.now() < swallowUntil) {
        swallowUntil = 0
        e.preventDefault()
        e.stopPropagation()
      }
    },
    { capture: true, signal: lifetime.signal },
  )

  body.addEventListener(
    'focusin',
    (e) => {
      if (!sheet || at === 'full') return
      const r = (e.target as HTMLElement).getBoundingClientRect()
      const p = panel.getBoundingClientRect()
      if (r.bottom - p.top > (rests[at] ?? 0)) settle('full')
    },
    { signal: lifetime.signal },
  )

  let queued = 0
  const unset = () => {
    panel.style.height = ''
    panel.style.transform = ''
    delete panel.dataset.snap
    delete panel.dataset.scrolls
    body.inert = false
    document.documentElement.style.removeProperty('--sheet-h')
  }
  const refresh = () => {
    if (queued) return
    queued = requestAnimationFrame(() => {
      queued = 0
      const was = sheet
      sheet = o.active()
      if (!sheet) {
        if (was) unset()
        return
      }
      if (panel.classList.contains('dragging')) return
      settle(was ? at : o.restFor(), was)
    })
  }
  const mutations = new MutationObserver(refresh)
  mutations.observe(panel, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'data-mode', 'data-layer'],
  })
  const sizes = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh)
  if (panel.parentElement) sizes?.observe(panel.parentElement)
  refresh()

  return {
    snap: (name) => {
      if (sheet) settle(name)
    },
    destroy: () => {
      lifetime.abort()
      cancelGesture?.()
      cancelAnimationFrame(queued)
      mutations.disconnect()
      sizes?.disconnect()
      unset()
    },
  }
}
