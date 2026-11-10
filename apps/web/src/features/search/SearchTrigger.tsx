import { PageLink } from '@/features/entity'
import { useCommandPalette } from './palette-context'

export interface SearchTriggerProps {
  label?: string
  className?: string
}

/** A link to /search that opens the palette in place; the link still works without scripts. */
export function SearchTrigger({ label = 'Search Radar', className }: SearchTriggerProps) {
  const palette = useCommandPalette()
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
      <span>{label}</span> <kbd aria-hidden="true">/</kbd>
    </PageLink>
  )
}
