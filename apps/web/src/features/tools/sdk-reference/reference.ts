import { msg } from '@lingui/core/macro'
import { i18n, type MessageDescriptor } from '@lingui/core'
import type { SourceId } from '@/data/envelope'
import { pageTitle, SITE_MAP, type SitePage } from '@/features/entity'
import { METHOD_PAGES } from './method-pages'

const SOURCE_NAMES: Record<SourceId, MessageDescriptor> = {
  sdk: msg`Platform SDK`,
  dapi: msg`DAPI`,
  radar: msg`Radar`,
  pe: msg`Platform Explorer`,
  hyphen: msg`Hyphen`,
  insight: msg`Insight`,
  rate: msg`Price feed`,
  local: msg`Your browser`,
}

export const sourceName = (source: SourceId): string => i18n._(SOURCE_NAMES[source])

export interface ReferenceRow {
  path: string
  title: string
  summary: string
  /** The page has no params, so it can be linked. */
  linkable: boolean
  sources: SourceId[]
  /** The SDK calls its figures come from: `[method, SDK call]`. */
  calls: { method: string; call: string }[]
}

/** The pages that read anything beyond Radar's own code, each with the SDK calls behind it. */
export function referenceRows(): ReferenceRow[] {
  const callsOf = new Map<string, { method: string; call: string }[]>()
  for (const [method, row] of Object.entries(METHOD_PAGES)) {
    for (const path of row.pages) {
      const list = callsOf.get(path) ?? []
      list.push({ method, call: row.call })
      callsOf.set(path, list)
    }
  }
  return SITE_MAP.filter((p: SitePage) => p.sources.length > 0).map((p) => ({
    path: p.path,
    title: pageTitle(p),
    summary: i18n._(p.summary),
    linkable: !p.path.includes('$'),
    sources: p.sources,
    calls: (callsOf.get(p.path) ?? []).sort((a, b) => a.method.localeCompare(b.method)),
  }))
}

/** Rows whose title, path, sources or calls contain every word of the query. */
export function filterRows(rows: ReferenceRow[], query: string | undefined): ReferenceRow[] {
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return rows
  return rows.filter((row) => {
    const haystack = [
      row.title,
      row.path,
      row.summary,
      ...row.sources.map((s) => `${s} ${sourceName(s)}`),
      ...row.calls.flatMap((c) => [c.method, c.call]),
    ]
      .join(' ')
      .toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}
