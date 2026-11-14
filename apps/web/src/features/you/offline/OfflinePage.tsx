import { useLingui } from '@lingui/react/macro'
import { useSyncExternalStore } from 'react'
import { PageFrame, PageLink } from '@/features/entity'
import { Card } from '@/ui'

const subscribe = (notify: () => void) => {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

/** Where Radar sends a page it can't reach: it says what is wrong and what still works, instead of going home. */
export function OfflinePage() {
  const { t } = useLingui()
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
  return (
    <PageFrame
      path="/offline"
      title={t`Offline`}
      eyebrow={t`You`}
      layer="neutral"
      lede={
        online
          ? t`You’re back online: Radar can reach the network again, so any page loads.`
          : t`You’re offline: Radar can’t reach the network, so pages that read from it can’t load. They load again when the connection returns.`
      }
    >
      <Card title={t`What still works`}>
        <ul className="grid gap-2" data-offline-page>
          <li>
            <PageLink to="/saved">{t`Your saved items`}</PageLink>
          </li>
          <li>
            <PageLink to="/settings">{t`Settings`}</PageLink>
          </li>
          <li>
            <PageLink to="/about">{t`About`}</PageLink>
          </li>
          <li>
            <PageLink to="/">{t`Network pulse`}</PageLink>
          </li>
        </ul>
      </Card>
    </PageFrame>
  )
}
