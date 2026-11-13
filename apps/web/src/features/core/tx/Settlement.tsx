import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { instantLockView } from '@/data/core/lock-state'
import type { DecodedTx } from '@/data/core/types'
import { formatInt } from '@/lib/format'
import { Icon, Time } from '@/ui'
import type { FirstSeen } from './useFirstSeen'

type State = 'done' | 'claimed' | 'pending' | 'skipped' | 'unknown' | 'future'

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
 * Received → InstantSend locked → mined → ChainLocked. The received time is the mempool's first sighting, shown
 * while the transaction is pending and for one this page watched arrive. No source keeps it once a transaction
 * is mined, so a mined one opens at the step it has, with one line saying why.
 */
export function Settlement({
  tx,
  coinbase,
  firstSeen,
  hyphenLock,
}: {
  tx: DecodedTx
  coinbase: boolean
  firstSeen?: FirstSeen
  /** Hyphen's persistent record of an InstantSend lock; undefined while it is unasked or unanswered. */
  hyphenLock?: boolean
}) {
  const { t } = useLingui()
  const mined = tx.height !== undefined
  const locked = tx.isChainLocked === true
  const lock = instantLockView(tx, hyphenLock)
  const instant = lock.state
  const hyphen = lock.sources.includes('hyphen')
  const dapi = lock.sources.includes('dapi')
  const received = !coinbase && (firstSeen !== undefined || !mined)
  return (
    <>
      <ol className="rx-life">
        {received ? (
          <Step
            name="seen"
            state="done"
            title={t`Received`}
            detail={
              firstSeen ? (
                <>
                  <Time ms={firstSeen.at} mode="absolute" seconds /> {t`first seen in the mempool`}
                </>
              ) : (
                t`in the mempool`
              )
            }
          />
        ) : null}
        {coinbase ? null : (
          <Step
            name="instantsend"
            state={
              instant === 'corroborated'
                ? 'done'
                : instant === 'claimed'
                  ? 'claimed'
                  : instant === 'unknown'
                    ? 'unknown'
                    : mined
                      ? 'skipped'
                      : 'pending'
            }
            title={
              <>
                <Icon name="is" size="sm" />
                {instant === 'corroborated'
                  ? t`InstantSend locked`
                  : instant === 'claimed'
                    ? t`InstantSend lock`
                    : t`InstantSend`}
              </>
            }
            detail={
              instant === 'corroborated'
                ? t`masternodes locked its inputs; final from here`
                : instant === 'claimed'
                  ? hyphen && dapi
                    ? t`recorded by a DAPI node and Hyphen; neither is independently confirmed`
                    : hyphen
                      ? t`recorded by Hyphen; no second source has confirmed it`
                      : t`reported by one node; no second source has confirmed it`
                  : instant === 'unknown'
                    ? t`not known: nodes drop InstantSend locks once a block is ChainLocked`
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
            tx.height !== undefined ? (
              <>
                {tx.time ? <Time ms={tx.time} mode="absolute" seconds /> : null}{' '}
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
          state={locked ? 'done' : tx.chainLockClaim ? 'claimed' : mined ? 'pending' : 'future'}
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
      {!coinbase && mined && !firstSeen ? (
        <p className="rx-note" data-received-note>
          {t`Mempool arrival times aren’t kept once a transaction is mined.`}
        </p>
      ) : null}
    </>
  )
}
