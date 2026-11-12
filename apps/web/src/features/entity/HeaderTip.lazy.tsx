import { deferred } from '@/ui/deferred'

/**
 * The header's live Core height. Its Core queries load on demand, so the shell's entry chunk does not carry the Core
 * data layer; the placeholder holds the space until they arrive.
 */
export const HeaderTip = deferred(
  () => import('./HeaderTip').then((m) => m.HeaderTip),
  <div className="rx-hdrtip rx-hdrtip--pending" aria-hidden="true" />,
)
