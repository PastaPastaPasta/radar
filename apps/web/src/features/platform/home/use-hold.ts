import { useState, type FocusEvent } from 'react'

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
    onFocus: () => void
    onBlur: (e: FocusEvent<HTMLElement>) => void
  }
}

/** Holds a live list still while the pointer is over it or focus is inside it, so a row never moves under a click. */
export function useHold<T>(value: T): Hold<T> {
  const [pointer, setPointer] = useState(false)
  const [focus, setFocus] = useState(false)
  const held = pointer || focus
  return {
    shown: useFrozen(value, held),
    held,
    props: {
      onPointerEnter: () => setPointer(true),
      onPointerLeave: () => setPointer(false),
      onFocus: () => setFocus(true),
      onBlur: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false)
      },
    },
  }
}
