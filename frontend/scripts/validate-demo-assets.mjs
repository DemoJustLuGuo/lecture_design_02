import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const networkColumns = [
  'metric_id',
  'source_dataset',
  'scenario_id',
  'timestamp',
  'station_id',
  'cell_id',
  'longitude',
  'latitude',
  'rsrp',
  'sinr',
  'ber',
  'bler_dl',
  'bler_ul',
  'bandwidth_usage',
  'rb_num',
  'throughput_mbps',
  'traffic_bytes',
  'packet_count',
  'mcs',
  'fault_type_raw',
  'fault_type_cn',
  'is_fault',
]

const baseStationColumns = [
  'station_id',
  'source_dataset',
  'gnodeb_id',
  'cell_id',
  'pci',
  'longitude',
  'latitude',
  'height',
  'azimuth',
  'downtilt',
  'tx_power',
  'status',
]

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function parseCsv(relativePath) {
  const lines = read(relativePath)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
  assert(lines.length >= 2, `${relativePath} should include a header and at least one sample row.`)
  return {
    header: lines[0].split(','),
    rows: lines.slice(1).map((line) => line.split(',')),
  }
}

function assertExactColumns(actual, expected, label) {
  assert(
    actual.join(',') === expected.join(','),
    `${label} columns mismatch.\nExpected: ${expected.join(',')}\nActual:   ${actual.join(',')}`,
  )
}

function assertRequiredValues(rows, header, requiredColumns, label) {
  const indexes = requiredColumns.map((column) => header.indexOf(column))
  for (const column of requiredColumns) {
    assert(header.includes(column), `${label} missing required column ${column}.`)
  }
  rows.forEach((row, rowIndex) => {
    indexes.forEach((index) => {
      assert(row[index]?.trim(), `${label} sample row ${rowIndex + 2} missing ${header[index]}.`)
    })
  })
}

const llmConfig = JSON.parse(read('public/llm-config.example.json'))
for (const key of ['base_url', 'model', 'api_key', 'timeout_seconds']) {
  assert(Object.hasOwn(llmConfig, key), `llm-config.example.json missing ${key}.`)
}
assert(llmConfig.api_key === '', 'llm-config.example.json must not contain a real API key.')

const networkTemplate = parseCsv('public/templates/network_metrics_template.csv')
assertExactColumns(networkTemplate.header, networkColumns, 'network_metrics_template.csv')
assertRequiredValues(networkTemplate.rows, networkTemplate.header, ['metric_id', 'source_dataset', 'scenario_id'], 'network metrics template')

const baseTemplate = parseCsv('public/templates/base_stations_template.csv')
assertExactColumns(baseTemplate.header, baseStationColumns, 'base_stations_template.csv')
assertRequiredValues(baseTemplate.rows, baseTemplate.header, ['station_id', 'source_dataset'], 'base stations template')

const routerSource = read('src/router.tsx')
for (const page of [
  'Dashboard',
  'StationMgmt',
  'StationDetail',
  'FaultLogs',
  'FaultMap',
  'Diagnosis',
  'ModelEval',
  'MobileAlert',
  'Settings',
  'NotFound',
]) {
  assert(routerSource.includes(`lazy(() => import('./pages/${page}'))`), `router.tsx should lazy-load ${page}.`)
}

const viteConfig = read('vite.config.ts')
for (const chunkName of ['vendor-react', 'vendor-router', 'vendor-echarts', 'vendor-leaflet', 'vendor-axios']) {
  assert(viteConfig.includes(chunkName), `vite.config.ts missing ${chunkName} manual chunk.`)
}
assert(viteConfig.includes('chunkSizeWarningLimit: 600'), 'vite.config.ts should document the current chunk warning limit.')

console.log('Demo asset validation passed.')
