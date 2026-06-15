import client from './client'
import { unwrap } from './client'
import type { DiagnosisRecord } from '../types/api'

/** 获取指定故障的诊断建议 */
export async function fetchDiagnosis(faultId: string): Promise<DiagnosisRecord> {
  return unwrap<DiagnosisRecord>(client.get(`/diagnosis/${encodeURIComponent(faultId)}`))
}
