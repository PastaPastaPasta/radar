import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import { formatInt } from '@/lib/format'
import { Icon, LiveDot } from '@/ui'
import { useLiveView } from '@/ui/live-connection'
import { useLiveConnectionFeed } from './live-connection'
import { useNetwork } from './network'
import { PageLink } from './PageLink'

/**
 * The persistent header's live Core height with its ChainLock state and the connection's state, on every page (IN-15).
 * It also feeds the connection state to every other "Live" on the page.
 */
export function HeaderTip() {
  const { t } = useLingui()
  const net = useNetwork()
  useLiveConnectionFeed(net)
  const view = useLiveView()
  const tip = useQuery(coreQueries.tip(net))
  const lock = useQuery(coreQueries.chainLock(net))
  const height = tip.data?.data.height
  const locked = height !== undefined && lock.data ? lock.data.data.height >= height : undefined
  const lockWord =
    locked === undefined ? undefined : locked ? t`ChainLocked` : t`Not ChainLocked yet`
  return (
    <div
      className="rx-hdrtip"
      data-header-tip
      data-connection={view.state}
      data-up={view.up ? 'true' : 'false'}
    >
      <PageLink
        to={height === undefined ? '/blocks' : `/block/${height}`}
        className="rx-hdrtip__link"
        title={view.title}
      >
        <LiveDot state="live" bare />
        <span className="rx-hdrtip__label">{t`Core`}</span>
        <b className="rx-hdrtip__height rx-num" data-tip="header">
          {height === undefined ? '—' : formatInt(height)}
        </b>
        {locked ? <Icon name="cl" size="sm" className="rx-hdrtip__lock" /> : null}
        <span className="dh-sr">
          {t`Core block height`}
          {lockWord ? `, ${lockWord}` : ''}
        </span>
      </PageLink>
      {view.state === 'live' ? null : (
        <span className="rx-hdrtip__state" aria-hidden="true">
          {view.word}
        </span>
      )}
      <span className="dh-sr" aria-live="polite" aria-atomic="true" data-live-state={view.state}>
        {view.state === 'live' ? '' : view.title}
      </span>
    </div>
  )
}
