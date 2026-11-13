import type { EChartsOption } from 'echarts'
import { formatPercent } from '@/lib/format'

const tooltip = {
  trigger: 'axis' as const,
  axisPointer: { type: 'shadow' as const },
  valueFormatter: (v: unknown) => formatPercent(Number(v), 2),
}

/**
 * Columns on a desktop. On a phone the six rank-band labels don't fit under the columns, so the bands are rows with
 * their labels beside them and the share at the end of each bar.
 */
export function concentrationOption({
  labels,
  shares,
  name,
  phone,
}: {
  labels: string[]
  shares: number[]
  name: string
  phone: boolean
}): EChartsOption {
  if (phone) {
    return {
      tooltip,
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category',
        inverse: true,
        data: labels,
        axisTick: { show: false },
        axisLabel: { interval: 0 },
      },
      series: [
        {
          type: 'bar',
          name,
          data: shares,
          label: {
            show: true,
            position: 'right',
            formatter: (p) => formatPercent(Number(p.value), 1),
          },
        },
      ],
    }
  }
  return {
    tooltip,
    grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatPercent(v, 0) } },
    series: [{ type: 'bar', name, data: shares }],
  }
}
