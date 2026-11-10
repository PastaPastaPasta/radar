import { lazy, Suspense, type ComponentType } from 'react'
import { CardLoading } from './frame'

/** A hover card whose code loads the first time one opens, keeping the data clients out of the entry chunk. */
export function lazyCard(
  load: () => Promise<ComponentType<{ id: string }>>,
): ComponentType<{ id: string }> {
  const Inner = lazy(async () => ({ default: await load() }))
  function LazyCard({ id }: { id: string }) {
    return (
      <Suspense fallback={<CardLoading />}>
        <Inner id={id} />
      </Suspense>
    )
  }
  return LazyCard
}
