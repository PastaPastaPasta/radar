import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { DecodedTx } from '@/data/core/types'
import { formatInt } from '@/lib/format'
import { Icon, Time } from '@/ui'
import type { FirstSeen } from './useFirstSeen'

type State = 'done' | 'pending' | 'future'

function Step({
  state,
  title,
  detail,
  name,
}: {
  state: State
  title: React.ReactNode
  detail: React.ReactNode
  name: string
}) {
  return (
    <li
      data-step={name}
      data-state={state}
      className={state === 'pending' ? 'is-now' : state === 'done' ? 'is-done' : undefined}
    >
      <b>{title}</b>
      <span>{detail}</span>
    </li>
  )
}

/**
 * Received → InstantSend locked → mined → ChainLocked. The received time is the mempool's first sighting
 * when Hyphen still holds it; after that the best a mined transaction can say is that it arrived no later
 * than its block's time. Nothing here is a time that would have to be guessed.
 */
export function Settlement({
  tx,
  coinbase,
  firstSeen,
}: {
  tx: DecodedTx
  coinbase: boolean
  firstSeen?: FirstSeen
}) {
  const { t } = useLingui()
  const mined = tx.height !== undefined
  const locked = tx.isChainLocked === true
  const instant = tx.isInstantLocked === true
  return (
    <ol className="rx-life">
      {coinbase ? null : (
        <Step
          name="seen"
          state="done"
          title={t`Received`}
          detail={
            firstSeen ? (
              <>
                <Time ms={firstSeen.at} mode="absolute" /> {t`first seen in the mempool`}
              </>
            ) : mined ? (
              <span title={t`No source keeps when a transaction first arrived once it is mined.`}>
                {tx.time ? (
                  <>
                    {t`at or before`} <Time ms={tx.time} mode="absolute" />
                  </>
                ) : (
                  t`before it was mined`
                )}
              </span>
            ) : (
              t`in the mempool`
            )
          }
        />
      )}
      {coinbase ? null : (
        <Step
          name="instantsend"
          state={instant ? 'done' : mined ? 'future' : 'pending'}
          title={
            <>
              <Icon name="is" size="sm" />
              {instant
                ? tx.instantLockClaim
                  ? t`InstantSend lock`
                  : t`InstantSend locked`
                : t`InstantSend`}
            </>
          }
          detail={
            instant
              ? tx.instantLockClaim
                ? t`reported by one node; no second source has confirmed it`
                : t`masternodes locked its inputs; final from here`
              : mined
                ? t`No InstantSend lock was seen`
                : t`waiting for the masternodes to lock it`
          }
        />
      )}
      <Step
        name="mined"
        state={mined ? 'done' : 'future'}
        title={
          <>
            <Icon name="block" size="sm" />
            {t`Mined`}
          </>
        }
        detail={
          mined && tx.height !== undefined ? (
            <>
              {tx.time ? <Time ms={tx.time} mode="absolute" /> : null}{' '}
              <Link to="/block/$id" params={{ id: tx.blockHash ?? String(tx.height) }}>
                {t`block ${formatInt(tx.height)}`}
              </Link>
            </>
          ) : (
            t`not in a block yet`
          )
        }
      />
      <Step
        name="chainlocked"
        state={locked ? 'done' : mined ? 'pending' : 'future'}
        title={
          <>
            <Icon name="cl" size="sm" />
            {locked ? t`ChainLocked` : t`ChainLock`}
          </>
        }
        detail={
          locked
            ? t`the block can't be reorganised`
            : tx.chainLockClaim
              ? t`reported by one node; waiting for a second source to agree`
              : mined
                ? t`waiting for the masternodes to ChainLock the block`
                : t`after it is mined`
        }
      />
    </ol>
  )
}
