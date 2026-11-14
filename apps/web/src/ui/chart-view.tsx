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
import {
  radarChartTheme,
  readChartTokens,
  seriesColors,
  withChartMotion,
  withEdgeRoom,
} from './chart-theme'
import { useReducedMotion, useThemeSignal } from './hooks'
import { withSeriesColors } from './series'

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

export default function ChartView({ option, group }: { option: EChartsOption; group?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const optionRef = useRef(option)
  const reduced = useReducedMotion()
  const reducedRef = useRef(reduced)
  const theme = useThemeSignal()
  const slotsRef = useRef<string[]>([])
  const drawn = (o: EChartsOption, still: boolean) =>
    withChartMotion(withEdgeRoom(withSeriesColors(o, slotsRef.current)), still)

  useEffect(() => {
    optionRef.current = option
    reducedRef.current = reduced
    chartRef.current?.setOption(drawn(option, reduced), true)
     
  }, [option, reduced])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const tokens = readChartTokens(el)
    slotsRef.current = seriesColors(tokens)
    echarts.registerTheme('radar', radarChartTheme(tokens))
    const chart = echarts.init(el, 'radar', { renderer: 'canvas' })
    chartRef.current = chart
    chart.setOption(drawn(optionRef.current, reducedRef.current))
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
