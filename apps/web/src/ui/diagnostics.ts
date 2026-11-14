let opener: (() => void) | undefined
let requested = false

/**
 * The You features register how to open the diagnostics drawer; a page outside them (the status page) opens it
 * through `openDiagnosticsDrawer` without importing them. A request that comes before they have registered is kept
 * and carried out the moment they do, so a click on a page that opened first is not lost. The returned function
 * unregisters only if it is still the current opener.
 */
export function registerDiagnosticsOpener(open: (() => void) | undefined): () => void {
  opener = open
  if (open && requested) {
    requested = false
    open()
  }
  return () => {
    if (opener === open) opener = undefined
  }
}

export function openDiagnosticsDrawer(): void {
  if (opener) opener()
  else requested = true
}
