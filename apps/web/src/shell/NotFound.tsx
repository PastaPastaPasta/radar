import { useLingui } from '@lingui/react/macro'
import { useLocation } from '@tanstack/react-router'
import { PageLink, SearchTrigger, useDocumentTitle } from '@/features/search'
import { Empty } from '@/ui'

export function NotFoundPage() {
  const { t } = useLingui()
  const { pathname } = useLocation()
  useDocumentTitle(t`Page not found`)
  return (
    <article className="grid gap-6" data-page="not-found">
      <h1 className="text-3xl font-semibold">{t`Page not found`}</h1>
      <Empty
        kind="not-found"
        title={t`There is no page at ${pathname}`}
        body={t`The link may be old or mistyped. Search for what you were after, or start from one of the sections.`}
        action={<SearchTrigger label={t`Search Radar`} />}
      />
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        <li>
          <PageLink to="/">{t`Network pulse`}</PageLink>
        </li>
        <li>
          <PageLink to="/blocks">{t`Core blocks`}</PageLink>
        </li>
        <li>
          <PageLink to="/masternodes">{t`Masternodes`}</PageLink>
        </li>
        <li>
          <PageLink to="/platform">{t`Platform`}</PageLink>
        </li>
        <li>
          <PageLink to="/sources">{t`Data sources`}</PageLink>
        </li>
      </ul>
    </article>
  )
}
