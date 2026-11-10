import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { parseSearch } from '@/app/search'

export function routerLocation(url: URL) {
  return {
    to: url.pathname as '/',
    search: parseSearch(url.search) as never,
    hash: url.hash ? url.hash.slice(1) : undefined,
  }
}

/**
 * Plain anchors to Radar's own pages (entity chips, links in markdown-like text) navigate inside
 * the app instead of reloading it.
 */
export function useSpaLinks(): void {
  const router = useRouter()
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return
      }
      const anchor = e
        .composedPath()
        .find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement)
      if (!anchor?.hasAttribute('href')) return
      if (anchor.hasAttribute('download')) return
      const target = anchor.getAttribute('target')
      if (target && target !== '_self') return
      const url = new URL(anchor.href, location.href)
      if (url.origin !== location.origin) return
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return
      const known = router.matchRoutes(url.pathname, {}).some((m) => m.routeId !== '__root__')
      if (!known) return
      e.preventDefault()
      void router.navigate(routerLocation(url))
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [router])
}
