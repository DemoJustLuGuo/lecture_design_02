/** ── Fault Level ─────────────────────────────────────────── */
export const FaultLevel = {
  Critical: 'critical',
  Warning: 'warning',
  Info: 'info',
} as const
export type FaultLevel = (typeof FaultLevel)[keyof typeof FaultLevel]

/** ── Station Status ─────────────────────────────────────── */
export const StationStatus = {
  Normal: 'normal',
  Warning: 'warning',
  Severe: 'severe',
  Offline: 'offline',
} as const
export type StationStatus = (typeof StationStatus)[keyof typeof StationStatus]

/** ── Fault Type ─────────────────────────────────────────── */
export const FaultType = {
  SignalInterrupt: 'signal_interrupt',
  BerHigh: 'ber_high',
  BandwidthLow: 'bandwidth_low',
  StationFault: 'station_fault',
  ChannelInterference: 'channel_interference',
} as const
export type FaultType = (typeof FaultType)[keyof typeof FaultType]

/** ── Helper: display labels ─────────────────────────────── */
export const FaultLevelLabel: Record<FaultLevel, string> = {
  [FaultLevel.Critical]: '严重',
  [FaultLevel.Warning]: '警告',
  [FaultLevel.Info]: '信息',
}

export const StationStatusLabel: Record<StationStatus, string> = {
  [StationStatus.Normal]: '正常',
  [StationStatus.Warning]: '警告',
  [StationStatus.Severe]: '严重',
  [StationStatus.Offline]: '离线',
}

export const FaultTypeLabel: Record<FaultType, string> = {
  [FaultType.SignalInterrupt]: '信号中断',
  [FaultType.BerHigh]: '误码率过高',
  [FaultType.BandwidthLow]: '带宽不足',
  [FaultType.StationFault]: '基站故障',
  [FaultType.ChannelInterference]: '信道干扰',
}
