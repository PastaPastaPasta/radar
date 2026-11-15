import { useLingui } from '@lingui/react/macro'
import { PageLink } from '@/features/entity'

/** Hyphen does not answer, so the reads it would serve go to Insight; said once, above the page. */
export function IndexStandIn() {
  const { t } = useLingui()
  return (
    <p
      role="status"
      data-index-stand-in
      className="rx-note rounded border border-[var(--dh-line)] p-3 max-sm:px-2.5 max-sm:py-2"
    >
      {t`Hyphen isn’t answering, so this page reads Insight where it needs an index.`}{' '}
      <PageLink to="/status">{t`See the sources`}</PageLink>
    </p>
  )
}
