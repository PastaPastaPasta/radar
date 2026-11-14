import { registerDiagnosticsOpener } from '@/ui/diagnostics'
import { getDevFlags } from './dev-flags'
import { installLabelOverlay } from './labels'
import { closePanel, openDiagnostics, openProofList, panelsState, setPanelLoader } from './panels'
import { setUpdateLoader } from './update/update-state'

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

/** Alt+Shift+P opens the proof inspector and Alt+Shift+D the diagnostics drawer (Option+Shift on a Mac). */
function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return
  if (isEditable(e.target)) return
  const flags = getDevFlags()
  if (e.code === 'KeyP' && flags.proofShortcut) {
    e.preventDefault()
    if (panelsState().proof.open) closePanel('proof')
    else openProofList()
  } else if (e.code === 'KeyD' && flags.diagnosticsShortcut) {
    e.preventDefault()
    if (panelsState().diagnostics.open) closePanel('diagnostics')
    else openDiagnostics()
  }
}

/**
 * What the app needs from the You features before any of them is opened: the panels' shortcuts, the way each panel's
 * code is loaded, and the viewer's own labels. It imports no component.
 */
export function installYou(loaders: {
  proof: () => void
  diagnostics: () => void
  update: () => void
}): () => void {
  setPanelLoader('proof', loaders.proof)
  setPanelLoader('diagnostics', loaders.diagnostics)
  setUpdateLoader(loaders.update)
  const unregisterOpener = registerDiagnosticsOpener(openDiagnostics)
  const removeLabels = installLabelOverlay()
  document.addEventListener('keydown', onKey)
  return () => {
    document.removeEventListener('keydown', onKey)
    removeLabels()
    unregisterOpener()
    setPanelLoader('proof', undefined)
    setPanelLoader('diagnostics', undefined)
    setUpdateLoader(undefined)
  }
}
