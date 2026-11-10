import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNetwork } from '@/features/entity'
import { searchEnv } from './env'

export interface PaletteApi {
  isOpen: boolean
  initialQuery: string
  open(initialQuery?: string): void
  close(): void
  toggle(): void
}

const noop = () => undefined
const FALLBACK: PaletteApi = {
  isOpen: false,
  initialQuery: '',
  open: noop,
  close: noop,
  toggle: noop,
}

const PaletteContext = createContext<PaletteApi>(FALLBACK)

export function useCommandPalette(): PaletteApi {
  return useContext(PaletteContext)
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const net = useNetwork()
  const [isOpen, setOpen] = useState(false)
  const [initialQuery, setInitialQuery] = useState('')

  const open = useCallback(
    (initial = '') => {
      setInitialQuery(initial)
      setOpen(true)
      searchEnv.warmSdk(net)
    },
    [net],
  )
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => {
    if (isOpen) close()
    else open()
  }, [isOpen, open, close])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
        return
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault()
        open()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggle, open])

  const api = useMemo(
    () => ({ isOpen, initialQuery, open, close, toggle }),
    [isOpen, initialQuery, open, close, toggle],
  )

  return <PaletteContext value={api}>{children}</PaletteContext>
}
