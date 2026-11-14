import { createJsonStore, type JsonStore } from '@/lib/json-store'
import { asNetworkId, type NetworkId } from '@/lib/network'
import { notifyLabelsChanged, registerLabelOverlay } from '@/lib/well-known'
import { useSyncExternalStore } from 'react'

export const LABELS_KEY = 'radar.labels'
export const LABEL_KINDS = ['identity', 'contract', 'token'] as const
export type LabelKind = (typeof LABEL_KINDS)[number]
export const MAX_LABEL_LENGTH = 60

export interface LocalLabel {
  net: NetworkId
  kind: LabelKind
  id: string
  label: string
}

type LabelKey = Pick<LocalLabel, 'net' | 'kind' | 'id'>

const clip = (text: string) => text.trim().slice(0, MAX_LABEL_LENGTH)

function parseLabel(raw: unknown): LocalLabel | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const net = typeof r.net === 'string' ? asNetworkId(r.net) : undefined
  const kind = LABEL_KINDS.find((k) => k === r.kind)
  if (!net || !kind || typeof r.id !== 'string' || r.id === '') return undefined
  if (typeof r.label !== 'string' || r.label.trim() === '') return undefined
  return { net, kind, id: r.id, label: clip(r.label) }
}

const parseLabels = (raw: unknown): LocalLabel[] =>
  Array.isArray(raw) ? raw.flatMap((r) => parseLabel(r) ?? []) : []

let store: JsonStore<LocalLabel[]> | undefined
const labels = () => (store ??= createJsonStore(LABELS_KEY, parseLabels))

const same = (a: LabelKey, b: LabelKey) => a.net === b.net && a.kind === b.kind && a.id === b.id

/** Names an id on this device only, replacing an earlier label for it. */
export function setLabel(entry: LocalLabel): void {
  const text = clip(entry.label)
  if (text === '') return
  labels().set([
    ...labels()
      .get()
      .filter((l) => !same(l, entry)),
    { ...entry, label: text },
  ])
}

export function removeLabel(key: LabelKey): void {
  const all = labels().get()
  const rest = all.filter((l) => !same(l, key))
  if (rest.length !== all.length) labels().set(rest)
}

export function useLocalLabels(): LocalLabel[] {
  return useSyncExternalStore(labels().subscribe, labels().get, labels().get)
}

export function forgetLabels(): void {
  labels().forget()
}

let installed: (() => void) | undefined

/**
 * Makes the viewer's own labels win over the shared table of well-known names. Called once at app start, so a label
 * shows on every page and not only after the settings page was opened.
 */
export function installLabelOverlay(): () => void {
  if (installed) return installed
  const remove = registerLabelOverlay(
    (net, kind, id) =>
      labels()
        .get()
        .find((l) => l.net === net && l.kind === kind && l.id === id)?.label,
  )
  const stop = labels().subscribe(notifyLabelsChanged)
  installed = () => {
    remove()
    stop()
    installed = undefined
  }
  return installed
}
