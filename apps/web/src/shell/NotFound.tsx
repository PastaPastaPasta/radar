import { useLocation } from '@tanstack/react-router'
import { PageLink, SearchTrigger, useDocumentTitle } from '@/features/search'
import { Empty } from '@/ui'

export function NotFoundPage() {
  const { pathname } = useLocation()
  useDocumentTitle('Page not found')
  return (
    <article className="grid gap-6" data-page="not-found">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <Empty
        kind="not-found"
        title={`There is no page at ${pathname}`}
        body="The link may be old or mistyped. Search for what you were after, or start from one of the sections."
        action={<SearchTrigger label="Search Radar" />}
      />
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        <li>
          <PageLink to="/">Network pulse</PageLink>
        </li>
        <li>
          <PageLink to="/blocks">Core blocks</PageLink>
        </li>
        <li>
          <PageLink to="/masternodes">Masternodes</PageLink>
        </li>
        <li>
          <PageLink to="/platform">Platform</PageLink>
        </li>
        <li>
          <PageLink to="/sources">Data sources</PageLink>
        </li>
      </ul>
    </article>
  )
}
