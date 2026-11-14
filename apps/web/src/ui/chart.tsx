import { t } from '@lingui/core/macro'
import type { EChartsOption } from 'echarts'
import { useId, useState } from 'react'
import { deferred } from './deferred'
import { Skeleton } from './states'

export interface ChartProps {
  option: EChartsOption
  height: number
  label: string
  table: { columns: string[]; rows: (string | number)[][] }
  group?: string
  loading?: boolean
}

const ChartView = deferred<{ option: EChartsOption; group?: string; height: number }>(
  () => import('./chart-view').then((m) => m.default),
  ({ height }) => <Skeleton shape="chart" height={height} />,
)

export function Chart({ option, height, label, table, group, loading }: ChartProps) {
  const [shown, setShown] = useState(false)
  const tableId = useId()
  return (
    <figure className="rx-chart" data-chart-group={group}>
      <div className="rx-chart__canvas" role="img" aria-label={label} style={{ height }}>
        {loading ? (
          <Skeleton shape="chart" height={height} />
        ) : (
          <ChartView option={option} group={group} height={height} />
        )}
      </div>
      <figcaption className="rx-chart__cap">
        <button
          type="button"
          className="dh-btn dh-btn--link dh-btn--sm"
          aria-expanded={shown}
          aria-controls={tableId}
          onClick={() => {
            setShown((s) => !s)
          }}
        >
          {shown ? t`Hide table` : t`Show as a table`}
        </button>
      </figcaption>
      {/* A scroll box a keyboard can reach: the table scrolls sideways when it is wider than the card. */}
      <div
        id={tableId}
        className={shown ? 'rx-chart__table' : 'dh-sr'}
        role={shown ? 'region' : undefined}
        aria-label={shown ? label : undefined}
        tabIndex={shown ? 0 : undefined}
      >
        <table className="dh-table dh-table--compact">
          <caption className="dh-sr">{label}</caption>
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={j}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
