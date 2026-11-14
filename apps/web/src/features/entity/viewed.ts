import { useMemo } from 'react'
import type { NetworkId } from '@/lib/network'
import { createJsonStore, type JsonStore } from '@/lib/json-store'
import { asNetworkId, asRecord, asTimestamp, useJsonStore } from './local-store'

export const VIEWED_KEY = 'radar.viewed'
export const VIEWED_LIMIT = 50

export interface ViewedIdentity {
  net: NetworkId
  id: string
  viewedAt: number
}

interface ViewedState {
  on: boolean
  items: ViewedIdentity[]
}

const OFF: ViewedState = { on: false, items: [] }
function parseItem(raw: unknown): ViewedIdentity | undefined {
  const r = asRecord(raw)
  if (!r) return undefined
  const net = asNetworkId(r.net)
  if (!net || typeof r.id !== 'string' || r.id === '') return undefined
  return {
    net,
    id: r.id,
    viewedAt: asTimestamp(r.viewedAt),
  }
}

function parseViewed(raw: unknown): ViewedState {
  const r = asRecord(raw)
  if (r?.on !== true) return OFF
  const items = Array.isArray(r.items) ? r.items.flatMap((i) => parseItem(i) ?? []) : []
  return { on: true, items }
}

let store: JsonStore<ViewedState> | undefined
const viewed = () => (store ??= createJsonStore(VIEWED_KEY, parseViewed))

/** Whether Radar keeps the identities this browser opened. Off until the viewer turns it on. */
export function useViewedEnabled(): boolean {
  return useJsonStore(viewed()).on
}

/** Turning it off also forgets the list: a record the viewer stopped should not stay behind. */
export function setViewedEnabled(on: boolean): void {
  const state = viewed().get()
  if (state.on === on) return
  viewed().set(on ? { on, items: state.items } : OFF)
}

/** Remembers that this browser opened the identity, newest first, at most `VIEWED_LIMIT` per network. Does nothing while the feature is off. */
export function recordViewedIdentity(net: NetworkId, id: string, now: number = Date.now()): void {
  const state = viewed().get()
  if (!state.on || id === '') return
  const first = state.items.find((i) => i.net === net)
  if (first?.id === id) return
  const others = state.items.filter((i) => i.net !== net)
  const mine = [
    { net, id, viewedAt: now },
    ...state.items.filter((i) => i.net === net && i.id !== id),
  ].slice(0, VIEWED_LIMIT)
  viewed().set({ on: true, items: [...mine, ...others] })
}

/** The network's viewed identities, newest first. */
export function useViewedIdentities(net: NetworkId): ViewedIdentity[] {
  const { items } = useJsonStore(viewed())
  return useMemo(() => items.filter((i) => i.net === net), [items, net])
}

export function clearViewed(): void {
  const state = viewed().get()
  if (state.items.length > 0) viewed().set({ on: state.on, items: [] })
}

/** Forgets the in-memory copy so the next read comes from storage; tests use it after clearing storage. */
export function forgetViewed(): void {
  viewed().forget()
}
