import { useLingui } from '@lingui/react/macro'
import { useMemo, useState } from 'react'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { formatAmountText } from '@/lib/units'
import { Amount, useUnits } from '@/ui'
import { FLOW, layoutFlow, limitNodes, type FlowNode } from './tx-info'

function short(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

export function ValueFlow({
  inputs,
  outputs,
  caption,
}: {
  inputs: FlowNode[]
  outputs: FlowNode[]
  caption: string
}) {
  const { t } = useLingui()
  const [table, setTable] = useState(false)
  const ins = useMemo(() => limitNodes(inputs, (n) => t`${n} more inputs`), [inputs, t])
  const outs = useMemo(() => limitNodes(outputs, (n) => t`${n} more outputs`), [outputs, t])
  const layout = useMemo(() => layoutFlow({ inputs: ins, outputs: outs }), [ins, outs])
  const total = outs.reduce((s, n) => s + n.value, 0n)
  const units = useUnits()
  const text = (v: bigint) =>
    formatAmountText(v, 'duffs', {
      unit: units.unit === 'DASH' ? undefined : units.unit,
      testnet: units.testnet,
      density: 'table',
    })
  const height = FLOW.top * 2 + FLOW.area
  return (
    <div>
      <div className="rx-hide-sm">
        <svg
          className="rx-flow"
          viewBox={`0 0 ${FLOW.width} ${height}`}
          role="img"
          aria-label={caption}
        >
          {layout.ribbons.map((r, i) => (
            <path
              key={i}
              className={`rib${r.kind === 'change' ? ' rib--change' : r.kind === 'fee' ? ' rib--fee' : ''}`}
              d={r.d}
            />
          ))}
          {layout.left.map((n) => (
            <g key={`l-${n.key}`}>
              <rect className="node" x={n.x - 8} y={n.y} width={8} height={n.h} rx={2} />
              <text className="v" x={n.x - 18} y={n.y + n.h / 2 + 4} textAnchor="end">
                {text(n.value)}
              </text>
              <text className="m" x={160} y={n.y + n.h / 2 + 4} textAnchor="end">
                {n.label}
              </text>
            </g>
          ))}
          {layout.right.map((n) => (
            <g key={`r-${n.key}`}>
              <rect
                className={`node${n.kind === 'change' ? ' node--change' : n.kind === 'fee' ? ' node--fee' : ''}`}
                x={n.x}
                y={n.y}
                width={8}
                height={n.h}
                rx={2}
              />
              <text className="v" x={n.x + 18} y={n.y + n.h / 2 + 4}>
                {n.kind === 'fee' ? t`${formatInt(n.value)} duffs` : text(n.value)}
              </text>
              <text className="m" x={900} y={n.y + n.h / 2 + 4}>
                {n.kind === 'fee' ? t`Fee` : n.label}
              </text>
              {n.kind === 'change' ? (
                <text className="c" x={1018} y={n.y + n.h / 2 + 4}>
                  {t`· change`}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
      <div className="rx-only-sm rx-flowsm">
        <p className="rx-flowsm__h">
          <span>{t`${formatInt(inputs.length)} inputs`}</span>
          <b>
            <Amount value={total} kind="duffs" />
          </b>
        </p>
        <div className="rx-stack" style={{ height: 22 }} role="img" aria-label={caption}>
          {outs.map((n) => (
            <i
              key={n.key}
              style={{
                flex: Number(n.value) || 1,
                minWidth: 6,
                background:
                  n.kind === 'fee'
                    ? 'var(--dh-warn)'
                    : n.kind === 'change'
                      ? 'var(--dh-line-2)'
                      : 'var(--rx-core)',
              }}
            />
          ))}
        </div>
        <ul className="rx-flowsm__l">
          {outs.map((n) => (
            <li key={n.key}>
              <span
                className="rx-sw"
                style={{
                  ['--c' as string]:
                    n.kind === 'fee'
                      ? 'var(--dh-warn)'
                      : n.kind === 'change'
                        ? 'var(--dh-line-2)'
                        : 'var(--rx-core)',
                }}
              />
              {n.kind === 'out' && n.address ? (
                <Entity kind="address" id={n.address} label={short(n.address)} />
              ) : (
                <span>
                  {n.kind === 'fee' ? t`Fee` : n.kind === 'change' ? t`Change to sender` : n.label}
                </span>
              )}
              <b>{n.kind === 'fee' ? t`${formatInt(n.value)} duffs` : text(n.value)}</b>
            </li>
          ))}
        </ul>
      </div>
      {layout.raised ? (
        <p className="rx-note">{t`Small amounts are drawn at a minimum height.`}</p>
      ) : null}
      <div className="rx-flow__table">
        <button
          type="button"
          className="dh-btn dh-btn--link"
          onClick={() => setTable((v) => !v)}
          aria-expanded={table}
        >
          {table ? t`Hide the table` : t`Show as a table`}
        </button>
        {table ? (
          <table className="rx-table">
            <caption className="dh-sr">{caption}</caption>
            <thead>
              <tr>
                <th>{t`To`}</th>
                <th className="r">{t`Amount`}</th>
              </tr>
            </thead>
            <tbody>
              {outs.map((n) => (
                <tr key={n.key}>
                  <td>
                    {n.kind === 'fee'
                      ? t`Fee`
                      : n.kind === 'change'
                        ? `${n.label} · ${t`change`}`
                        : n.label}
                  </td>
                  <td className="r">{text(n.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  )
}
