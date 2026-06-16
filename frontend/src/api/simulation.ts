import client from './client'
import { unwrap } from './client'
import type {
  SimulationAreaGenerateOptions,
  SimulationGenerateOptions,
  SimulationGenerateResult,
  SimulationImportResult,
  SimulationResult,
} from '../types/api'

/** 重新加载 processed 演示数据到 SQLite */
export async function runSimulationRefresh(): Promise<SimulationResult> {
  return unwrap<SimulationResult>(client.post('/simulation/run', null, { timeout: 60000 }))
}

/** 重新生成标准 processed 演示数据，并可刷新 SQLite */
export async function generateSimulationData(options: SimulationGenerateOptions = {}): Promise<SimulationGenerateResult> {
  return unwrap<SimulationGenerateResult>(client.post('/simulation/generate', null, {
    params: options,
    timeout: 60000,
  }))
}

/** 基于地图框选区域重新生成 processed 演示数据，并可刷新 SQLite */
export async function generateAreaSimulationData(options: SimulationAreaGenerateOptions): Promise<SimulationGenerateResult> {
  return unwrap<SimulationGenerateResult>(client.post('/simulation/generate-area', null, {
    params: options,
    timeout: 60000,
  }))
}

/** 将预览生成批次写入 SQLite */
export async function commitSimulationPreview(previewId: string): Promise<SimulationResult> {
  return unwrap<SimulationResult>(client.post('/simulation/commit-preview', null, {
    params: { preview_id: previewId },
    timeout: 60000,
  }))
}

/** 追加导入外部标准 CSV 网络数据 */
export async function importSimulationData(params: {
  networkMetrics: File
  baseStations?: File | null
  sourceName?: string
  batchNote?: string
}): Promise<SimulationImportResult> {
  const form = new FormData()
  form.append('network_metrics', params.networkMetrics)
  if (params.baseStations) {
    form.append('base_stations', params.baseStations)
  }
  form.append('source_name', params.sourceName || 'external_upload')
  form.append('batch_note', params.batchNote || '')
  return unwrap<SimulationImportResult>(client.post('/simulation/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }))
}
