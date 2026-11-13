import { useLingui } from '@lingui/react/macro'
import { useSyncExternalStore } from 'react'
import { Icon } from '@/ui'
import { dismissUpdate, subscribeUpdate, updateOffer } from './update-state'

/** A banner that never blocks the page: a newer version is ready, and reloading is the viewer's call. */
export function UpdateNotice() {
  const { t } = useLingui()
  const offer = useSyncExternalStore(subscribeUpdate, updateOffer, updateOffer)
  if (!offer) return null
  return (
    <div
      role="status"
      aria-live="polite"
      data-update-notice
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[70] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-lg border border-[var(--dh-line)] bg-[var(--dh-surface)] p-3 text-[var(--dh-ink)] shadow-lg md:bottom-4"
    >
      <Icon name="info" size="sm" />
      <span className="min-w-0 flex-1">{t`A new version is available.`}</span>
      <button
        type="button"
        className="dh-btn dh-btn--sm"
        onClick={() => {
          offer.apply()
        }}
      >
        {t`Reload`}
      </button>
      <button
        type="button"
        className="dh-btn dh-btn--quiet dh-btn--sm"
        aria-label={t`Dismiss`}
        onClick={dismissUpdate}
      >
        <Icon name="x" size="sm" />
      </button>
    </div>
  )
}
