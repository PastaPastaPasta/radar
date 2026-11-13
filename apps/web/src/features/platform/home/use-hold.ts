import { useEffect, useRef, useState, type FocusEvent } from 'react'

/** A value that stops following its source while `held`. */
function useFrozen<T>(value: T, held: boolean): T {
  const [frozen, setFrozen] = useState(value)
  if (!held && frozen !== value) setFrozen(value)
  return held ? frozen : value
}

export interface Hold<T> {
  /** What to draw: the live value, or the one from the moment the pointer or focus arrived. */
  shown: T
  held: boolean
  /** Spread on the element that wraps the list. */
  props: {
    onPointerEnter: () => void
    onPointerLeave: () => void
    onFocus: (e: FocusEvent<HTMLElement>) => void
    onBlur: (e: FocusEvent<HTMLElement>) => void
  }
}

/** Holds a live list still while the pointer is over it or focus is inside it, so a row never moves under a click. */
export function useHold<T>(value: T): Hold<T> {
  const [pointer, setPointer] = useState(false)
  const [focus, setFocus] = useState(false)
  const held = pointer || focus
  const wrapper = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!focus) return
    // A focused row that is removed fires no blur, so look again rather than hold for good.
    const timer = setInterval(() => {
      if (!wrapper.current?.contains(document.activeElement)) setFocus(false)
    }, 500)
    return () => clearInterval(timer)
  }, [focus])
  return {
    shown: useFrozen(value, held),
    held,
    props: {
      onPointerEnter: () => setPointer(true),
      onPointerLeave: () => setPointer(false),
      onFocus: (e) => {
        wrapper.current = e.currentTarget
        setFocus(true)
      },
      onBlur: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false)
      },
    },
  }
}
