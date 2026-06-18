import { useEffect, useRef, type RefObject } from 'react'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
])

/**
 * Custom hook for ECharts initialization, resize handling, and cleanup.
 *
 * @param containerRef - A React ref pointing to the DOM container element.
 * @param optionFactory - A factory function that returns the ECharts option object.
 *                         Reactivity: re-called whenever dependencies change.
 * @returns The current ECharts instance (or null before mount).
 */
export function useECharts(
  containerRef: RefObject<HTMLDivElement | null>,
  optionFactory: () => EChartsCoreOption,
): ECharts | null {
  const chartRef = useRef<ECharts | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let chart = chartRef.current
    if (!chart || chart.isDisposed()) {
      chart = init(container)
      chartRef.current = chart

      let resizeTimer: ReturnType<typeof setTimeout> | null = null
      const handleResize = () => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          chart?.resize()
        }, 120)
      }

      const observer = new ResizeObserver(handleResize)
      observer.observe(container)
      window.addEventListener('resize', handleResize)

      resizeCleanupRef.current = () => {
        window.removeEventListener('resize', handleResize)
        observer.disconnect()
        if (resizeTimer) clearTimeout(resizeTimer)
      }
    }

    chart.setOption(optionFactory(), true)
    requestAnimationFrame(() => chart?.resize())
  })

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.()
      chartRef.current?.dispose()
      resizeCleanupRef.current = null
      chartRef.current = null
    }
  }, [])

  return chartRef.current
}
