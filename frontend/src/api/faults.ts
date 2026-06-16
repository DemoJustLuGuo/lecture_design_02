import client from './client'
import { unwrap } from './client'
import type { FaultLog, FaultFilters, DetectResult, ClassifyResult, InferenceRequestOptions, FaultProcessStatus } from '../types/api'

/** 获取故障日志列表（支持分页与筛选） */
export async function fetchFaults(
  limit: number = 200,
  offset: number = 0,
  filters?: FaultFilters,
): Promise<FaultLog[]> {
  const params: Record<string, unknown> = { limit, offset }
  if (filters?.fault_type) params.fault_type = filters.fault_type
  if (filters?.fault_level) params.fault_level = filters.fault_level
  if (filters?.status) params.status = filters.status
  if (filters?.source) params.source = filters.source
  return unwrap<FaultLog[]>(client.get('/faults', { params }))
}

/** 获取单个故障详情 */
export async function fetchFaultDetail(id: string): Promise<FaultLog> {
  return unwrap<FaultLog>(client.get(`/faults/${id}`))
}

/** 执行异常检测 */
export async function detectFaults(options: InferenceRequestOptions = {}): Promise<DetectResult> {
  return unwrap<DetectResult>(client.post('/faults/detect', null, { params: options }))
}

/** 执行故障分类 */
export async function classifyFaults(options: InferenceRequestOptions = {}): Promise<ClassifyResult> {
  return unwrap<ClassifyResult>(client.post('/faults/classify', null, { params: options }))
}

/** 更新故障处理状态 */
export async function updateFaultStatus(id: string, status: FaultProcessStatus): Promise<FaultLog> {
  return unwrap<FaultLog>(client.patch(`/faults/${id}/status`, { status }))
}
