import { useLingui } from '@lingui/react/macro'
import { useSyncExternalStore } from 'react'
import { PageLink } from '@/features/entity'
import { useCommandPalette } from './palette-context'

const NO_HOVER = '(hover: none)'

function subscribeTouch(cb: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const m = window.matchMedia(NO_HOVER)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

/** A touch screen has no "/" key to press, so the shortcut chip would only mislead. */
function useTouchOnly(): boolean {
  return useSyncExternalStore(
    subscribeTouch,
    () => typeof window.matchMedia === 'function' && window.matchMedia(NO_HOVER).matches,
    () => false,
  )
}

export interface SearchTriggerProps {
  label?: string
  className?: string
}

/** A link to /search that opens the palette in place; the link still works without scripts. */
export function SearchTrigger({ label, className }: SearchTriggerProps) {
  const { t } = useLingui()
  const palette = useCommandPalette()
  const touch = useTouchOnly()
  return (
    <PageLink
      to="/search"
      className={className}
      data-palette-trigger
      aria-keyshortcuts="/ Control+K Meta+K"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        palette.open()
      }}
    >
      <span>{label ?? t`Search Radar`}</span>
      {touch ? null : (
        <>
          {' '}
          <kbd aria-hidden="true">/</kbd>
        </>
      )}
    </PageLink>
  )
}
