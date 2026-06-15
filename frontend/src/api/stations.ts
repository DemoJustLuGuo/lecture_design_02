import client from './client'
import { unwrap } from './client'
import type { Station, StationDetail } from '../types/api'

/** 获取基站列表（支持状态筛选） */
export async function fetchStations(limit: number = 200, status?: string): Promise<Station[]> {
  const params: Record<string, unknown> = { limit }
  if (status) params.status = status
  return unwrap<Station[]>(client.get('/stations', { params }))
}

/** 获取单个基站详情（含 recent_metrics） */
export async function fetchStationDetail(id: string): Promise<StationDetail> {
  return unwrap<StationDetail>(client.get(`/stations/${id}`))
}
