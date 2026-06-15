import client from './client'
import { unwrap } from './client'
import type { FaultLog, FaultFilters, DetectResult, ClassifyResult } from '../types/api'

/** 获取故障日志列表（支持分页与筛选） */
export async function fetchFaults(
  limit: number = 200,
  offset: number = 0,
  filters?: FaultFilters,
): Promise<FaultLog[]> {
  const params: Record<string, unknown> = { limit, offset }
  if (filters?.fault_type) params.fault_type = filters.fault_type
  if (filters?.fault_level) params.fault_level = filters.fault_level
  return unwrap<FaultLog[]>(client.get('/faults', { params }))
}

/** 获取单个故障详情 */
export async function fetchFaultDetail(id: string): Promise<FaultLog> {
  return unwrap<FaultLog>(client.get(`/faults/${id}`))
}

/** 执行异常检测 */
export async function detectFaults(): Promise<DetectResult> {
  return unwrap<DetectResult>(client.post('/faults/detect'))
}

/** 执行故障分类 */
export async function classifyFaults(): Promise<ClassifyResult> {
  return unwrap<ClassifyResult>(client.post('/faults/classify'))
}
