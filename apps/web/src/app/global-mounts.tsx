import { useEffect, useSyncExternalStore, type ComponentType } from 'react'
import { ErrorBoundary } from '@/app/error-boundary'
import { deferred } from '@/ui/deferred'
import { onProofInspectorNeeded } from '@/ui/proof'

export type GlobalMount = 'proof' | 'diagnostics' | 'update'

const LOADERS: Record<GlobalMount, () => Promise<ComponentType>> = {
  proof: () => import('@/features/you/proof/ProofInspector').then((m) => m.ProofInspector),
  diagnostics: () => import('@/features/you/diagnostics/Diagnostics').then((m) => m.Diagnostics),
  update: () => import('@/features/you/update/UpdateNotice').then((m) => m.UpdateNotice),
}

type Requested = Readonly<Record<GlobalMount, ComponentType | null>>

const NONE: Requested = { proof: null, diagnostics: null, update: null }

let requested: Requested = NONE
const listeners = new Set<() => void>()

/** Mounts a panel for the rest of the session; its code loads the first time this is called. */
export function requestGlobalMount(which: GlobalMount): void {
  if (requested[which]) return
  requested = { ...requested, [which]: deferred(LOADERS[which]) }
  for (const cb of [...listeners]) cb()
}

/** A panel whose code failed to load or render is dropped, so a later request starts it afresh. */
function forget(which: GlobalMount): void {
  if (!requested[which]) return
  requested = { ...requested, [which]: null }
  for (const cb of [...listeners]) cb()
}

function Forget({ which }: { which: GlobalMount }) {
  useEffect(() => {
    forget(which)
  }, [which])
  return null
}

function Mount({ which, Panel }: { which: GlobalMount; Panel: ComponentType }) {
  return (
    <ErrorBoundary fallback={() => <Forget which={which} />}>
      <Panel />
    </ErrorBoundary>
  )
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
    const load = (which: GlobalMount) => () => {
      requestGlobalMount(which)
    }
    onProofInspectorNeeded(load('proof'))
    let removeYou: (() => void) | undefined
    let unmounted = false
    void import('@/features/you/boot').then(({ installYou }) => {
      if (unmounted) return
      removeYou = installYou({
        proof: load('proof'),
        diagnostics: load('diagnostics'),
        update: load('update'),
      })
    })
    return () => {
      unmounted = true
      onProofInspectorNeeded(undefined)
      removeYou?.()
    }
  }, [])
  return (
    <>
      {open.proof ? <Mount which="proof" Panel={open.proof} /> : null}
      {open.diagnostics ? <Mount which="diagnostics" Panel={open.diagnostics} /> : null}
      {open.update ? <Mount which="update" Panel={open.update} /> : null}
    </>
  )
}
