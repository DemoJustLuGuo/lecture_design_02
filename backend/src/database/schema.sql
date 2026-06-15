DROP TABLE IF EXISTS model_evaluations;
DROP TABLE IF EXISTS diagnosis_records;
DROP TABLE IF EXISTS fault_logs;
DROP TABLE IF EXISTS network_metrics;
DROP TABLE IF EXISTS base_stations;

CREATE TABLE base_stations (
  station_id TEXT PRIMARY KEY,
  source_dataset TEXT NOT NULL,
  gnodeb_id TEXT,
  cell_id TEXT,
  pci TEXT,
  longitude REAL,
  latitude REAL,
  height REAL,
  azimuth REAL,
  downtilt REAL,
  tx_power REAL,
  status TEXT
);

CREATE TABLE network_metrics (
  metric_id TEXT PRIMARY KEY,
  source_dataset TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  timestamp TEXT,
  station_id TEXT,
  cell_id TEXT,
  longitude REAL,
  latitude REAL,
  rsrp REAL,
  sinr REAL,
  ber REAL,
  bler_dl REAL,
  bler_ul REAL,
  bandwidth_usage REAL,
  rb_num REAL,
  throughput_mbps REAL,
  traffic_bytes REAL,
  packet_count REAL,
  mcs REAL,
  fault_type_raw TEXT,
  fault_type_cn TEXT,
  is_fault INTEGER
);

CREATE TABLE fault_logs (
  fault_id TEXT PRIMARY KEY,
  source_dataset TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  station_id TEXT,
  detected_at TEXT,
  fault_type_raw TEXT,
  fault_type_cn TEXT,
  fault_level TEXT,
  confidence REAL,
  affected_kpis TEXT,
  fault_longitude REAL,
  fault_latitude REAL,
  truth_longitude REAL,
  truth_latitude REAL,
  localization_error_m REAL,
  diagnosis_text TEXT,
  status TEXT DEFAULT '未处理'
);

CREATE TABLE diagnosis_records (
  diagnosis_id TEXT PRIMARY KEY,
  fault_id TEXT,
  fault_type_cn TEXT,
  root_cause TEXT,
  suggested_actions TEXT,
  affected_scope TEXT,
  review_required INTEGER,
  created_at TEXT,
  FOREIGN KEY (fault_id) REFERENCES fault_logs(fault_id)
);

CREATE TABLE model_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  dataset_version TEXT,
  accuracy REAL,
  precision REAL,
  recall REAL,
  f1 REAL,
  confusion_matrix TEXT,
  localization_error_avg_m REAL,
  detection_latency_ms REAL,
  created_at TEXT
);

CREATE INDEX idx_network_metrics_station ON network_metrics(station_id);
CREATE INDEX idx_network_metrics_fault ON network_metrics(fault_type_cn, is_fault);
CREATE INDEX idx_fault_logs_type ON fault_logs(fault_type_cn, fault_level);
CREATE INDEX idx_fault_logs_station ON fault_logs(station_id);
