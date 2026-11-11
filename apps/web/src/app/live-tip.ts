import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNetwork } from '@/features/entity'

let enabled = false

/**
 * `main.tsx` turns the live tip on once the DAPI transport is installed. Page tests leave it off, so rendering the
 * app in a test opens no stream.
 */
export function enableLiveTip(): void {
  enabled = true
}

/**
 * Keeps the Core tip and ChainLock of the network on screen current (§4.6). `coreLive` loads on demand, so the stream
 * code stays out of the entry chunk; the shell mounts this on every page.
 */
export function useLiveTip(): void {
  const net = useNetwork()
  const client = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let release: (() => void) | undefined
    void import('@/data/core/live').then(({ coreLive }) => {
      if (!cancelled) release = coreLive.tip(net, client)
    })
    return () => {
      cancelled = true
      release?.()
    }
  }, [net, client])
}
