import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { DecodedTx, PrevOut } from '@/data/core/types'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, AmountDensity, Card } from '@/ui'
import { isCoinbaseTx, prevoutKey } from './tx-info'

const INITIAL = 10

const short = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`

function anchorIndex(hash: string, prefix: 'in' | 'out'): number | undefined {
  const m = new RegExp(`^#${prefix}-(\\d+)$`).exec(hash)
  return m ? Number(m[1]) : undefined
}

function useAnchor(): { in?: number; out?: number } {
  const [hash, setHash] = useState(() => (typeof location === 'undefined' ? '' : location.hash))
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return { in: anchorIndex(hash, 'in'), out: anchorIndex(hash, 'out') }
}

/** Scrolls a deep-linked row into view once it is rendered. */
function useScrollToAnchor(ready: boolean) {
  useEffect(() => {
    if (!ready || !location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView?.({ block: 'center' })
  }, [ready])
}

export interface IoState {
  /** Per output: `true` spent, `false` unspent, `undefined` unknown. */
  spent?: (boolean | undefined)[]
}

export function IoTables({
  tx,
  prevouts,
  senders,
  spent,
  partial,
  onLoadAll,
}: {
  tx: DecodedTx
  prevouts: ReadonlyMap<string, PrevOut> | undefined
  senders: Set<string>
  spent: (boolean | null | undefined)[] | undefined
  /** Inputs beyond this index are not loaded; offer to load them. */
  partial?: { loaded: number; loading: boolean }
  onLoadAll?: () => void
}) {
  const { t } = useLingui()
  const anchor = useAnchor()
  const [showAllIn, setShowAllIn] = useState(false)
  const [showAllOut, setShowAllOut] = useState(false)
  const inCount = tx.inputs.length
  const outCount = tx.outputs.length
  const inLimit = showAllIn || (anchor.in ?? -1) >= INITIAL ? inCount : INITIAL
  const outLimit = showAllOut || (anchor.out ?? -1) >= INITIAL ? outCount : INITIAL
  useScrollToAnchor(true)
  const coinbase = isCoinbaseTx(tx)
  const inTotal = tx.inputs.every((i) => prevouts?.has(prevoutKey(i.txid, i.vout)))
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
                const flag = spent?.[n]
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
                      {flag === undefined || flag === null ? (
                        <span className="rx-dim rx-sm">—</span>
                      ) : flag ? (
                        <span className="rx-st rx-st--warn rx-sm">{t`Spent`}</span>
                      ) : (
                        <span className="rx-st rx-st--good rx-sm">{t`Unspent`}</span>
                      )}
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
