import type { ComponentType } from 'react'
import { deferred } from '@/ui/deferred'
import { CardLoading } from './frame'

/** A hover card whose code loads the first time one opens, keeping the data clients out of the entry chunk. */
export function lazyCard(
  load: () => Promise<ComponentType<{ id: string }>>,
): ComponentType<{ id: string }> {
  const Inner = deferred(load, <CardLoading />)
  function LazyCard({ id }: { id: string }) {
    return <Inner id={id} />
  }
  return LazyCard
}
