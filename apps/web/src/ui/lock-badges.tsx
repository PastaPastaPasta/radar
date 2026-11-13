import { t } from '@lingui/core/macro'
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

/**
 * An InstantSend lock is one source's claim: the DAPI node that answered, or Hyphen's lock tag when Hyphen stands in
 * for DAPI. It is drawn only while the transaction's block is not ChainLocked; after that it no longer matters.
 */
export function InstantSendBadge({
  claim,
  source = 'dapi',
  size,
}: {
  claim: 'one-node' | undefined
  source?: 'dapi' | 'hyphen'
  size?: 'sm'
}) {
  if (!claim) {
    return (
      <Badge tone="success" size={size} icon={<Icon name="is" size="sm" />}>
        {t`InstantSend locked`}
      </Badge>
    )
  }
  return (
    <span data-claim="one-node" data-source={source}>
      <Badge tone="warning" size={size} icon={<Icon name="is" size="sm" />}>
        {source === 'hyphen'
          ? t`InstantSend lock recorded by Hyphen`
          : t`InstantSend lock reported by one node`}
      </Badge>
    </span>
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
