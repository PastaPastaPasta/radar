import { useEffect, useState } from 'react'
import { deferred } from '@/ui/deferred'
import { useCommandPalette } from './palette-context'

const loadModule = () => import('./CommandPalette')
const PRELOAD_DELAY_MS = 1500
const Loaded = deferred(() => loadModule().then((m) => m.CommandPalette))

/**
 * The search dialog, with its command list and every resolver, is fetched at the first sign of a visitor
 * (or 1.5 s after first paint) and mounted on first use, so the shell's entry chunk does not carry it.
 */
export function CommandPalette() {
  const { isOpen } = useCommandPalette()
  const [wanted, setWanted] = useState(false)
  if (isOpen && !wanted) setWanted(true)

  useEffect(() => {
    const abort = new AbortController()
    const load = () => {
      abort.abort()
      void loadModule()
    }
    const handle = window.setTimeout(load, PRELOAD_DELAY_MS)
    for (const type of ['pointermove', 'touchstart', 'keydown'])
      window.addEventListener(type, load, { once: true, passive: true, signal: abort.signal })
    return () => {
      window.clearTimeout(handle)
      abort.abort()
    }
  }, [])

  return wanted ? <Loaded /> : null
}
