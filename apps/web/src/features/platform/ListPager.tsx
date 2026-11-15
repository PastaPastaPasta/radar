import { useLingui } from '@lingui/react/macro'
import { Link, type LinkProps } from '@tanstack/react-router'

/** Previous and Next for a list in name or index order, where "Newer" and "Older" would say nothing. */
export function ListPager({
  prev,
  next,
}: {
  prev?: LinkProps | undefined
  next?: LinkProps | undefined
}) {
  const { t } = useLingui()
  const link = (props: LinkProps | undefined, label: string, rel: 'next' | 'prev') =>
    props ? (
      <Link {...props} className="dh-btn dh-btn--sm" rel={rel}>
        {label}
      </Link>
    ) : (
      <span className="dh-btn dh-btn--sm" aria-disabled="true">
        {label}
      </span>
    )
  return (
    <nav className="rx-pager" aria-label={t`Pagination`}>
      {link(prev, t`Previous`, 'prev')}
      {link(next, t`Next`, 'next')}
    </nav>
  )
}
