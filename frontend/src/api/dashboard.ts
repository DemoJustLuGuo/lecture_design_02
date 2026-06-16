import client from './client'
import { unwrap } from './client'
import type { DashboardSummary, FaultTrendResponse } from '../types/api'

/** 获取监控总览数据 */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return unwrap<DashboardSummary>(client.get('/dashboard/summary'))
}

/** 获取故障数量真实趋势 */
export async function fetchFaultTrend(days: number = 7): Promise<FaultTrendResponse> {
  return unwrap<FaultTrendResponse>(client.get('/dashboard/fault-trend', { params: { days } }))
}
