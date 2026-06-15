import client from './client'
import { unwrap } from './client'
import type { DashboardSummary } from '../types/api'

/** 获取监控总览数据 */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return unwrap<DashboardSummary>(client.get('/dashboard/summary'))
}
