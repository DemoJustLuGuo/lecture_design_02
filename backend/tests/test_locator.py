from __future__ import annotations

from backend.src.models.locator import (
    anchor_reliability_weight,
    distance_m,
    least_squares_trilateration,
    localization_error,
    nearest_stations,
    weighted_centroid_location,
    weighted_least_squares_trilateration,
)


def station(station_id: str, lon: float, lat: float) -> dict[str, str]:
    return {"station_id": station_id, "longitude": str(lon), "latitude": str(lat)}


def test_distance_m_zero_for_same_point() -> None:
    assert distance_m(120.0, 30.0, 120.0, 30.0) == 0.0


def test_distance_m_one_degree_latitude_is_about_111km() -> None:
    # 1 度纬度约 111.2 km
    assert abs(distance_m(0.0, 0.0, 0.0, 1.0) - 111_194.0) < 1000.0


def test_nearest_stations_sorted_and_limited() -> None:
    stations = [
        station("A", 120.30, 30.0),
        station("B", 120.05, 30.0),
        station("C", 120.10, 30.0),
    ]
    nearest = nearest_stations(stations, 120.06, 30.0, count=2)
    assert [item["station_id"] for item in nearest] == ["B", "C"]


def test_weighted_centroid_equidistant_returns_average() -> None:
    anchors = [station("A", 120.0, 30.0), station("B", 120.2, 30.0)]
    lon, lat = weighted_centroid_location(anchors, [100.0, 100.0])
    assert abs(lon - 120.1) < 1e-9
    assert abs(lat - 30.0) < 1e-9


def test_trilateration_recovers_truth_with_exact_distances() -> None:
    truth_lon, truth_lat = 120.10, 30.20
    anchors = [
        station("A", 120.09, 30.20),
        station("B", 120.11, 30.21),
        station("C", 120.10, 30.19),
    ]
    estimates = [
        distance_m(truth_lon, truth_lat, float(a["longitude"]), float(a["latitude"]))
        for a in anchors
    ]
    est_lon, est_lat = least_squares_trilateration(anchors, estimates, truth_lon, truth_lat)
    assert localization_error(est_lon, est_lat, truth_lon, truth_lat) < 5.0


def test_trilateration_falls_back_when_too_few_anchors() -> None:
    anchors = [station("A", 120.09, 30.20)]
    est = least_squares_trilateration(anchors, [50.0], 120.10, 30.20)
    assert est == (120.10, 30.20)


def test_anchor_weight_prefers_near_and_strong_signal() -> None:
    near_strong = anchor_reliability_weight(80.0, rsrp=-70.0, sinr=25.0)
    far_weak = anchor_reliability_weight(800.0, rsrp=-120.0, sinr=-5.0)
    assert near_strong > far_weak


def test_weighted_trilateration_recovers_truth_with_exact_distances() -> None:
    truth_lon, truth_lat = 120.10, 30.20
    anchors = [
        station("A", 120.09, 30.20),
        station("B", 120.11, 30.21),
        station("C", 120.10, 30.19),
        station("D", 120.115, 30.195),
    ]
    estimates = [
        distance_m(truth_lon, truth_lat, float(a["longitude"]), float(a["latitude"]))
        for a in anchors
    ]
    weights = [anchor_reliability_weight(d) for d in estimates]
    est_lon, est_lat = weighted_least_squares_trilateration(
        anchors, estimates, weights, truth_lon, truth_lat
    )
    assert localization_error(est_lon, est_lat, truth_lon, truth_lat) < 5.0
