import type { MessageDescriptor } from '@lingui/core'
import { i18n } from '@lingui/core'
import { sectionLabel, SITE_MAP, type SiteSection } from '@/features/entity'

const FEATURED = [
  '/blocks',
  '/masternodes',
  '/nodes',
  '/map',
  '/platform',
  '/identities',
  '/names',
  '/contracts',
  '/query',
  '/status',
  '/settings',
]

/** A page the palette and the search page can open: a route without params, or one named URL under a route with them. */
export interface PageMatch {
  /** The route id, or the URL for a named entry. */
  path: string
  title: string
  section: SiteSection
}

interface Candidate {
  path: string
  title: MessageDescriptor
  section: SiteSection
  keywords: string[]
}

let searchable: Candidate[] | undefined
/** Built on first use, so the app's first load does not pay for it. */
const candidates = (): Candidate[] =>
  (searchable ??= SITE_MAP.flatMap((p) =>
    p.nav
      ? [{ path: p.path, title: p.title, section: p.section, keywords: p.keywords ?? [] }]
      : (p.entries ?? []).map((e) => ({
          path: e.href,
          title: e.title,
          section: p.section,
          keywords: e.keywords ?? [],
        })),
  ))

const match = (c: Candidate): PageMatch => ({
  path: c.path,
  title: i18n._(c.title),
  section: c.section,
})

/** Pages for the palette and the search page: a short list with no query, ranked matches otherwise. */
export function matchPages(query: string, limit = 6): PageMatch[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) {
    return FEATURED.flatMap((path) => candidates().filter((p) => p.path === path)).map(match)
  }
  const scored = candidates().flatMap((p) => {
    const titles = [i18n._(p.title), p.title.message ?? ''].map((x) => x.toLowerCase())
    const keywords = p.keywords.map((k) => k.toLowerCase())
    let score = 0
    if (titles.includes(q)) score = 4
    else if (titles.some((x) => x.startsWith(q))) score = 3
    else if (titles.some((x) => x.includes(q))) score = 2
    else if (keywords.some((k) => k.startsWith(q))) score = 2
    else if (keywords.some((k) => k.includes(q)) || sectionLabel(p.section).toLowerCase() === q) {
      score = 1
    }
    return score > 0 ? [{ p, score }] : []
  })
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => match(x.p))
}
