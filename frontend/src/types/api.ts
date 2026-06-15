/** ── 后端统一响应结构 ────────────────────────────────────── */
export interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
}

/** ── Dashboard ───────────────────────────────────────────── */
export interface DashboardSummary {
  station_count: number
  fault_count: number
  severe_fault_count: number
  classification_accuracy: number | null
  classification_f1: number | null
  detection_latency_ms: number | null
  fault_type_counts: FaultTypeCount[]
}

export interface FaultTypeCount {
  fault_type_cn: string
  count: number
}

/** ── Base Stations ──────────────────────────────────────── */
export interface Station {
  station_id: string
  source_dataset: string
  gnodeb_id: string | null
  cell_id: string | null
  pci: string | null
  longitude: number | null
  latitude: number | null
  height: number | null
  azimuth: number | null
  downtilt: number | null
  tx_power: number | null
  status: string | null
}

export interface StationDetail extends Station {
  recent_metrics: MetricRecord[]
}

export interface MetricRecord {
  timestamp: string
  rsrp: number | null
  sinr: number | null
  ber: number | null
  bandwidth_usage: number | null
  rb_num: number | null
  throughput_mbps: number | null
  fault_type_cn: string | null
  is_fault: number | null
}

/** ── Realtime Metrics ───────────────────────────────────── */
export interface RealtimeMetric {
  metric_id: string
  source_dataset: string
  scenario_id: string
  timestamp: string | null
  station_id: string | null
  longitude: number | null
  latitude: number | null
  rsrp: number | null
  sinr: number | null
  ber: number | null
  bandwidth_usage: number | null
  rb_num: number | null
  throughput_mbps: number | null
  fault_type_cn: string | null
  is_fault: number | null
}

/** ── Fault Logs ─────────────────────────────────────────── */
export interface FaultLog {
  fault_id: string
  source_dataset: string
  scenario_id: string
  station_id: string | null
  detected_at: string | null
  fault_type_raw: string | null
  fault_type_cn: string | null
  fault_level: string | null
  confidence: number | null
  fault_longitude: number | null
  fault_latitude: number | null
  localization_error_m: number | null
  status: string | null
}

export interface FaultDetail extends FaultLog {
  affected_kpis: string | null
  truth_longitude: number | null
  truth_latitude: number | null
  diagnosis_text: string | null
}

export interface FaultFilters {
  fault_type?: string
  fault_level?: string
}

export interface DetectResult {
  model_available: boolean
  feature_pipeline_path: string
  anomaly_detector_path: string
  anomaly_threshold_path: string
  fault_classifier_path: string
  sample_count: number
  anomaly_count: number
  threshold: number
  latency_ms: number
  labeled_accuracy: number | null
  results: DetectionPrediction[]
}

export interface ClassifyResult {
  model_available: boolean
  feature_pipeline_path: string
  anomaly_detector_path: string
  anomaly_threshold_path: string
  fault_classifier_path: string
  sample_count: number
  latency_ms: number
  labeled_accuracy: number | null
  predicted_type_counts: Record<string, number>
  results: ClassificationPrediction[]
}

export interface InferenceMetricIdentity {
  metric_id: string
  source_dataset: string
  scenario_id: string
  timestamp: string | null
  station_id: string | null
  actual_is_fault: number | null
  actual_fault_type: string | null
  key_metrics: Record<string, number | null>
}

export interface DetectionPrediction extends InferenceMetricIdentity {
  is_anomaly: boolean
  anomaly_score: number
  threshold: number
}

export interface ClassificationPrediction extends InferenceMetricIdentity {
  predicted_fault_type: string
  confidence: number | null
  probabilities: Record<string, number>
}

/** ── Diagnosis ──────────────────────────────────────────── */
export interface DiagnosisRecord {
  diagnosis_id: string | null
  fault_id: string | null
  fault_type_cn: string | null
  root_cause: string | null
  suggested_actions: string | null
  affected_scope: string | null
  review_required: number | null
  created_at: string | null
  fault: FaultDetail
}

/** ── Model Evaluation ──────────────────────────────────── */
export interface ModelEvaluation {
  evaluation_id: string
  model_name: string
  dataset_version: string | null
  accuracy: number | null
  precision: number | null
  recall: number | null
  f1: number | null
  confusion_matrix: ConfusionMatrixData | null
  localization_error_avg_m: number | null
  detection_latency_ms: number | null
  created_at: string | null
}

export interface ConfusionMatrixData {
  labels: string[]
  matrix: number[][]
}

export interface ModelEvaluationResponse {
  evaluations: ModelEvaluation[]
}

/** ── Simulation ────────────────────────────────────────── */
export interface SimulationResult {
  processed_data_available: boolean
  processed_dir: string
  message: string
}
