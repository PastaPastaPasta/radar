import type { ProofMeta } from '@/data/envelope'

/**
 * Which of the two floating panels is open and what it shows. It is plain state with no React and no heavy imports,
 * because the shell's keyboard handler and the status page's link must reach it before the panels' code has loaded.
 */
export interface PanelsState {
  proof: {
    open: boolean
    /** The proof the viewer clicked, or none for the list of every proof held. */ selected?: string
  }
  diagnostics: { open: boolean }
}

type Panel = keyof PanelsState

let state: PanelsState = { proof: { open: false }, diagnostics: { open: false } }
const listeners = new Set<() => void>()
const loaders: Partial<Record<Panel, () => void>> = {}

const emit = () => {
  for (const cb of [...listeners]) cb()
}

export const panelsState = (): PanelsState => state
export function subscribePanels(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** The shell says how to load each panel's code; it asks for it the first time the panel opens. */
export function setPanelLoader(panel: Panel, load: (() => void) | undefined): void {
  if (load) loaders[panel] = load
  else delete loaders[panel]
}

function open(panel: Panel, next: PanelsState[Panel]): void {
  state = { ...state, [panel]: next }
  loaders[panel]?.()
  emit()
}

export function closePanel(panel: Panel): void {
  if (!state[panel].open) return
  state = { ...state, [panel]: { open: false } }
  emit()
}

/** Opens the diagnostics drawer. The status page and the settings page call this. */
export function openDiagnostics(): void {
  open('diagnostics', { open: true })
}

/** Opens the proof inspector: on one proof, or on the list of every proof held. */
export function openProofList(selected?: string): void {
  open('proof', { open: true, ...(selected ? { selected } : {}) })
}

export const openProofFor = (proof: Pick<ProofMeta, 'id'>): void => {
  openProofList(proof.id)
}

export function resetPanels(): void {
  state = { proof: { open: false }, diagnostics: { open: false } }
  emit()
}
