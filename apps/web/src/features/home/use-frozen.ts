import { useState } from 'react'

/** A value that stops following its source while `paused`. */
export function useFrozen<T>(value: T, paused: boolean): T {
  const [held, setHeld] = useState(value)
  if (!paused && held !== value) setHeld(value)
  return paused ? held : value
}
