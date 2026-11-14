import { pageTitle, sectionLabel, SITE_MAP, type SitePage } from '@/features/entity'

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

const SEARCHABLE = SITE_MAP.filter((p) => p.nav)

/** Pages for the palette: a short list with no query, ranked matches otherwise. */
export function matchPages(query: string, limit = 6): SitePage[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) {
    return FEATURED.flatMap((path) => SEARCHABLE.filter((p) => p.path === path))
  }
  const scored = SEARCHABLE.flatMap((p) => {
    const titles = [pageTitle(p), p.title.message ?? ''].map((x) => x.toLowerCase())
    const keywords = (p.keywords ?? []).map((k) => k.toLowerCase())
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
    .map((x) => x.p)
}
