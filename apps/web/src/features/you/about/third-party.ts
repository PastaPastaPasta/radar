import raw from '../../../../../../THIRD_PARTY.md?raw'

export interface ThirdPartyRow {
  component: string
  source: string
  url?: string
  licence: string
  usedIn: string
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

/** The rows of THIRD_PARTY.md's table, so the About page lists what the repository lists. */
export function parseThirdParty(markdown: string): ThirdPartyRow[] {
  const rows: ThirdPartyRow[] = []
  let header = false
  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const parts = cells(line)
    if (!header) {
      header = true
      continue
    }
    if (parts.every((p) => /^:?-+:?$/.test(p))) continue
    const [component = '', source = '', licence = '', usedIn = ''] = parts
    const link = /^\[([^\]]+)\]\(([^)]+)\)(.*)$/.exec(source)
    rows.push({
      component,
      source: link ? `${link[1]}${link[3]}` : source,
      ...(link?.[2] ? { url: link[2] } : {}),
      licence,
      usedIn: usedIn.replace(/`/g, ''),
    })
  }
  return rows
}

export const THIRD_PARTY: readonly ThirdPartyRow[] = parseThirdParty(raw)
