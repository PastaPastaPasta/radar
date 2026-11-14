import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { Icon } from '@/ui'

/** A devnet whose DAPI addresses all failed: said once, with the way to fix it, instead of pages that never fill. */
export default function DevnetUnreachable() {
  const { t } = useLingui()
  return (
    <div
      role="alert"
      data-devnet-unreachable
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[70] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-lg border border-[var(--dh-line)] bg-[var(--dh-surface)] p-3 text-[var(--dh-ink)] shadow-lg md:bottom-4"
    >
      <Icon name="info" size="sm" />
      <span className="min-w-0 flex-1">
        {t`Radar can’t reach these DAPI addresses. Check them, or the devnet may be down.`}
      </span>
      <Link to="/settings" hash="devnets" className="dh-btn dh-btn--sm">
        {t`Edit devnet`}
      </Link>
    </div>
  )
}
