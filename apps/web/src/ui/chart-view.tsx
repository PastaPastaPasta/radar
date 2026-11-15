import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import { useEffect, useRef } from 'react'
import { withDistinctCompactAxes } from './chart-axis'
import {
  radarChartTheme,
  readChartTokens,
  seriesColors,
  withChartMotion,
  withEdgeRoom,
} from './chart-theme'
import { useReducedMotion, useThemeSignal } from './hooks'
import { withSeriesColors, withTokenColors } from './series'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
])

/** The option as the canvas takes it: tokens resolved where the chart stands, palette slots given, room at the edges. */
function drawn(
  option: EChartsOption,
  still: boolean,
  el: Element | null,
  slots: readonly string[],
): EChartsOption {
  const read = (name: string) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : '')
  return withChartMotion(
    withDistinctCompactAxes(withEdgeRoom(withSeriesColors(withTokenColors(option, read), slots))),
    still,
  )
}

export default function ChartView({ option, group }: { option: EChartsOption; group?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const optionRef = useRef(option)
  const reduced = useReducedMotion()
  const reducedRef = useRef(reduced)
  const theme = useThemeSignal()
  const slotsRef = useRef<string[]>([])

  useEffect(() => {
    optionRef.current = option
    reducedRef.current = reduced
    chartRef.current?.setOption(drawn(option, reduced, ref.current, slotsRef.current), true)
  }, [option, reduced])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const tokens = readChartTokens(el)
    slotsRef.current = seriesColors(tokens)
    echarts.registerTheme('radar', radarChartTheme(tokens))
    const chart = echarts.init(el, 'radar', { renderer: 'canvas' })
    chartRef.current = chart
    chart.setOption(drawn(optionRef.current, reducedRef.current, el, slotsRef.current))
    if (group) {
      chart.group = group
      echarts.connect(group)
    }
    const resize = new ResizeObserver(() => {
      chart.resize()
    })
    resize.observe(el)
    return () => {
      resize.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [group, theme])

  return <div ref={ref} className="rx-chart__view" />
}
