import { useNavigate } from '@tanstack/react-router'
import type { LoadState } from '@/ui'

/** A card's load state for a plain query. */
export function loadState(query: { isPending: boolean; isError: boolean; fetchStatus?: string }): LoadState {
  return query.isPending ? 'loading' : query.isError ? 'error' : 'ready'
}

/** The name without DPNS's top-level domain, as `/name/$label` takes it. */
export function nameLabel(username: string): string {
  return username.replace(/\.dash$/i, '')
}

export interface IdentityTabProps {
  id: string
}

/** PE's page size on the identity tabs. */
export const PE_PAGE = 10

/** The PE query for page `page` of a child list, newest first; page 1 sends no `page`. */
export function peChildQuery(page: number, extra: Record<string, string | undefined> = {}) {
  const q: Record<string, string | number> = { limit: PE_PAGE, order: 'desc' }
  if (page > 1) q.page = page
  for (const [k, v] of Object.entries(extra)) if (v) q[k] = v
  return q
}

/** Changes this page's search parameters, keeping the others (and the network and mode). */
export function useSetSearch() {
  const navigate = useNavigate()
  return (patch: Record<string, unknown>) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({ ...prev, ...patch })) as never,
      replace: true,
      resetScroll: false,
    })
}
