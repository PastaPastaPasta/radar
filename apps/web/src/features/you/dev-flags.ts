import { createJsonStore, type JsonStore } from '@/lib/json-store'
import { useSyncExternalStore } from 'react'

const DEV_FLAGS_KEY = 'radar.dev'

/** Whether each keyboard shortcut is live. Both are on until the viewer turns one off. */
export interface DevFlags {
  proofShortcut: boolean
  diagnosticsShortcut: boolean
}

const DEFAULTS: DevFlags = { proofShortcut: true, diagnosticsShortcut: true }

function parseFlags(raw: unknown): DevFlags {
  if (typeof raw !== 'object' || raw === null) return DEFAULTS
  const r = raw as Record<string, unknown>
  return {
    proofShortcut: r.proofShortcut !== false,
    diagnosticsShortcut: r.diagnosticsShortcut !== false,
  }
}

let store: JsonStore<DevFlags> | undefined
const flags = () => (store ??= createJsonStore(DEV_FLAGS_KEY, parseFlags))

export const getDevFlags = (): DevFlags => flags().get()

export function setDevFlag(name: keyof DevFlags, on: boolean): void {
  const current = flags().get()
  if (current[name] !== on) flags().set({ ...current, [name]: on })
}

export function useDevFlags(): DevFlags {
  return useSyncExternalStore(flags().subscribe, flags().get, flags().get)
}

export function forgetDevFlags(): void {
  flags().forget()
}
