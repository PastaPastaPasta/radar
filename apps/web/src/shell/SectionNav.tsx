import { t } from '@lingui/core/macro'
import { useRouterState } from '@tanstack/react-router'
import {
  PageLink,
  pageTitle,
  sectionLabel,
  findPage,
  pagesInSection,
  sectionOfPath,
} from '@/features/search'

/** The page layer of navigation: the other pages in this section. */
export function SectionNav() {
  const { pathname, routeId } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, routeId: s.matches.at(-1)?.routeId ?? '' }),
  })
  const section = sectionOfPath(pathname)
  if (section === 'home' || section === 'search') return null
  const pages = pagesInSection(section)
  const current = findPage(routeId)
  return (
    <nav
      aria-label={t`${sectionLabel(section)} pages`}
      data-section-nav={section}
      className="mb-6 overflow-x-auto"
    >
      <ul className="flex gap-x-5 gap-y-1 whitespace-nowrap">
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
  )
}
