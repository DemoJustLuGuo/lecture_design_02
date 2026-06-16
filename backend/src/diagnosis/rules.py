from __future__ import annotations

import re
from typing import Any


LOW_CONFIDENCE_THRESHOLD = 0.8

KPI_LABELS = {
    "rsrp": "RSRP参考信号接收功率",
    "sinr": "SINR信干噪比",
    "snr": "SNR信噪比",
    "ber": "BER误码率",
    "bler": "BLER误块率",
    "dl_bler": "下行BLER误块率",
    "ul_bler": "上行BLER误块率",
    "bler_dl": "下行BLER误块率",
    "bler_ul": "上行BLER误块率",
    "ul_mcs": "上行MCS调制编码阶数",
    "dl_mcs": "下行MCS调制编码阶数",
    "mcs": "MCS调制编码阶数",
    "tx_bytes": "发送字节数",
    "rx_bytes": "接收字节数",
    "traffic_bytes": "业务流量",
    "packet_count": "分组数量",
    "bandwidth_usage": "PRB资源利用率",
    "prb_utilization_dl": "下行PRB利用率",
    "prb_utilization_ul": "上行PRB利用率",
    "rb_num": "调度RB数量",
    "throughput_mbps": "吞吐量",
}

ACTION_TEXT = dict[str, str]

