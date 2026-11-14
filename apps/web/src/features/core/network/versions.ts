interface VersionCount {
  version: string
  count: number
}

/** "/Dash Core:23.1.8/" → "23.1.8"; anything else is shown as Hyphen sent it. */
export function coreVersion(subversion: string | null | undefined): string {
  if (!subversion) return 'unknown'
  const m = /Dash Core:([^/(]+)/.exec(subversion)
  return m?.[1]?.trim() ?? subversion.replace(/^\/|\/$/g, '')
}

/** Peers grouped by Core version, most common first. */
export function versionCounts(peers: readonly { subversion?: string | null }[]): VersionCount[] {
  const counts = new Map<string, number>()
  for (const p of peers) {
    const v = coreVersion(p.subversion)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count || (a.version < b.version ? 1 : -1))
}

interface Velocity {
  perBlock: number
  blocks: number
}

/** Transactions per block between the first and last bucket of a metrics window. */
export function velocity(
  rows: readonly { height: number; txCount: number }[],
): Velocity | undefined {
  const first = rows[0]
  const last = rows[rows.length - 1]
  if (!first || !last || last.height <= first.height) return undefined
  const blocks = last.height - first.height
  return { perBlock: (last.txCount - first.txCount) / blocks, blocks }
}
