import type { EChartsOption } from 'echarts'
import type { RadarHistory } from '@/data/radar/schemas'
import { formatInt, formatPercent } from '@/lib/format'
import { dayMonth } from './census-format'

export interface Slice {
  name: string
  value: number
  color: string
}

/** A donut of the slices; the rows beside it carry the numbers. */
export function donutOption(slices: readonly Slice[], surface: string): EChartsOption {
  const sum = slices.reduce((a, s) => a + s.value, 0)
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const item = p as unknown as { name: string; value: number }
        return `${item.name}: ${formatInt(item.value)} (${formatPercent(sum > 0 ? item.value / sum : 0, 1)})`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['62%', '92%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: surface, borderWidth: 2 },
        data: slices.map((s) => ({
          name: s.name,
          value: s.value,
          itemStyle: { color: s.color },
        })),
      },
    ],
  }
}

export interface Series {
  key: string
  name: string
  color: string
  values: (number | null)[]
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
    xAxis: { type: 'time', axisLabel: { formatter: (v: number) => dayMonth(v) } },
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
    xAxis: { type: 'time', axisLabel: { formatter: (v: number) => dayMonth(v) } },
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