FAULT_RULES: dict[str, dict[str, Any]] = {
    "信号中断/覆盖退化": {
        "root_cause": "覆盖质量下降或链路中断，常见原因包括基站发射功率异常、天馈方向/下倾角不合理、远端弱覆盖或切换边界设置不当。",
        "key_symptoms": [
            "RSRP持续偏低或突然下降",
            "吞吐量明显下降，严重时接近中断",
            "终端在小区边缘或高速移动场景下体验波动",
        ],
        "actions": [
            {"title": "复核覆盖参数", "description": "检查服务小区方位角、下倾角、发射功率和覆盖边界，确认是否存在弱覆盖或越区覆盖。"},
            {"title": "核查站点状态", "description": "确认基站供电、射频通道、天馈连接和小区可用状态，排除硬件或链路中断。"},
            {"title": "优化移动性配置", "description": "结合邻区关系和切换统计，调整切换门限、迟滞和定时器，保证覆盖连续性。"},
        ],
        "affected_scope": "主要影响故障基站覆盖边缘、远端弱覆盖区域及高速移动用户，表现为掉线、吞吐下降或业务不可用。",
        "default_review_required": False,
        "review_reason": "覆盖类故障需要结合工参、路测轨迹和现场告警确认覆盖边界。",
    },
    "误码过高": {
        "root_cause": "无线链路质量劣化，可能由射频滤波器、天馈链路、干扰或信号质量不足导致，最终表现为BER/BLER升高和重传增加。",
        "key_symptoms": [
            "BER或BLER明显升高",
            "SINR下降，MCS调制编码阶数降低",
            "吞吐量下降，业务包重传增加",
        ],
        "actions": [
            {"title": "核查射频链路", "description": "检查射频模块、滤波器、馈线和天线驻波告警，确认是否存在硬件退化。"},
            {"title": "排查无线干扰", "description": "结合频谱扫描和邻区配置，判断是否存在同频干扰、外部干扰或PCI冲突。"},
            {"title": "验证恢复效果", "description": "处理后持续观察BER、BLER、SINR和吞吐量，确认误码率恢复到正常范围。"},
        ],
        "affected_scope": "主要影响该小区内无线链路质量较差的用户，可能出现网页加载慢、视频卡顿和业务重传。",
        "default_review_required": False,
        "review_reason": "误码类故障需要确认是硬件退化、干扰还是覆盖不足造成。",
    },
    "带宽不足": {
        "root_cause": "无线资源或传输资源不足，业务流量超过当前小区调度能力，导致PRB利用率升高、RB调度不足、时延和丢包风险增加。",
        "key_symptoms": [
            "PRB利用率持续高位运行",
            "调度RB不足或上行缓冲积压",
            "吞吐量下降，忙时业务体验变差",
        ],
        "actions": [
            {"title": "确认忙时负荷", "description": "按时间段查看PRB利用率、吞吐量和用户数，判断是否为高峰流量导致的容量瓶颈。"},
            {"title": "优化资源调度", "description": "调整调度策略、保障关键业务优先级，并检查是否存在资源分配异常。"},
            {"title": "评估扩容或负载均衡", "description": "对长期高负荷小区评估载波扩容、邻区分流或参数优化，降低热点小区压力。"},
        ],
        "affected_scope": "主要影响热点小区和忙时用户，表现为吞吐下降、排队时延增加和业务响应变慢。",
        "default_review_required": False,
        "review_reason": "容量类问题需要结合忙时统计和用户分布判断是否需要扩容。",
    },
    "基站故障": {
        "root_cause": "基站侧硬件、天馈、射频通道或移动性算法异常，可能导致覆盖质量、切换稳定性和业务承载能力同时下降。",
        "key_symptoms": [
            "关联基站下多个指标同时异常",
            "RSRP/SINR下降，BLER或BER升高",
            "频繁切换、掉线或吞吐量大幅波动",
        ],
        "actions": [
            {"title": "检查设备告警", "description": "优先查看基站供电、温度、射频通道、天馈和传输链路告警。"},
            {"title": "隔离故障单元", "description": "结合小区级指标和邻区表现，判断是否为单小区、单扇区或整站异常。"},
            {"title": "执行现场处理", "description": "必要时安排现场复位、替换故障模块或调整切换算法参数，并观察恢复曲线。"},
        ],
        "affected_scope": "可能影响该基站覆盖范围内的多个小区或扇区，严重时会造成大面积弱覆盖和业务中断。",
        "default_review_required": True,
        "review_reason": "基站故障通常涉及硬件或站点配置，需要运维人员结合设备告警复核。",
    },
    "信道干扰": {
        "root_cause": "无线信道受到同频邻区重叠覆盖、PCI冲突、外部干扰源或高速移动多普勒效应影响，导致信号质量和吞吐稳定性下降。",
        "key_symptoms": [
            "SINR或上行SNR明显下降",
            "BER/BLER升高，MCS降低",
            "TX/RX字节数或吞吐量下降，PRB利用率异常抬升",
        ],
        "actions": [
            {"title": "定位干扰来源", "description": "结合故障坐标、邻区关系和频谱扫描，确认外部干扰、同频重叠覆盖或PCI冲突。"},
            {"title": "优化频点和PCI", "description": "调整频点、PCI规划、发射功率和覆盖边界，降低同频小区之间的干扰。"},
            {"title": "验证链路质量", "description": "处理后观察SINR、BER/BLER、MCS和吞吐量是否恢复，必要时保留人工复核记录。"},
        ],
        "affected_scope": "主要影响故障小区及同频邻区重叠覆盖区域，用户会感知吞吐下降、重传增加和业务波动。",
        "default_review_required": True,
        "review_reason": "干扰类故障需要结合频谱、邻区和现场环境确认，建议人工复核后处理。",
    },
    "未分类异常": {
        "root_cause": "异常检测模型发现通信指标偏离正常基线，但当前结果尚未完成明确故障分类，需要结合关键KPI进一步判断根因。",
        "key_symptoms": [
            "一个或多个关键通信指标偏离正常范围",
            "模型仅确认异常，尚未输出稳定故障类型",
            "可能涉及覆盖、干扰、容量或站点侧问题",
        ],
        "actions": [
            {"title": "复核关键指标", "description": "重点查看RSRP、SINR、BER/BLER、PRB利用率、RB调度和吞吐量的异常方向。"},
            {"title": "补充分类诊断", "description": "执行故障分类或人工判读，将异常归入覆盖、误码、带宽、基站或干扰类型。"},
            {"title": "临时监控观察", "description": "在未明确根因前维持告警监控，避免直接执行影响范围较大的参数调整。"},
        ],
        "affected_scope": "影响范围取决于异常指标和关联基站，当前需要结合实时指标和现场告警继续确认。",
        "default_review_required": True,
        "review_reason": "该记录只有异常检测结果，尚未完成故障分类，必须人工复核。",
    },
}


def is_chinese_text(value: Any) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", str(value or "")))


