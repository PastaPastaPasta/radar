import { t } from '@lingui/core/macro'
import { useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
  PageLink,
  pageTitle,
  sectionLabel,
  findPage,
  pagesInSection,
  sectionOfPath,
} from '@/features/search'
import { Icon } from '@/ui'
import { UnitSwitch } from './UnitSwitch'

/** Marks which edges of the rail have more links beyond them, so the stylesheet can fade exactly those. */
function markOverflow(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth
  el.dataset.moreStart = String(el.scrollLeft > 1)
  el.dataset.moreEnd = String(max > 1 && el.scrollLeft < max - 1)
}

/** The page layer of navigation: the other pages in this section. */
export function SectionNav() {
  const { pathname, routeId } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, routeId: s.matches.at(-1)?.routeId ?? '' }),
  })
  const section = sectionOfPath(pathname)
  const current = findPage(routeId)
  const railRef = useRef<HTMLElement>(null)
  const update = useCallback(() => {
    if (railRef.current) markOverflow(railRef.current)
  }, [])

  useLayoutEffect(() => {
    const rail = railRef.current
    const active = rail?.querySelector<HTMLElement>('[aria-current="page"]')
    if (rail && active) {
      const left = active.offsetLeft - rail.offsetLeft
      rail.scrollLeft = Math.max(0, left - (rail.clientWidth - active.offsetWidth) / 2)
    }
    update()
  }, [current?.path, section, update])

  useEffect(() => {
    const rail = railRef.current
    if (!rail || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(rail)
    return () => {
      observer.disconnect()
    }
  }, [section, update])

  if (section === 'home' || section === 'search') return null
  const pages = pagesInSection(section)
  return (
    <>
      <div className="rx-secrail">
        <nav
          ref={railRef}
          aria-label={t`${sectionLabel(section)} pages`}
          data-section-nav={section}
          onScroll={update}
        >
          <ul className="flex gap-x-4 gap-y-1 whitespace-nowrap sm:gap-x-5">
            {pages.map((p) => (
              <li key={p.path}>
                <PageLink
                  to={p.path}
                  aria-current={current?.path === p.path ? 'page' : undefined}
                  className="inline-block py-2"
                >
                  {pageTitle(p)}
                </PageLink>
              </li>
            ))}
          </ul>
        </nav>
        <span
          className="rx-secrail__hint rx-secrail__hint--start"
          aria-hidden="true"
          data-rail-hint="start"
        >
          <Icon name="chevron" size="sm" />
        </span>
        <span
          className="rx-secrail__hint rx-secrail__hint--end"
          aria-hidden="true"
          data-rail-hint="end"
        >
          <Icon name="chevron" size="sm" />
        </span>
      </div>
      <UnitSwitch className="rx-unit--rail" />
    </>
  )
}
