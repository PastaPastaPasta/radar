import { lazy, Suspense } from 'react'

const Loaded = lazy(() => import('./HeaderTip').then((m) => ({ default: m.HeaderTip })))

/**
 * The header's live Core height. Its Core queries load on demand, so the shell's entry chunk does not carry the Core
 * data layer; the placeholder holds the space until they arrive.
 */
export function HeaderTip() {
  return (
    <Suspense fallback={<div className="rx-hdrtip rx-hdrtip--pending" aria-hidden="true" />}>
      <Loaded />
    </Suspense>
  )
}
