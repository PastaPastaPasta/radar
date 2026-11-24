import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { DataTableProps } from './data-table'
import { barInset } from './infinite'

type InfinitePaging = Extract<NonNullable<DataTableProps<unknown>['paging']>, { kind: 'infinite' }>

interface Reveal {
  /** How many of the list's rows are on the page: always its first ones. */
  count: number
  /** A `DataTable`'s infinite paging over the list, absent while the whole list fits in one step. */
  paging: InfinitePaging | undefined
}

/**
 * Infinite scroll over rows already in memory: `step` more each time the reader nears the end. It opens with `steps`
 * shown (the page a URL names) and starts over at that when `reset` changes, so pass the reader's choices (sort,
 * filter), not the data. While the rows last revealed still load something of their own (`busy`), the next step waits
 * for them, so a list that reads per row asks one step at a time.
 */
export function useReveal({
  total,
  step,
  steps = 1,
  reset,
  busy = false,
}: {
  total: number
  step: number
  steps?: number
  reset?: string | number | undefined
  busy?: boolean
}): Reveal {
  const opening = Math.max(1, steps)
  const fresh = { steps: opening, opened: opening, reset, wanted: false }
  const [state, setState] = useState(fresh)
  let current = state
  if (state.reset !== reset) {
    current = fresh
    setState(current)
  }
  // The step lands a frame after it is asked for, so the pager sees a load start and end and asks again by itself
  // when the end of the list is still near.
  useEffect(() => {
    if (!state.wanted || busy) return
    const frame = requestAnimationFrame(() => {
      setState((s) => ({ ...s, steps: s.steps + 1, wanted: false }))
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [state.wanted, busy])
  const count = Math.min(total, current.steps * step)
  return {
    count,
    paging:
      total > step
        ? {
            kind: 'infinite',
            hasNext: count < total,
            // The rows a list opens with are not a load the reader asked for: counting them would read as a load that
            // brought nothing.
            fetching: current.wanted || (busy && current.steps > current.opened),
            fetchNext: () => {
              setState((s) => (s.wanted ? s : { ...s, wanted: true }))
            },
          }
        : undefined,
  }
}

const indexOf = (el: Element) => Number((el as HTMLElement).dataset.index)
/** The step, from 1, that row `index` of the list is revealed in. */
const stepOf = (index: number, step: number) => Math.floor(index / step) + 1

/** The position in the whole list of the first row below the sticky bar. */
function firstInView(container: HTMLElement, inset: number): number | undefined {
  const row = [...container.querySelectorAll<HTMLElement>('[data-index]')].find(
    (r) => r.getBoundingClientRect().bottom > inset,
  )
  return row ? indexOf(row) : undefined
}

/** `search` with `name` set to `value`, or dropped for undefined; the other parameters keep their own encoding. */
function withParam(search: string, name: string, value: string | undefined): string {
  const kept = search
    .replace(/^\?/, '')
    .split('&')
    .filter((p) => p !== '' && p.split('=')[0] !== name)
  if (value !== undefined) kept.push(`${name}=${value}`)
  return kept.length > 0 ? `?${kept.join('&')}` : ''
}

/**
 * How far to scroll to bring row `index` of the list to the top of the view. A virtualised list may not have drawn it
 * yet: then the scroll goes as far as the drawn rows reach towards it, never past it, since the rows not drawn are only
 * estimated and a jump by a guess can overshoot to the end of the list.
 */
function distanceTo(container: HTMLElement, index: number, inset: number): number | null {
  const row = container.querySelector<HTMLElement>(`[data-index="${index}"]`)
  if (row) {
    const head = row.closest('table')?.querySelector('thead')
    return row.getBoundingClientRect().top - inset - (head?.offsetHeight ?? 0)
  }
  const drawn = [...container.querySelectorAll<HTMLElement>('[data-index]')]
  const before = drawn.filter((el) => indexOf(el) < index).at(-1)
  if (before) return before.getBoundingClientRect().bottom - inset
  const after = drawn[0]
  return after ? after.getBoundingClientRect().top - inset - window.innerHeight : null
}

/** How many frames the list is held at the step it opened on while a virtualised list measures its rows. */
const MAX_FRAMES = 120
/** Frames the row must stay put for before the list is left to the reader. */
const STABLE_FRAMES = 12
const INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Keeps a revealed list's place in the address. Opened at step `at` (the URL's `param`, from 1), the page scrolls that
 * step's first row to the top once it is on the page, unless a return to this entry already put the reader in that
 * step. As the reader scrolls, the step of the first row in view is written back with the browser's own
 * `replaceState`, keeping `history.state`, so a reload or a shared link opens there. The router's patched one would
 * start a load and its scroll restoration on every step, so it is gone around: the router reads the new address on the
 * next navigation. Rows are found by `data-index`, their position in the whole list. A list that puts its own scroll
 * back on a return (`restores`) is left alone when the history entry is one this hook wrote.
 */
export function useListPosition(
  container: RefObject<HTMLElement | null>,
  {
    at,
    step,
    count,
    total,
    param = 'page',
    restores = false,
  }: {
    at: number
    step: number
    count: number
    /** The whole list's length: a step past its end is not waited for. */
    total: number
    param?: string
    restores?: boolean
  },
): void {
  const [returning] = useState(
    () => (history.state as { radarListPage?: number } | null)?.radarListPage === at,
  )
  const router = useRouter()
  const placed = useRef(at <= 1 || (restores && returning))
  const target = (at - 1) * step
  const present = count > target
  useEffect(() => {
    if (placed.current) return
    if (total > 0 && target >= total) {
      placed.current = true
      return
    }
    if (!present) return
    let frame = 0
    let frames = 0
    let still = 0
    const release = () => {
      cancelAnimationFrame(frame)
      for (const type of INPUT_EVENTS) window.removeEventListener(type, finish)
    }
    const finish = () => {
      release()
      placed.current = true
    }
    const move = () => {
      const el = container.current
      const inset = barInset()
      if (el && returning && frames === 0) {
        const first = firstInView(el, inset)
        if (first !== undefined && stepOf(first, step) === at) return finish()
      }
      const by = el ? distanceTo(el, target, inset) : null
      if (by === null || frames++ >= MAX_FRAMES) return finish()
      // Rows above it are measured as they are drawn, which moves it again, so it is held until it stays put.
      if (Math.abs(by) < 2 && el?.querySelector(`[data-index="${target}"]`)) {
        if (++still >= STABLE_FRAMES) return finish()
      } else {
        still = 0
        window.scrollBy(0, by)
      }
      frame = requestAnimationFrame(move)
    }
    for (const type of INPUT_EVENTS) window.addEventListener(type, finish, { passive: true })
    frame = requestAnimationFrame(move)
    return release
  }, [container, present, target, total, returning, step, at])
  useEffect(() => {
    let frame = 0
    let written = at
    const path = window.location.pathname
    const write = () => {
      const el = container.current
      // While a navigation away is on its way the address is already the next page's.
      if (!el || !placed.current || router.state.status !== 'idle') return
      if (window.location.pathname !== path) return
      const first = firstInView(el, barInset())
      if (first === undefined) return
      const page = stepOf(first, step)
      if (!Number.isFinite(page) || page === written) return
      written = page
      const { pathname, search, hash } = window.location
      const url = `${pathname}${withParam(search, param, page > 1 ? String(page) : undefined)}${hash}`
      const state = (history.state as Record<string, unknown> | null) ?? {}
      History.prototype.replaceState.call(history, { ...state, radarListPage: page }, '', url)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(write)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [container, at, step, param, router])
}
