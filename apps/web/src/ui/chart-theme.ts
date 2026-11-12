import type { EChartsOption } from 'echarts'

export const CHART_TOKEN_NAMES = [
  'rx-l',
  'dh-ramp-2',
  'dh-ramp-3',
  'dh-ramp-4',
  'dh-ramp-5',
  'dh-ink',
  'dh-ink-2',
  'dh-line',
  'dh-line-2',
  'dh-surface',
  'dh-brand-soft',
] as const

export type ChartTokens = Record<(typeof CHART_TOKEN_NAMES)[number], string>

const FALLBACK: ChartTokens = {
  'rx-l': '#008DE4',
  'dh-ramp-2': '#0080D0',
  'dh-ramp-3': '#39A2E8',
  'dh-ramp-4': '#86C4F0',
  'dh-ramp-5': '#C2E0F7',
  'dh-ink': '#0C1D2B',
  'dh-ink-2': '#4A5D6B',
  'dh-line': '#D3DDE4',
  'dh-line-2': '#7A8B98',
  'dh-surface': '#FFFFFF',
  'dh-brand-soft': '#E0EFFA',
}

/** Resolved token values, read from `el` (inside the plate, pass the plate element so its island values apply). */
export function readChartTokens(el: Element = document.documentElement): ChartTokens {
  const style = getComputedStyle(el)
  const out = { ...FALLBACK }
  for (const name of CHART_TOKEN_NAMES) {
    const v = style.getPropertyValue(`--${name}`).trim()
    if (v) out[name] = v
  }
  return out
}

const axisLabel = (t: ChartTokens) => ({ color: t['dh-ink-2'], fontSize: 13 })

export const radarChartTheme = (t: ChartTokens) => {
  const category = {
    axisLine: { lineStyle: { color: t['dh-line-2'] } },
    axisTick: { show: false },
    axisLabel: { ...axisLabel(t), hideOverlap: true },
    splitLine: { show: false },
  }
  return {
    color: [t['rx-l'], t['dh-ramp-2'], t['dh-ramp-3'], t['dh-ramp-4'], t['dh-ramp-5']],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Archivo, system-ui, sans-serif', fontSize: 12, color: t['dh-ink-2'] },
    grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
    categoryAxis: category,
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisLabel(t),
      splitLine: { lineStyle: { color: t['dh-line'], type: [2, 4] } },
    },
    timeAxis: category,
    line: {
      symbol: 'none',
      lineStyle: { width: 1.75 },
      areaStyle: { opacity: 0.14 },
      emphasis: { focus: 'series' },
    },
    bar: { barMaxWidth: 18, barCategoryGap: '24%', itemStyle: { borderRadius: [2, 2, 0, 0] } },
    pie: { itemStyle: { borderColor: t['dh-surface'], borderWidth: 2 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: t['dh-surface'],
      borderColor: t['dh-line'],
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t['dh-ink'], fontSize: 12.5 },
      extraCssText: 'border-radius:8px;box-shadow:0 8px 24px -8px rgba(0,30,50,.35);',
      axisPointer: { type: 'line', lineStyle: { color: t['dh-ink-2'], width: 1 } },
    },
    legend: { show: false },
    dataZoom: {
      borderColor: t['dh-line'],
      fillerColor: t['dh-brand-soft'],
      handleStyle: { color: t['dh-surface'], borderColor: t['dh-line-2'] },
    },
    animationDuration: 400,
    animationDurationUpdate: 240,
    animationEasing: 'cubicOut',
  }
}

export const CHART_HEIGHT = { card: 200, page: 280 } as const

/** Merge a feature's option with motion that follows the user's preference. */
export function withChartMotion(option: EChartsOption, reducedMotion: boolean): EChartsOption {
  return reducedMotion ? { ...option, animation: false } : option
}

/** Width of one character of a 13 px axis label, rounded up so tabular digits never overshoot. */
const LABEL_CHAR_PX = 7.6

const labelOf = (item: unknown): string =>
  item !== null && typeof item === 'object' && 'value' in item
    ? String(item.value)
    : String(item)

/**
 * ECharts centres the last category label on the grid's right edge but only reserves room for the labels it laid
 * out before it thinned them, so the one that ends up at the edge is cut. Keep half the widest label free.
 */
export function withEdgeRoom(option: EChartsOption): EChartsOption {
  const axis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
  const data: unknown[] | undefined =
    axis && 'data' in axis && Array.isArray(axis.data) ? axis.data : undefined
  const grid = Array.isArray(option.grid) ? undefined : option.grid
  if (!data?.length || !grid) return option
  const widest = Math.max(...data.map((d) => labelOf(d).length))
  const room = Math.ceil((widest * LABEL_CHAR_PX) / 2) + 2
  const right = typeof grid.right === 'number' ? grid.right : 0
  return right >= room ? option : { ...option, grid: { ...grid, right: room } }
}
