import { ErrorBoundary } from '@/app/error-boundary'
import { useDecentralizedOnly } from '@/data/health'
import { deferred } from '@/ui/deferred'

const Chip = deferred(() => import('./SourceModeChip').then((m) => m.SourceModeChip))

/**
 * The mark that Decentralized only mode is on: a glyph in the header bar, or the strip under it that stands in on
 * phones too narrow for one more thing in the bar. Nothing is drawn, and nothing loaded, while the mode is off. If its
 * code fails to load, the mark is left out rather than taking the shell down.
 */
export function SourceModeMark({ place }: { place: 'bar' | 'strip' }) {
  return useDecentralizedOnly() ? (
    <ErrorBoundary fallback={() => null}>
      <Chip place={place} />
    </ErrorBoundary>
  ) : null
}
