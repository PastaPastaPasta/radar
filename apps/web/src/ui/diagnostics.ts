let opener: (() => void) | undefined

/**
 * The You features register how to open the diagnostics drawer; a page outside them (the status page) opens it
 * through `openDiagnosticsDrawer` without importing them. The returned function unregisters only if it is still
 * the current opener.
 */
export function registerDiagnosticsOpener(open: (() => void) | undefined): () => void {
  opener = open
  return () => {
    if (opener === open) opener = undefined
  }
}

export function openDiagnosticsDrawer(): void {
  opener?.()
}
