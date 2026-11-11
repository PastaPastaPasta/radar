import { useLingui } from '@lingui/react/macro'
import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { DecodedTx, PrevOut } from '@/data/core/types'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, AmountDensity, Card } from '@/ui'
import type { OutputSpend } from './spend'
import { isCoinbaseTx, prevoutKey } from './tx-info'
import { useOutputSpends } from './useOutputSpends'

const INITIAL = 10

const short = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`

function anchorIndex(hash: string, prefix: 'in' | 'out'): number | undefined {
  const m = new RegExp(`^${prefix}-(\\d+)$`).exec(hash)
  return m ? Number(m[1]) : undefined
}

function useAnchor(): { in?: number; out?: number; hash: string } {
  const hash = useRouterState({ select: (s) => s.location.hash })
  return { in: anchorIndex(hash, 'in'), out: anchorIndex(hash, 'out'), hash }
}

/** Scrolls a deep-linked row into view once it is rendered. */
function useScrollToAnchor(ready: boolean, hash: string) {
  useEffect(() => {
    if (!ready || !hash) return
    document.getElementById(hash)?.scrollIntoView?.({ block: 'center' })
  }, [ready, hash])
}

type SpendContext = Omit<Parameters<typeof useOutputSpends>[0], 'net' | 'tx' | 'visible'>

function SpendState({ spend, index }: { spend: OutputSpend | undefined; index: number }) {
  const { t } = useLingui()
  if (!spend) return <span className="rx-dim rx-sm">—</span>
  switch (spend.state) {
    case 'spent':
      return (
        <span data-spend="spent">
          <span className="rx-st rx-st--warn rx-sm">{t`Spent`}</span>{' '}
          {spend.by ? (
            <Link
              className="rx-sub"
              to="/tx/$txid"
              params={{ txid: spend.by.txid }}
              hash={`in-${spend.by.vin}`}
              title={t`Output ${index} is spent by input ${spend.by.vin} of this transaction`}
            >
              {t`in ${short(spend.by.txid)}`}
            </Link>
          ) : spend.resolving ? (
            <span className="rx-dim rx-sm">{t`finding where…`}</span>
          ) : (
            <span
              className="rx-dim rx-sm"
              title={t`Hyphen says it is spent but its history does not show which transaction spent it.`}
            >
              {t`spender not found`}
            </span>
          )}
        </span>
      )
    case 'unspent':
      return (
        <span data-spend="unspent">
          <span className="rx-st rx-st--good rx-sm">{t`Unspent`}</span>
          {spend.asOf !== undefined && spend.behind > 0 ? (
            <>
              {' '}
              <span className="rx-dim rx-sm">{t`as of block ${formatInt(spend.asOf)}`}</span>
            </>
          ) : null}
        </span>
      )
    case 'unspendable':
      return (
        <span data-spend="unspendable" className="rx-dim rx-sm">
          {t`Unspendable`}
        </span>
      )
    case 'unknown':
      return (
        <span
          data-spend="unknown"
          className="rx-dim rx-sm"
          title={
            spend.reason === 'behind'
              ? t`Hyphen's index is ${formatInt(spend.behind ?? 0)} blocks behind the chain, so it cannot say whether this output has been spent since.`
              : spend.reason === 'unconfirmed'
                ? t`The transaction is not in a block yet.`
                : spend.reason === 'loading'
                  ? t`Asking Hyphen.`
                  : t`No source can say whether this output is spent.`
          }
        >
          {spend.reason === 'loading'
            ? '…'
            : spend.reason === 'unconfirmed'
              ? t`Not mined yet`
              : spend.reason === 'behind'
                ? t`Unknown: index behind`
                : t`Unknown`}
        </span>
      )
  }
}

