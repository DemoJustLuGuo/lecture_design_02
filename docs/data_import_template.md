# 外部 CSV 导入字段模板

更新时间：2026-06-18

## 1. 文档用途

本文档说明设置页“导入标准 CSV”功能需要的字段格式，便于报告中说明系统具备外部数据源替换能力。课程设计阶段导入方式为追加写入 SQLite，不直接替换整个数据库文件。

可下载模板：

| 模板 | 位置 |
| --- | --- |
| 网络指标模板 | `frontend/public/templates/network_metrics_template.csv` |
| 基站工参模板 | `frontend/public/templates/base_stations_template.csv` |

## 2. network_metrics 字段

`network_metrics` 是必选文件。当前必填列为：

```text
metric_id, source_dataset, scenario_id
```

完整字段如下：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `metric_id` | 是 | 文本 | 指标记录唯一标识，重复主键会被跳过 |
| `source_dataset` | 是 | 文本 | 数据来源，例如 `external_demo` |
| `scenario_id` | 是 | 文本 | 场景或批次标识 |
| `timestamp` | 否 | 文本 | 采样时间，建议 ISO 格式 |
| `station_id` | 否 | 文本 | 关联基站 ID |
| `cell_id` | 否 | 文本 | 小区 ID |
| `longitude` | 否 | 数值 | 经度 |
| `latitude` | 否 | 数值 | 纬度 |
| `rsrp` | 否 | 数值 | 参考信号接收功率 |
| `sinr` | 否 | 数值 | 信干噪比 |
| `ber` | 否 | 数值 | 误码率 |
| `bler_dl` | 否 | 数值 | 下行块误码率 |
| `bler_ul` | 否 | 数值 | 上行块误码率 |
| `bandwidth_usage` | 否 | 数值 | 资源或带宽利用率，建议 0 到 1 |
| `rb_num` | 否 | 数值 | 资源块数量 |
| `throughput_mbps` | 否 | 数值 | 吞吐率，单位 Mbps |
| `traffic_bytes` | 否 | 数值 | 流量字节数 |
| `packet_count` | 否 | 数值 | 数据包数量 |
| `mcs` | 否 | 数值 | 调制编码阶数 |
| `fault_type_raw` | 否 | 文本 | 原始故障类型 |
| `fault_type_cn` | 否 | 文本 | 中文故障类型，缺省为 `未知` |
| `is_fault` | 否 | 整数 | 是否故障，`1` 表示故障，缺省为 `0` |

## 3. base_stations 字段

`base_stations` 是可选文件。若上传基站工参文件，当前必填列为：

```text
station_id, source_dataset
```

完整字段如下：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `station_id` | 是 | 文本 | 基站唯一标识 |
| `source_dataset` | 是 | 文本 | 数据来源 |
| `gnodeb_id` | 否 | 文本 | gNodeB 标识 |
| `cell_id` | 否 | 文本 | 小区 ID |
| `pci` | 否 | 文本 | 物理小区标识 |
| `longitude` | 否 | 数值 | 经度 |
| `latitude` | 否 | 数值 | 纬度 |
| `height` | 否 | 数值 | 天线高度 |
| `azimuth` | 否 | 数值 | 方位角 |
| `downtilt` | 否 | 数值 | 下倾角 |
| `tx_power` | 否 | 数值 | 发射功率 |
| `status` | 否 | 文本 | 基站状态，缺省为 `normal` |

## 4. 导入规则

| 规则 | 说明 |
| --- | --- |
| 编码 | 支持 UTF-8 和 UTF-8 BOM |
| 写入方式 | 追加写入 SQLite |
| 重复数据 | 主键重复时跳过，不覆盖旧记录 |
| 数值字段 | 空值会保存为 `null`，非法数值会记录到 `data_import_errors` |
| 错误记录 | 行级错误不会中断整个批次，会统计到导入结果 |
| 报告建议 | 报告中可说明该能力用于课程演示的数据源扩展，真实工程仍需补充权限、审计和更严格校验 |
