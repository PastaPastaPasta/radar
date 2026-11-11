import { lazy, Suspense, useEffect, useState } from 'react'
import { useCommandPalette } from './palette-context'

const loadModule = () => import('./CommandPalette')
const PRELOAD_DELAY_MS = 1500
const Loaded = lazy(() => loadModule().then((m) => ({ default: m.CommandPalette })))

/**
 * The search dialog, with its command list and every resolver, is fetched shortly after first paint
 * and mounted on first use, so the shell's entry chunk does not carry it and the first Ctrl+K still finds it ready.
 */
export function CommandPalette() {
  const { isOpen } = useCommandPalette()
  const [wanted, setWanted] = useState(false)
  if (isOpen && !wanted) setWanted(true)

  useEffect(() => {
    const handle = window.setTimeout(() => void loadModule(), PRELOAD_DELAY_MS)
    return () => window.clearTimeout(handle)
  }, [])

  return wanted ? (
    <Suspense fallback={null}>
      <Loaded />
    </Suspense>
  ) : null
}
