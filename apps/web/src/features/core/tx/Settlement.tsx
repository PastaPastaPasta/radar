import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { DecodedTx } from '@/data/core/types'
import { formatInt } from '@/lib/format'
import { Icon, Time } from '@/ui'

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
 * Seen → InstantSend locked → mined → ChainLocked. DAPI gives no time for the first two steps, so they say
 * what is known (that it happened) and never a time that would have to be guessed.
 */
export function Settlement({ tx, coinbase }: { tx: DecodedTx; coinbase: boolean }) {
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
          title={t`Seen`}
          detail={mined ? t`before it was mined` : t`in the mempool`}
        />
      )}
      {coinbase ? null : (
        <Step
          name="instantsend"
          state={instant ? 'done' : mined ? 'future' : 'pending'}
          title={
            <>
              <Icon name="is" size="sm" />
              {instant ? t`InstantSend locked` : t`InstantSend`}
            </>
          }
          detail={
            instant
              ? t`masternodes locked its inputs; final from here`
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
            : mined
              ? t`waiting for the masternodes to ChainLock the block`
              : t`after it is mined`
        }
      />
    </ol>
  )
}
