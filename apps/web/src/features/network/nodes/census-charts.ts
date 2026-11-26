import type { EChartsOption } from 'echarts'
import type { RadarHistory } from '@/data/radar/schemas'
import { formatInt, formatPercent } from '@/lib/format'
import { dayMonth } from './census-format'

export interface Series {
  key: string
  name: string
  color: string
  values: (number | null)[]
}

const MONTH_MS = 31 * 24 * 3600 * 1000

/**
 * A dated x-axis with four to six labels, so a phone's narrow chart doesn't run the dates together. ECharts steps from
 * four days straight to a week, so a month-long range asks for the week.
 */
function timeAxis(t: readonly number[]): EChartsOption['xAxis'] {
  const span = t.length > 1 ? t[t.length - 1]! - t[0]! : 0
  return {
    type: 'time',
    minInterval: span <= MONTH_MS ? span / 3.5 : span / 5,
    axisLabel: { formatter: (v: number) => dayMonth(v), hideOverlap: true },
  }
}

/** The version history as stacked shares of each point, which together read as 100 %. */
export function stackedShareOption(
  doc: Pick<RadarHistory, 't'>,
  series: readonly Series[],
): EChartsOption {
  const totals = doc.t.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0))
  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => `${formatPercent(Number(v) / 100, 1)}`,
    },
    grid: { left: 8, right: 12, top: 12, bottom: 24, containLabel: true },
    xAxis: timeAxis(doc.t),
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: (v: number) => `${String(v)}%` },
    },
    series: series.map((s) => ({
      type: 'line',
      name: s.name,
      stack: 'share',
      smooth: false,
      symbol: 'none',
      lineStyle: { width: 0 },
      areaStyle: { color: s.color, opacity: 0.92 },
      itemStyle: { color: s.color },
      emphasis: { disabled: true },
      data: doc.t.map((ms, i) => [
        ms,
        totals[i]! > 0 ? ((s.values[i] ?? 0) / totals[i]!) * 100 : 0,
      ]),
    })),
  }
}

/** The three counts sit close together and far from zero: the axis follows them instead of starting at zero. */
export function sizeOption(
  doc: Pick<RadarHistory, 't'>,
  series: readonly Series[],
  cursor: number | undefined,
  cursorColor: string,
): EChartsOption {
  const stepped = cursor === undefined ? undefined : series[0]
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => formatInt(Math.round(Number(v))) },
    grid: { left: 8, right: 12, top: 12, bottom: 24, containLabel: true },
    xAxis: timeAxis(doc.t),
    yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => formatInt(v) } },
    series: [
      ...series.map((s) => ({
        type: 'line' as const,
        name: s.name,
        symbol: 'none',
        areaStyle: { opacity: 0 },
        lineStyle: { width: 2, color: s.color },
        itemStyle: { color: s.color },
        data: doc.t.map((ms, i) => [ms, s.values[i] ?? null]),
      })),
      ...(stepped && cursor !== undefined
        ? [
            {
              type: 'line' as const,
              name: stepped.name,
              silent: true,
              tooltip: { show: false },
              symbol: 'circle',
              symbolSize: 11,
              lineStyle: { width: 0 },
              itemStyle: { color: cursorColor, borderColor: '#fff', borderWidth: 2 },
              data: doc.t.map((ms, i) =>
                i === cursor ? [ms, stepped.values[i] ?? null] : [ms, null],
              ),
              z: 10,
            },
          ]
        : []),
    ],
  }
}
