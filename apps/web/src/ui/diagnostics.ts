let opener: (() => void) | undefined
let requested: { at: number; where: string } | undefined

/** How long a click waits for the You features before it is let go. */
export const REQUEST_TTL_MS = 10_000

const here = (): string => `${globalThis.location?.pathname ?? ''}${globalThis.location?.search ?? ''}`

/**
 * The You features register how to open the diagnostics drawer; a page outside them (the status page) opens it
 * through `openDiagnosticsDrawer` without importing them. A request that comes before they have registered is kept
 * and carried out the moment they do, so a click on a page that opened first is not lost; one that waited past
 * `REQUEST_TTL_MS`, or that the reader has navigated away from, is dropped so it cannot open the drawer late on
 * another page. The returned function
 * unregisters only if it is still the current opener.
 */
export function registerDiagnosticsOpener(open: (() => void) | undefined): () => void {
  opener = open
  const waiting = requested
  requested = undefined
  if (open && waiting && Date.now() - waiting.at <= REQUEST_TTL_MS && waiting.where === here()) {
    open()
  }
  return () => {
    if (opener === open) opener = undefined
  }
}

export function openDiagnosticsDrawer(): void {
  if (opener) opener()
  else requested = { at: Date.now(), where: here() }
}
