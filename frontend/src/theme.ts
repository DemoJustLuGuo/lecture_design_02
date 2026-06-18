import type { EChartsCoreOption } from 'echarts/core'

type EChartsOption = EChartsCoreOption

/* ── Color Constants ─────────────────────────────────────────── */
export const COLORS = {
  /** Primary – cyan-blue accent */
  primary: '#38bdf8',
  primaryLight: '#7dd3fc',
  primaryDark: '#0c4a6e',

  /** Secondary – teal */
  secondary: '#2dd4bf',
  secondaryLight: '#5eead4',
  secondaryDark: '#134e4a',

  /** Tertiary – indigo-purple */
  tertiary: '#a78bfa',
  tertiaryLight: '#c4b5fd',
  tertiaryDark: '#3b0764',

  /** Error / Critical */
  error: '#fca5a5',
  errorLight: '#fee2e2',
  errorDark: '#7f1d1d',

  /** Warning – amber */
  warning: '#fbbf24',
  warningLight: '#fef3c7',
  warningDark: '#78350f',

  /** Info – sky */
  info: '#7dd3fc',
  infoLight: '#bae6fd',
  infoDark: '#075985',

  /** Success – green */
  success: '#4ade80',
  successLight: '#bbf7d0',
  successDark: '#166534',

  /** Surface backgrounds */
  surface: '#0f172a',
  surfaceDim: '#070b14',
  surfaceBright: '#1e293b',
  surfaceContainer: '#131c2e',
  surfaceContainerHigh: '#1a2338',
  surfaceContainerHighest: '#243044',

  /** On-surface (text) */
  onSurface: '#e2e8f0',
  onSurfaceVariant: '#94a3b8',

  /** Outline */
  outline: '#475569',
  outlineVariant: '#1e293b',

  /** Tooltip background (dark navy) */
  tooltipBg: '#213145',

  /** Chart palette – sequential */
  chartPalette: [
    '#38bdf8', '#2dd4bf', '#a78bfa', '#fbbf24',
    '#fca5a5', '#7dd3fc', '#4ade80', '#c4b5fd',
    '#fb923c', '#f472b6', '#818cf8', '#34d399',
  ],
}

/* ── Font Families ───────────────────────────────────────────── */
export const FONT = {
  sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
  mono: 'JetBrains Mono, ui-monospace, monospace',
}

/* ── Base ECharts Theme Option ───────────────────────────────── */
export const baseEChartsOption: EChartsOption = {
  /* Background matches our surface container */
  backgroundColor: COLORS.surfaceContainer,

  /* Global text defaults */
  textStyle: {
    fontFamily: FONT.sans,
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },

  /* Title */
  title: {
    textStyle: {
      fontFamily: FONT.sans,
      fontSize: 16,
      fontWeight: 600,
      color: COLORS.onSurface,
    },
    subtextStyle: {
      fontFamily: FONT.sans,
      fontSize: 12,
      color: COLORS.onSurfaceVariant,
    },
  },

  /* Legend */
  legend: {
    textStyle: {
      fontFamily: FONT.sans,
      fontSize: 12,
      color: COLORS.onSurfaceVariant,
    },
    icon: 'roundRect',
    itemWidth: 14,
    itemHeight: 8,
    itemGap: 16,
  },

  /* Tooltip – dark navy background, white text */
  tooltip: {
    backgroundColor: COLORS.tooltipBg,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    padding: [10, 14],
    textStyle: {
      fontFamily: FONT.sans,
      fontSize: 13,
      color: '#ffffff',
    },
    extraCssText: 'border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.45);',
  },

  /* Axis labels */
  xAxis: {
    axisLabel: {
      fontFamily: FONT.sans,
      fontSize: 11,
      color: COLORS.onSurfaceVariant,
      margin: 12,
    },
    axisLine: {
      lineStyle: {
        color: COLORS.outlineVariant,
      },
    },
    axisTick: {
      lineStyle: {
        color: COLORS.outlineVariant,
      },
    },
    splitLine: {
      lineStyle: {
        color: COLORS.outlineVariant,
        type: 'dashed' as const,
        opacity: 0.15,
      },
    },
    nameTextStyle: {
      fontFamily: FONT.sans,
      fontSize: 12,
      color: COLORS.onSurfaceVariant,
    },
  },

  yAxis: {
    axisLabel: {
      fontFamily: FONT.sans,
      fontSize: 11,
      color: COLORS.onSurfaceVariant,
      margin: 12,
    },
    axisLine: {
      lineStyle: {
        color: COLORS.outlineVariant,
      },
    },
    axisTick: {
      lineStyle: {
        color: COLORS.outlineVariant,
      },
    },
    splitLine: {
      lineStyle: {
        color: COLORS.outlineVariant,
        type: 'dashed' as const,
        opacity: 0.15,
      },
    },
    nameTextStyle: {
      fontFamily: FONT.sans,
      fontSize: 12,
      color: COLORS.onSurfaceVariant,
    },
  },

  /* Series defaults */
  series: {
    symbolSize: 6,
    itemStyle: {
      borderWidth: 0,
      borderRadius: 3,
    },
    lineStyle: {
      width: 2,
    },
    areaStyle: {
      opacity: 0.12,
    },
  },

  /* Color palette */
  color: COLORS.chartPalette,

  /* Grid – standard padding */
  grid: {
    containLabel: true,
    left: 16,
    right: 16,
    top: 32,
    bottom: 24,
  },

  /* Animation */
  animationDuration: 600,
  animationEasing: 'cubicOut',
}

/**
 * Merge a component-specific option into the base theme.
 * Deep-merges axis, tooltip, and title; replaces series / data.
 */
export function mergeOption(componentOption: EChartsOption): EChartsOption {
  const asRecord = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
  }

  const mergeAxis = (baseAxis: unknown, componentAxis: unknown) => {
    if (Array.isArray(componentAxis)) return componentAxis
    return {
      ...asRecord(baseAxis),
      ...asRecord(componentAxis),
    }
  }

  const baseTooltip = asRecord(baseEChartsOption.tooltip)
  const componentTooltip = asRecord(componentOption.tooltip)

  return {
    ...baseEChartsOption,
    ...componentOption,
    tooltip: {
      ...baseTooltip,
      ...componentTooltip,
      textStyle: {
        ...asRecord(baseTooltip.textStyle),
        ...asRecord(componentTooltip.textStyle),
      },
    },
    xAxis: mergeAxis(baseEChartsOption.xAxis, componentOption.xAxis),
    yAxis: mergeAxis(baseEChartsOption.yAxis, componentOption.yAxis),
  }
}
