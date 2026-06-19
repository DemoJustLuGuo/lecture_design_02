"""故障定位模块。

提供无线场景下的定位几何工具：经纬度/平面坐标换算、最近基站选取、
加权质心定位、最小二乘三边定位，以及定位误差计算。

数据模拟（``data_sim``）在生成阶段调用这里的几何函数估算故障坐标，
保证「定位算法」与「数据生成/格式化」职责分离。
"""

from __future__ import annotations

import math


def distance_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """两经纬度点之间的大圆距离（米）。"""

    radius = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def lonlat_to_xy(lon: float, lat: float, origin_lon: float, origin_lat: float) -> tuple[float, float]:
    """以 origin 为原点将经纬度近似投影为局部平面坐标（米）。"""

    meters_per_degree_lat = 111_320.0
    meters_per_degree_lon = meters_per_degree_lat * math.cos(math.radians(origin_lat))
    return (
        (lon - origin_lon) * meters_per_degree_lon,
        (lat - origin_lat) * meters_per_degree_lat,
    )


def xy_to_lonlat(x: float, y: float, origin_lon: float, origin_lat: float) -> tuple[float, float]:
    """局部平面坐标（米）还原为经纬度。"""

    meters_per_degree_lat = 111_320.0
    meters_per_degree_lon = meters_per_degree_lat * math.cos(math.radians(origin_lat))
    return (
        origin_lon + x / meters_per_degree_lon,
        origin_lat + y / meters_per_degree_lat,
    )


def nearest_stations(
    stations: list[dict[str, str]],
    longitude: float,
    latitude: float,
    count: int = 3,
) -> list[dict[str, str]]:
    """按到目标点距离升序返回最近的若干基站。"""

    return sorted(
        stations,
        key=lambda station: distance_m(longitude, latitude, float(station["longitude"]), float(station["latitude"])),
    )[:count]


def weighted_centroid_location(
    anchors: list[dict[str, str]],
    distance_estimates: list[float],
) -> tuple[float, float]:
    """加权质心定位：距离越近权重越大。"""

    total_weight = 0.0
    weighted_lon = 0.0
    weighted_lat = 0.0
    for station, distance_est in zip(anchors, distance_estimates):
        weight = 1.0 / max(distance_est, 1.0)
        weighted_lon += float(station["longitude"]) * weight
        weighted_lat += float(station["latitude"]) * weight
        total_weight += weight
    if total_weight == 0:
        return float(anchors[0]["longitude"]), float(anchors[0]["latitude"])
    return weighted_lon / total_weight, weighted_lat / total_weight


def anchor_reliability_weight(
    distance_est: float,
    rsrp: float | None = None,
    sinr: float | None = None,
) -> float:
    """锚点可靠度权重。

    距离估计噪声方差随距离增大（~距离的平方），故基础权重取 1/距离²；
    再按信号质量（RSRP/SINR 越好测距越可信）做温和放大。
    """

    weight = 1.0 / max(distance_est, 1.0) ** 2
    if rsrp is not None:
        weight *= 1.0 + min(1.0, max(0.0, (rsrp + 135.0) / 80.0))
    if sinr is not None:
        weight *= 1.0 + min(1.0, max(0.0, (sinr + 12.0) / 44.0))
    return weight


def weighted_least_squares_trilateration(
    anchors: list[dict[str, str]],
    distance_estimates: list[float],
    weights: list[float],
    fallback_lon: float,
    fallback_lat: float,
) -> tuple[float, float]:
    """加权最小二乘三边定位；锚点不足或退化时回退加权质心。

    以最近锚点为参考点线性化，按各锚点可靠度对法方程加权，降低远距/弱信号
    锚点对解的影响（缓解 GDOP 与测距噪声）。
    """

    if len(anchors) < 3:
        return fallback_lon, fallback_lat

    origin_lon = sum(float(station["longitude"]) for station in anchors) / len(anchors)
    origin_lat = sum(float(station["latitude"]) for station in anchors) / len(anchors)
    points = [
        lonlat_to_xy(float(station["longitude"]), float(station["latitude"]), origin_lon, origin_lat)
        for station in anchors
    ]
    x0, y0 = points[0]
    r0 = distance_estimates[0]
    normal_00 = normal_01 = normal_11 = 0.0
    rhs_0 = rhs_1 = 0.0

    for (xi, yi), ri, wi in zip(points[1:], distance_estimates[1:], weights[1:]):
        ai0 = 2 * (xi - x0)
        ai1 = 2 * (yi - y0)
        bi = xi * xi + yi * yi - ri * ri - x0 * x0 - y0 * y0 + r0 * r0
        normal_00 += wi * ai0 * ai0
        normal_01 += wi * ai0 * ai1
        normal_11 += wi * ai1 * ai1
        rhs_0 += wi * ai0 * bi
        rhs_1 += wi * ai1 * bi

    determinant = normal_00 * normal_11 - normal_01 * normal_01
    if abs(determinant) < 1e-6:
        return weighted_centroid_location(anchors, distance_estimates)

    x = (rhs_0 * normal_11 - rhs_1 * normal_01) / determinant
    y = (normal_00 * rhs_1 - normal_01 * rhs_0) / determinant

    # 鲁棒性保护：几何退化（锚点近共线/远距）时线性解可能跑飞，
    # 若解显著落在锚点凸包范围之外则回退加权质心。
    span_x = max(px for px, _ in points) - min(px for px, _ in points)
    span_y = max(py for _, py in points) - min(py for _, py in points)
    margin = max(span_x, span_y, 1.0)
    if abs(x) > 1.3 * margin or abs(y) > 1.3 * margin:
        return weighted_centroid_location(anchors, distance_estimates)
    return xy_to_lonlat(x, y, origin_lon, origin_lat)


def least_squares_trilateration(
    anchors: list[dict[str, str]],
    distance_estimates: list[float],
    fallback_lon: float,
    fallback_lat: float,
) -> tuple[float, float]:
    """等权最小二乘三边定位（加权版本在所有权重相等时的特例）。"""

    return weighted_least_squares_trilateration(
        anchors,
        distance_estimates,
        [1.0] * len(anchors),
        fallback_lon,
        fallback_lat,
    )


def localization_error(
    estimated_lon: float,
    estimated_lat: float,
    truth_lon: float,
    truth_lat: float,
) -> float:
    """估计坐标与真实坐标之间的定位误差（米）。"""

    return distance_m(estimated_lon, estimated_lat, truth_lon, truth_lat)
