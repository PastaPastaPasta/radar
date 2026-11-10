import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useSourceHealth } from '@/data/health'
import { coreQueries } from '@/data/core/queries'
import { clampSkew, formatRelative } from '@/lib/format'
import { Icon, useNow } from '@/ui'
import { useNetwork } from '@/features/entity'

/** Says so when the Core live connection has dropped, so a still page is never mistaken for a quiet chain (IN-15). */
export function LiveNotice({ lastTipAt }: { lastTipAt: number | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const health = useSourceHealth('dapi')
  const client = useQueryClient()
  const now = useNow(true)
  if (health.state !== 'down' && health.state !== 'stale') return null
  const since = lastTipAt === undefined ? undefined : formatRelative(clampSkew(lastTipAt, now), now)
  return (
    <p className="rx-note rx-livenotice" role="status" data-live-notice={health.state}>
      <Icon name="alert" size="sm" />{' '}
      {since
        ? t`Live updates have stopped. The chain shown is as of ${since}.`
        : t`Live updates have stopped.`}{' '}
      <button
        type="button"
        className="dh-btn dh-btn--link"
        onClick={() => {
          void client.invalidateQueries({ queryKey: coreQueries.tip(net).queryKey })
          void client.invalidateQueries({ queryKey: coreQueries.chainLock(net).queryKey })
        }}
      >
        {t`Try again`}
      </button>
    </p>
  )
}
