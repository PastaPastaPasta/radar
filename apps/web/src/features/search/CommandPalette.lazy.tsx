import { lazy, Suspense, useEffect, useState } from 'react'
import { useCommandPalette } from './palette-context'

const loadModule = () => import('./CommandPalette')
const Loaded = lazy(() => loadModule().then((m) => ({ default: m.CommandPalette })))

/**
 * The search dialog, with its command list and every resolver, is fetched when the browser is idle after first paint
 * and mounted on first use, so the shell's entry chunk does not carry it and the first Ctrl+K still finds it ready.
 */
export function CommandPalette() {
  const { isOpen } = useCommandPalette()
  const [wanted, setWanted] = useState(false)
  if (isOpen && !wanted) setWanted(true)

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    const handle = idle(() => void loadModule())
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [])

  return wanted ? (
    <Suspense fallback={null}>
      <Loaded />
    </Suspense>
  ) : null
}
