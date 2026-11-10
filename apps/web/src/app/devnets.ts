import { useSyncExternalStore } from 'react'
import type { DevnetConfig, NetworkId } from '@/lib/network'

export const DEVNET_STORAGE_KEY = 'radar.devnets'

const BUILT_IN: DevnetConfig[] = []

const listeners = new Set<() => void>()
let cache: { raw: string | null; value: DevnetConfig[] } | undefined
let unsaved: DevnetConfig[] | undefined

function isConfig(value: unknown): value is DevnetConfig {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.name === 'string' &&
    Array.isArray(v.dapiAddresses) &&
    v.dapiAddresses.every((a) => typeof a === 'string') &&
    (v.quorumUrl === undefined || typeof v.quorumUrl === 'string')
  )
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(DEVNET_STORAGE_KEY)
  } catch {
    return null
  }
}

export function loadDevnets(): DevnetConfig[] {
  const raw = readRaw()
  if (unsaved && raw === null) return unsaved
  if (cache?.raw === raw) return cache.value
  let value: DevnetConfig[] = []
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    value = Array.isArray(parsed) ? parsed.filter(isConfig) : []
  } catch {
    value = []
  }
  cache = { raw, value }
  return value
}

function emit(): void {
  for (const cb of [...listeners]) cb()
}

function store(next: DevnetConfig[]): void {
  try {
    localStorage.setItem(DEVNET_STORAGE_KEY, JSON.stringify(next))
    unsaved = undefined
  } catch {
    unsaved = next
  }
  emit()
}

export function saveDevnet(config: DevnetConfig): void {
  store([...loadDevnets().filter((d) => d.name !== config.name), config])
}

export function removeDevnet(name: string): void {
  store(loadDevnets().filter((d) => d.name !== name))
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === DEVNET_STORAGE_KEY || e.key === null) cb()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export function useDevnets(): DevnetConfig[] {
  return useSyncExternalStore(subscribe, loadDevnets, () => BUILT_IN)
}

export function devnetName(net: NetworkId): string {
  return net.replace(/^devnet-/, '')
}

export function allDevnets(saved: DevnetConfig[]): DevnetConfig[] {
  return [...BUILT_IN, ...saved.filter((d) => !BUILT_IN.some((b) => b.name === d.name))]
}

export function hasDevnet(net: NetworkId, saved: DevnetConfig[]): boolean {
  const name = devnetName(net)
  return allDevnets(saved).some((d) => d.name === name)
}
