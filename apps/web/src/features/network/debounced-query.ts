import { useEffect, useRef, useState } from 'react'

export const SEARCH_DEBOUNCE_MS = 150

const normalised = (text: string): string | undefined => (text.trim() === '' ? undefined : text)

/** The search text, shown at once and written to the address after a pause. */
export function useDebouncedQuery(
  committed: string | undefined,
  commit: (q: string | undefined) => void,
) {
  const [text, setText] = useState(committed ?? '')
  const [seen, setSeen] = useState(committed)
  const latest = useRef(commit)
  useEffect(() => {
    latest.current = commit
  })
  if (seen !== committed) {
    setSeen(committed)
    if (normalised(text) !== committed) setText(committed ?? '')
  }
  useEffect(() => {
    if (normalised(text) === committed) return
    const timer = setTimeout(() => {
      latest.current(normalised(text))
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text, committed])
  return [text, setText] as const
}
