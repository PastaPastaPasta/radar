import { useSyncExternalStore } from 'react'
import type * as Bip39 from './bip39-words'

type Words = typeof Bip39

let loaded: Words | undefined
let loading: Promise<void> | undefined
const listeners = new Set<() => void>()

/**
 * The recovery-phrase wordlist is 6 kB gzipped, so it loads in its own chunk right after the entry
 * instead of inside it. Until it has arrived the classifier treats anything long enough to be a phrase
 * as one, so nothing that might be a phrase leaves the device in the meantime.
 */
export function ensureWordlist(): Promise<void> {
  loading ??= import('./bip39-words').then(
    (words) => {
      loaded = words
      for (const notify of listeners) notify()
    },
    () => {
      loading = undefined
    },
  )
  return loading
}

export function wordlist(): Words | undefined {
  if (!loaded) void ensureWordlist()
  return loaded
}

const subscribe = (notify: () => void) => {
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
  }
}

/** Re-renders a component, so its memoised classifications are redone, once the wordlist arrives. */
export function useWordlistLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded !== undefined)
}

void ensureWordlist()
