import { i18n } from '@lingui/core'
import { t } from '@lingui/core/macro'
import { useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { PageLink, sectionLabel, findPage, railEntries, sectionOfPath } from '@/features/search'
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
  const entries = railEntries(section)
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
            {entries.map((entry) => (
              <li key={entry.key}>
                <PageLink
                  to={entry.href ?? entry.to}
                  aria-current={current && entry.pages.includes(current.path) ? 'page' : undefined}
                  className="inline-block py-2"
                >
                  {i18n._(entry.title)}
                </PageLink>
              </li>
            ))}
          </ul>
        </nav>
        {(['start', 'end'] as const).map((edge) => (
          <span
            key={edge}
            className={`rx-secrail__hint rx-secrail__hint--${edge}`}
            aria-hidden="true"
            data-rail-hint={edge}
          >
            <Icon name="chevron" size="sm" />
          </span>
        ))}
      </div>
      <UnitSwitch className="rx-unit--rail" />
    </>
  )
}
