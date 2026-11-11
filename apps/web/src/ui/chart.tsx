import { t } from '@lingui/core/macro'
import type { EChartsOption } from 'echarts'
import { lazy, Suspense, useId, useState } from 'react'
import { Skeleton } from './states'

export interface ChartProps {
  option: EChartsOption
  height: number
  label: string
  table: { columns: string[]; rows: (string | number)[][] }
  group?: string
  loading?: boolean
}

const ChartView = lazy(() => import('./chart-view'))

export function Chart({ option, height, label, table, group, loading }: ChartProps) {
  const [shown, setShown] = useState(false)
  const tableId = useId()
  return (
    <figure className="rx-chart" data-chart-group={group}>
      <div className="rx-chart__canvas" role="img" aria-label={label} style={{ height }}>
        {loading ? (
          <Skeleton shape="chart" height={height} />
        ) : (
          <Suspense fallback={<Skeleton shape="chart" height={height} />}>
            <ChartView option={option} group={group} />
          </Suspense>
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
      <div id={tableId} className={shown ? 'rx-chart__table' : 'dh-sr'}>
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