def rule_for_fault_type(fault_type_cn: str | None) -> dict[str, Any]:
    fault_type = fault_type_cn or "未分类异常"
    if fault_type in FAULT_RULES:
        return FAULT_RULES[fault_type]
    if "覆盖" in fault_type or "信号" in fault_type:
        return FAULT_RULES["信号中断/覆盖退化"]
    if "误码" in fault_type:
        return FAULT_RULES["误码过高"]
    if "带宽" in fault_type or "容量" in fault_type or "拥塞" in fault_type:
        return FAULT_RULES["带宽不足"]
    if "基站" in fault_type or "天线" in fault_type or "切换" in fault_type:
        return FAULT_RULES["基站故障"]
    if "干扰" in fault_type or "信道" in fault_type or "PCI" in fault_type:
        return FAULT_RULES["信道干扰"]
    return FAULT_RULES["未分类异常"]


def action_text(actions: list[dict[str, str]]) -> str:
    return "\n".join(f"{index}. {item['title']}：{item['description']}" for index, item in enumerate(actions, start=1))


def diagnosis_template_for_fault_type(fault_type_cn: str | None) -> dict[str, Any]:
    rule = rule_for_fault_type(fault_type_cn)
    return {
        "root_cause": rule["root_cause"],
        "suggested_actions": action_text(rule["actions"]),
        "affected_scope": rule["affected_scope"],
        "review_required": 1 if rule["default_review_required"] else 0,
    }


def split_affected_kpis(raw_value: Any) -> list[str]:
    raw = str(raw_value or "")
    return [item.strip() for item in re.split(r"[;,\s，、]+", raw) if item.strip()]


def kpi_label(kpi: str) -> str:
    normalized = kpi.strip().lower()
    return KPI_LABELS.get(normalized, kpi.strip())


def _confidence_percent(confidence: Any) -> float | None:
    try:
        value = float(confidence)
    except (TypeError, ValueError):
        return None
    return value * 100 if value <= 1 else value


def _review_reason(fault: dict[str, Any], diagnosis: dict[str, Any], rule: dict[str, Any]) -> tuple[bool, str]:
    fault_type = fault.get("fault_type_cn")
    confidence = _confidence_percent(fault.get("confidence"))
    if fault_type == "未分类异常":
        return True, "该记录只有异常检测结果，尚未完成故障分类，必须人工复核。"
    if confidence is not None and confidence < LOW_CONFIDENCE_THRESHOLD * 100:
        return True, "模型置信度低于80%，建议结合现场告警和关键KPI人工确认。"
    if str(fault.get("fault_level") or "") == "严重":
        return True, "故障等级为严重，建议运维人员确认影响范围和处置窗口。"
    if int(diagnosis.get("review_required") or 0) == 1 or rule["default_review_required"]:
        return True, rule["review_reason"]
    return False, "当前规则判断可按建议流程处理，处理后继续观察关键指标恢复情况。"


def build_diagnosis_display(fault: dict[str, Any], diagnosis: dict[str, Any]) -> dict[str, Any]:
    fault_type = fault.get("fault_type_cn") or diagnosis.get("fault_type_cn") or "未分类异常"
    rule = rule_for_fault_type(fault_type)
    raw_root_cause = diagnosis.get("root_cause")
    root_cause = raw_root_cause if is_chinese_text(raw_root_cause) else rule["root_cause"]
    affected_scope = diagnosis.get("affected_scope") if is_chinese_text(diagnosis.get("affected_scope")) else rule["affected_scope"]

    kpis = split_affected_kpis(fault.get("affected_kpis"))
    evidence = [f"受影响指标：{', '.join(kpi_label(item) for item in kpis)}"] if kpis else []
    if fault.get("station_id"):
        evidence.append(f"关联基站：{fault['station_id']}")
    confidence = _confidence_percent(fault.get("confidence"))
    if confidence is not None:
        evidence.append(f"模型置信度：{confidence:.1f}%")
    if fault.get("localization_error_m") is not None:
        evidence.append(f"定位误差约 {float(fault['localization_error_m']):.1f} m")

    review_required, review_reason = _review_reason(fault, diagnosis, rule)
    source_label = "AI在线诊断" if str(fault.get("fault_id") or "").startswith("AI_") else "历史样本诊断"

    return {
        "fault_type": fault_type,
        "source_label": source_label,
        "root_cause": root_cause,
        "key_symptoms": list(rule["key_symptoms"]),
        "suggested_actions": list(rule["actions"]),
        "affected_scope": affected_scope,
        "evidence": evidence,
        "review_required": review_required,
        "review_reason": review_reason,
    }
