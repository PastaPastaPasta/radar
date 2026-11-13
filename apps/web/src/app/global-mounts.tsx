import { useEffect, useSyncExternalStore } from 'react'
import { deferred } from '@/ui/deferred'
import { onProofInspectorNeeded } from '@/ui/proof'

export type GlobalMount = 'proof' | 'diagnostics'

const ProofInspectorMount = deferred(() =>
  import('@/features/you').then((m) => m.ProofInspectorMount),
)
const DiagnosticsMount = deferred(() => import('@/features/you').then((m) => m.DiagnosticsMount))

type Requested = Readonly<Record<GlobalMount, boolean>>

const NONE: Requested = { proof: false, diagnostics: false }

let requested = NONE
const listeners = new Set<() => void>()

/** Mounts a panel for the rest of the session; its code loads the first time this is called. */
export function requestGlobalMount(which: GlobalMount): void {
  if (requested[which]) return
  requested = { ...requested, [which]: true }
  for (const cb of [...listeners]) cb()
}

/** Forgets every request; tests use it between cases. */
export function resetGlobalMounts(): void {
  requested = NONE
  for (const cb of [...listeners]) cb()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

const snapshot = (): Requested => requested

/** Panels that float above every page. Nothing here loads until something asks for it. */
export function GlobalMounts() {
  const open = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    onProofInspectorNeeded(() => {
      requestGlobalMount('proof')
    })
    return () => {
      onProofInspectorNeeded(undefined)
    }
  }, [])
  return (
    <>
      {open.proof ? <ProofInspectorMount /> : null}
      {open.diagnostics ? <DiagnosticsMount /> : null}
    </>
  )
}
