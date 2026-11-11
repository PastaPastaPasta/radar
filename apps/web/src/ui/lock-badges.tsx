import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { Badge } from './badges'
import { Icon } from './icon'

/**
 * A ChainLock is shown as locked only once a second source agrees. One node's word is shown as exactly that,
 * and an unlocked block is not called locked at all.
 */
export function ChainLockBadge({
  locked,
  claim,
  unlockedLabel,
  size,
}: {
  locked: boolean
  claim: 'one-node' | undefined
  /** What to say when nothing reports a lock; omit to say nothing. */
  unlockedLabel?: ReactNode
  size?: 'sm'
}) {
  const { t } = useLingui()
  if (locked) {
    return (
      <Badge tone="success" size={size} icon={<Icon name="cl" size="sm" />}>
        {t`ChainLocked`}
      </Badge>
    )
  }
  if (claim) {
    return (
      <span data-claim="one-node">
        <Badge tone="warning" size={size} icon={<Icon name="cl" size="sm" />}>
          {t`ChainLock reported by one node`}
        </Badge>
      </span>
    )
  }
  return unlockedLabel ? (
    <Badge tone="warning" size={size}>
      {unlockedLabel}
    </Badge>
  ) : null
}

/** An InstantSend lock is reported by the node that answered; no second source is asked. */
export function InstantSendBadge({ claim, size }: { claim: 'one-node' | undefined; size?: 'sm' }) {
  const { t } = useLingui()
  return claim ? (
    <span data-claim="one-node">
      <Badge tone="warning" size={size} icon={<Icon name="is" size="sm" />}>
        {t`InstantSend lock reported by one node`}
      </Badge>
    </span>
  ) : (
    <Badge tone="success" size={size} icon={<Icon name="is" size="sm" />}>
      {t`InstantSend locked`}
    </Badge>
  )
}

/**
 * A ChainLock in a list or a tile: the lock icon only once a second source agrees, "reported by one node" when
 * only one has said so, and nothing otherwise. `compact` is an icon whose words are its label, for a tile.
 */
export function LockMark({
  locked,
  claim,
  compact = false,
}: {
  locked: boolean
  claim: 'one-node' | undefined
  compact?: boolean
}) {
  const { t } = useLingui()
  if (locked) {
    return (
      <span className="rx-lockmark" title={t`ChainLocked`}>
        <Icon name="cl" size="sm" className="rx-lock" />
        <span className="sr-only">{t`ChainLocked`}</span>
      </span>
    )
  }
  if (!claim) return null
  const words = t`ChainLock reported by one node`
  return compact ? (
    <span className="rx-lockmark" data-claim="one-node" title={words}>
      <Icon name="cl" size="sm" />
      <span className="sr-only">{words}</span>
    </span>
  ) : (
    <span className="rx-tag" data-claim="one-node">
      {words}
    </span>
  )
}