export function IoTables({
  tx,
  prevouts,
  senders,
  spendContext,
  partial,
  onLoadAll,
}: {
  tx: DecodedTx
  prevouts: ReadonlyMap<string, PrevOut> | undefined
  senders: Set<string>
  spendContext: SpendContext
  /** Inputs beyond this index are not loaded; offer to load them. */
  partial?: { loaded: number; loading: boolean }
  onLoadAll?: () => void
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const anchor = useAnchor()
  const [showAllIn, setShowAllIn] = useState(false)
  const [showAllOut, setShowAllOut] = useState(false)
  const inCount = tx.inputs.length
  const outCount = tx.outputs.length
  const inLimit = showAllIn || (anchor.in ?? -1) >= INITIAL ? inCount : INITIAL
  const outLimit = showAllOut || (anchor.out ?? -1) >= INITIAL ? outCount : INITIAL
  useScrollToAnchor(true, anchor.hash)
  const spends = useOutputSpends({ net, tx, visible: outLimit, ...spendContext })
  const coinbase = isCoinbaseTx(tx)
  const inTotal =
    inCount > 0 && tx.inputs.every((i) => prevouts?.has(prevoutKey(i.txid, i.vout)))
      ? tx.inputs.reduce((s, i) => s + (prevouts?.get(prevoutKey(i.txid, i.vout))?.value ?? 0n), 0n)
      : undefined
  const outTotal = tx.outputs.reduce((s, o) => s + o.value, 0n)

  return (
    <AmountDensity value="table">
      <div className="rx-io">
        <Card
          layer="core"
          title={t`${formatInt(inCount)} inputs`}
          padding="flush"
          actions={inTotal === undefined ? null : <Amount value={inTotal} kind="duffs" />}
        >
          <table className="rx-table rx-table--cards">
            <caption className="dh-sr">{t`Inputs`}</caption>
            <thead>
              <tr>
                <th>#</th>
                <th>{t`From`}</th>
                <th className="r">{t`Amount`}</th>
                <th>{t`Spends`}</th>
              </tr>
            </thead>
            <tbody>
              {tx.inputs.slice(0, inLimit).map((input, n) => {
                const prev = prevouts?.get(prevoutKey(input.txid, input.vout))
                return (
                  <tr key={n} id={`in-${n}`} data-anchor={anchor.in === n ? 'on' : undefined}>
                    <td className="rx-dim rx-num u">#{n}</td>
                    <td className="t">
                      {coinbase ? (
                        t`Newly generated coins`
                      ) : prev?.address ? (
                        <Entity kind="address" id={prev.address} />
                      ) : prev ? (
                        <span className="rx-dim">{t`No address`}</span>
                      ) : (
                        <span className="rx-dim">{t`Not loaded`}</span>
                      )}
                    </td>
                    <td className="r e">
                      {prev ? <Amount value={prev.value} kind="duffs" /> : '—'}
                    </td>
                    <td className="s">
                      {coinbase ? null : (
                        <Link
                          className="rx-sub"
                          to="/tx/$txid"
                          params={{ txid: input.txid }}
                          hash={`out-${input.vout}`}
                          title={t`Output this input spends`}
                        >
                          {short(input.txid)}:{input.vout}
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {inCount > inLimit ? (
            <p className="rx-note" style={{ padding: '10px 14px' }}>
              <button
                type="button"
                className="dh-btn dh-btn--link"
                onClick={() => setShowAllIn(true)}
              >
                {t`Show all ${formatInt(inCount)} inputs`}
              </button>
            </p>
          ) : null}
          {partial && partial.loaded < inCount ? (
            <p className="rx-note" style={{ padding: '10px 14px' }}>
              {t`Amounts are loaded for the first ${formatInt(partial.loaded)} inputs. Each one is a DAPI request.`}{' '}
              <button
                type="button"
                className="dh-btn dh-btn--link"
                disabled={partial.loading}
                onClick={onLoadAll}
              >
                {partial.loading ? t`Loading…` : t`Load all ${formatInt(inCount)} inputs`}
              </button>
            </p>
          ) : null}
        </Card>
        <div className="rx-io__arrow" aria-hidden="true">
          →
        </div>
        <Card
          layer="core"
          title={t`${formatInt(outCount)} outputs`}
          padding="flush"
          actions={<Amount value={outTotal} kind="duffs" />}
        >
          <table className="rx-table rx-table--cards">
            <caption className="dh-sr">{t`Outputs`}</caption>
            <thead>
              <tr>
                <th>#</th>
                <th>{t`To`}</th>
                <th className="r">{t`Amount`}</th>
                <th>{t`State`}</th>
              </tr>
            </thead>
            <tbody>
              {tx.outputs.slice(0, outLimit).map((o, n) => {
                return (
                  <tr key={n} id={`out-${n}`} data-anchor={anchor.out === n ? 'on' : undefined}>
                    <td className="rx-dim rx-num u">#{n}</td>
                    <td className="t">
                      {o.address ? (
                        <Entity kind="address" id={o.address} />
                      ) : (
                        <span className="rx-dim">
                          {o.scriptPubKey.startsWith('6a') ? t`Data (OP_RETURN)` : t`No address`}
                        </span>
                      )}{' '}
                      {o.address && senders.has(o.address) ? (
                        <span className="rx-tag">{t`Change`}</span>
                      ) : null}
                    </td>
                    <td className="r e">
                      <Amount value={o.value} kind="duffs" />
                    </td>
                    <td className="s">
                      <SpendState spend={spends[n]} index={n} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {outCount > outLimit ? (
            <p className="rx-note" style={{ padding: '10px 14px' }}>
              <button
                type="button"
                className="dh-btn dh-btn--link"
                onClick={() => setShowAllOut(true)}
              >
                {t`Show all ${formatInt(outCount)} outputs`}
              </button>
            </p>
          ) : null}
        </Card>
      </div>
    </AmountDensity>
  )
}
