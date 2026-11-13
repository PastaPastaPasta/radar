/**
 * Whether a newer version of Radar is waiting to take over. Plain state with no React, because the service worker's
 * registration (in the entry chunk) raises it before the notice's code has loaded.
 */
export interface UpdateOffer {
  /** Switches to the waiting version and reloads once it has taken over. */
  apply(): void
}

let offer: UpdateOffer | undefined
let dismissed = false
let load: (() => void) | undefined
const listeners = new Set<() => void>()

const emit = () => {
  for (const cb of [...listeners]) cb()
}

export const updateOffer = (): UpdateOffer | undefined => (dismissed ? undefined : offer)
export function subscribeUpdate(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function setUpdateLoader(next: (() => void) | undefined): void {
  load = next
  if (offer && !dismissed) load?.()
}

/** A new version is waiting. The notice loads on first use and is shown until the viewer reloads or dismisses it. */
export function offerUpdate(next: UpdateOffer): void {
  offer = next
  load?.()
  emit()
}

export function dismissUpdate(): void {
  dismissed = true
  emit()
}

export function resetUpdate(): void {
  offer = undefined
  dismissed = false
  emit()
}
