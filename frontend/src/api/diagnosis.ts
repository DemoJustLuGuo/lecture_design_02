import client from './client'
import { unwrap } from './client'
import type { DiagnosisRecord } from '../types/api'

export interface LlmDiagnosisConfig {
  base_url?: string
  api_key: string
  model?: string
  timeout_seconds?: number
}

/** 获取指定故障的诊断建议 */
export async function fetchDiagnosis(faultId: string, options?: { enhance?: 'llm' }): Promise<DiagnosisRecord> {
  return unwrap<DiagnosisRecord>(
    client.get(`/diagnosis/${encodeURIComponent(faultId)}`, {
      params: options?.enhance ? { enhance: options.enhance } : undefined,
    }),
  )
}

/** 使用前端提供的大模型配置增强诊断 */
export async function enhanceDiagnosis(faultId: string, config: LlmDiagnosisConfig): Promise<DiagnosisRecord> {
  return unwrap<DiagnosisRecord>(client.post(`/diagnosis/${encodeURIComponent(faultId)}/enhance`, config))
}
