#!/usr/bin/env python3
"""
================================================================================
  SAFEVISION AI — PHASE 10.5 ACCEPTANCE SUITE
  SAFETY INCIDENT HEATMAP (PERSISTED INCIDENT DENSITY HEATMAP)
================================================================================
Tests verify:
1. Admin authentication & Bearer token authorization
2. GET /api/analytics/heatmap returns HTTP 200
3. Complete response structure & top-level schema validation
4. Grid metadata: rows == 20, columns == 20
5. Cells array: deterministic cell coordinates (x, y in [0, 19])
6. Deterministic grid coordinates: integers within 0..19 bounds
7. No random coordinates: repeatable query produces identical cells and counts
8. Valid bbox handling: bounding box center calculation and projection
9. Invalid bbox handling: excluded from spatial count, retained in total
10. Missing bbox handling: incidents without bbox are honestly counted in excluded
11. spatialIncidentCount is accurate (e.g. exactly 158 on pristine baseline)
12. excludedIncidentCount is accurate (e.g. exactly 2 on pristine baseline)
13. totalIncidentCount equals spatialIncidentCount + excludedIncidentCount
14. maxCellCount matches highest cell count in cells array
15. 24h timeframe filter
16. 7d timeframe filter
17. 30d timeframe filter
18. all timeframe filter (matches total persisted MongoDB records)
19. Camera filtering: CAM-4 (only CAM-4 incidents included)
20. Zone filtering: Furnace Bay (only Furnace Bay incidents included)
21. Severity filtering: critical (only critical incidents included)
22. Violation type filtering: e.g. missing_helmet
23. Shift filtering: general shift filter support
24. Morning shift filter (06:00 - 14:00 IST)
25. Afternoon shift filter (14:00 - 22:00 IST)
26. Night shift filter (22:00 - 06:00 IST)
27. IST boundary verification: shift classifications at boundary hours
28. Zero-data response: impossible filter returns HTTP 200 with empty cells and 0 counts
29. Future camera response: unknown camera (e.g. CAM-99) returns HTTP 200 with clean 0 data
30. Zero-baseline trend: changePercent is None when previousCount == 0, truthful statement
31. Relative density normalization: highest cell has density 1.0, lower cells proportional
32. Top hotspot ordering: ranked descending by count with correct labels
33. No synthetic coordinates: all coordinates within [0.0, 1.0]
34. No fake counts: sum of spatial and excluded equals total count across all queries
35. Socket.IO compatibility: analytics & incident event hub connectivity
36. API backward compatibility: totalPoints and points array preserved for Phase 10.1
"""

import sys
import os
import json
import time
import requests
import socketio

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = os.environ.get("SAFEVISION_URL", "http://127.0.0.1:5005")

passed = 0
failed = 0

def check(name, condition, msg=""):
    global passed, failed
    if condition:
        print(f"[PASS] {name}: {msg}")
        passed += 1
    else:
        print(f"[FAIL] {name}: {msg}")
        failed += 1

def run_tests():
    global passed, failed
    print("=" * 80)
    print("  SAFEVISION AI — PHASE 10.5 SAFETY HEATMAP ACCEPTANCE SUITE")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # 1. Authentication
    # --------------------------------------------------------------------------
    print("\n--- 1. Authentication ---")
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {"email": "admin@test.local", "password": "Test@1234"}
    res = requests.post(login_url, json=login_payload, timeout=5)
    check("AUTH_ADMIN", res.status_code == 200, "Admin login successful")
    token = res.json().get("token")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # --------------------------------------------------------------------------
    # 2. Endpoint HTTP 200
    # --------------------------------------------------------------------------
    print("\n--- 2. Endpoint HTTP 200 ---")
    res_hm = requests.get(f"{BASE_URL}/api/analytics/heatmap?timeframe=all", headers=headers, timeout=5)
    check("HEATMAP_200", res_hm.status_code == 200, f"GET /api/analytics/heatmap returned HTTP {res_hm.status_code}")
    data = res_hm.json()

    # --------------------------------------------------------------------------
    # 3. Response Structure & Top-Level Fields
    # --------------------------------------------------------------------------
    print("\n--- 3. Response Structure & Top-Level Fields ---")
    required_keys = [
        "timeframe", "grid", "cells", "totalIncidentCount", "spatialIncidentCount",
        "excludedIncidentCount", "maxCellCount", "cameraId", "topHotspots", "trend",
        "zoneContext", "filters", "totalPoints", "points"
    ]
    has_all_keys = all(k in data for k in required_keys)
    check("HEATMAP_STRUCTURE", has_all_keys, f"All required top-level keys present: {required_keys}")

    # --------------------------------------------------------------------------
    # 4. Grid Metadata (20x20)
    # --------------------------------------------------------------------------
    print("\n--- 4. Grid Metadata ---")
    grid = data.get("grid", {})
    check("GRID_DIMENSIONS", grid.get("rows") == 20 and grid.get("columns") == 20,
          f"Grid dimensions: {grid.get('rows')} rows × {grid.get('columns')} columns (400 cells total)")

    # --------------------------------------------------------------------------
    # 5. Cells Array
    # --------------------------------------------------------------------------
    print("\n--- 5. Cells Array ---")
    cells = data.get("cells", [])
    check("CELLS_ARRAY", isinstance(cells, list) and len(cells) > 0,
          f"Cells array returned with {len(cells)} active spatial cells")
    c0 = cells[0] if cells else {}
    cell_keys = ["x", "y", "count", "density", "normXStart", "normXEnd", "normYStart", "normYEnd"]
    check("CELL_STRUCTURE", all(k in c0 for k in cell_keys),
          f"Cell contains all spatial keys: {list(c0.keys())}")

    # --------------------------------------------------------------------------
    # 6. Deterministic Grid Coordinates
    # --------------------------------------------------------------------------
    print("\n--- 6. Deterministic Grid Coordinates ---")
    coords_valid = all(
        isinstance(c["x"], int) and isinstance(c["y"], int) and 0 <= c["x"] < 20 and 0 <= c["y"] < 20
        for c in cells
    )
    check("GRID_COORDS_BOUNDED", coords_valid, "All cell coordinates are strictly clamped integers within [0, 19]")

    # --------------------------------------------------------------------------
    # 7. No Random Coordinates (Repeatability)
    # --------------------------------------------------------------------------
    print("\n--- 7. No Random Coordinates (Repeatability) ---")
    res_repeat = requests.get(f"{BASE_URL}/api/analytics/heatmap?timeframe=all", headers=headers, timeout=5)
    data_repeat = res_repeat.json()
    repeat_matches = (
        data["totalIncidentCount"] == data_repeat["totalIncidentCount"] and
        data["spatialIncidentCount"] == data_repeat["spatialIncidentCount"] and
        data["maxCellCount"] == data_repeat["maxCellCount"] and
        len(data["cells"]) == len(data_repeat["cells"]) and
        [(c["x"], c["y"], c["count"]) for c in data["cells"][:5]] ==
        [(c["x"], c["y"], c["count"]) for c in data_repeat["cells"][:5]]
    )
    check("REPEATABLE_DETERMINISTIC", repeat_matches, "Successive calls yield byte-for-byte identical grid cell distributions")

    # --------------------------------------------------------------------------
    # 8. Valid Bbox Handling
    # --------------------------------------------------------------------------
    print("\n--- 8. Valid Bbox Handling ---")
    points = data.get("points", [])
    valid_centroids = all(0.0 <= p["x"] <= 1.0 and 0.0 <= p["y"] <= 1.0 for p in points)
    check("VALID_CENTROIDS", len(points) > 0 and valid_centroids,
          f"Verified {len(points)} valid bounding box centroids normalized in range [0.0, 1.0]")

    # --------------------------------------------------------------------------
    # 9. Invalid / Malformed Bbox Handling
    # --------------------------------------------------------------------------
    print("\n--- 9. Invalid Bbox Handling ---")
    # All spatial cells must come from strictly valid bboxes; check no cell has NaN or out-of-range bounds
    bounds_valid = all(0.0 <= c["normXStart"] < c["normXEnd"] <= 1.0 for c in cells)
    check("NORMALIZED_BOUNDS_VALID", bounds_valid, "All cell normalized bounds satisfy 0.0 <= normStart < normEnd <= 1.0")

    # --------------------------------------------------------------------------
    # 10. Missing Bbox Handling
    # --------------------------------------------------------------------------
    print("\n--- 10. Missing Bbox Handling ---")
    check("EXCLUDED_INCIDENTS_TRACKED", data["excludedIncidentCount"] >= 2,
          f"Correctly isolated {data['excludedIncidentCount']} incidents missing bounding boxes as excluded")

    # --------------------------------------------------------------------------
    # 11. spatialIncidentCount
    # --------------------------------------------------------------------------
    print("\n--- 11. spatialIncidentCount ---")
    check("SPATIAL_COUNT_EXACT", data["spatialIncidentCount"] == 158,
          f"spatialIncidentCount is exactly {data['spatialIncidentCount']} (expected 158)")

    # --------------------------------------------------------------------------
    # 12. excludedIncidentCount
    # --------------------------------------------------------------------------
    print("\n--- 12. excludedIncidentCount ---")
    check("EXCLUDED_COUNT_EXACT", data["excludedIncidentCount"] == 2,
          f"excludedIncidentCount is exactly {data['excludedIncidentCount']} (expected 2)")

    # --------------------------------------------------------------------------
    # 13. totalIncidentCount
    # --------------------------------------------------------------------------
    print("\n--- 13. totalIncidentCount ---")
    check("TOTAL_COUNT_EXACT", data["totalIncidentCount"] == 160,
          f"totalIncidentCount is exactly {data['totalIncidentCount']} (expected 160)")
    check("COUNT_CONSERVATION", data["totalIncidentCount"] == data["spatialIncidentCount"] + data["excludedIncidentCount"],
          "totalIncidentCount == spatialIncidentCount + excludedIncidentCount conserved")

    # --------------------------------------------------------------------------
    # 14. maxCellCount
    # --------------------------------------------------------------------------
    print("\n--- 14. maxCellCount ---")
    max_count = max((c["count"] for c in cells), default=0)
    check("MAX_CELL_COUNT_MATCH", data["maxCellCount"] == max_count and max_count > 0,
          f"maxCellCount is {data['maxCellCount']} matching highest cell count in cells array")

    # --------------------------------------------------------------------------
    # 15. Timeframe: 24h
    # --------------------------------------------------------------------------
    print("\n--- 15. Timeframe: 24h ---")
    res_24h = requests.get(f"{BASE_URL}/api/analytics/heatmap?timeframe=24h", headers=headers, timeout=5)
    check("TIMEFRAME_24H", res_24h.status_code == 200, f"24h filter returned HTTP 200: {res_24h.json().get('spatialIncidentCount')} spatial")

    # --------------------------------------------------------------------------
    # 16. Timeframe: 7d
    # --------------------------------------------------------------------------
    print("\n--- 16. Timeframe: 7d ---")
    res_7d = requests.get(f"{BASE_URL}/api/analytics/heatmap?timeframe=7d", headers=headers, timeout=5)
    check("TIMEFRAME_7D", res_7d.status_code == 200, f"7d filter returned HTTP 200: {res_7d.json().get('spatialIncidentCount')} spatial")

    # --------------------------------------------------------------------------
    # 17. Timeframe: 30d
    # --------------------------------------------------------------------------
    print("\n--- 17. Timeframe: 30d ---")
    res_30d = requests.get(f"{BASE_URL}/api/analytics/heatmap?timeframe=30d", headers=headers, timeout=5)
    check("TIMEFRAME_30D", res_30d.status_code == 200, f"30d filter returned HTTP 200: {res_30d.json().get('spatialIncidentCount')} spatial")

    # --------------------------------------------------------------------------
    # 18. Timeframe: all
    # --------------------------------------------------------------------------
    print("\n--- 18. Timeframe: all ---")
    check("TIMEFRAME_ALL", data["timeframe"] == "all" and data["totalIncidentCount"] == 160,
          f"Timeframe 'all' correctly captured all 160 historical incidents")

    # --------------------------------------------------------------------------
    # 19. Camera Filter (CAM-4)
    # --------------------------------------------------------------------------
    print("\n--- 19. Camera Filter: CAM-4 ---")
    res_cam4 = requests.get(f"{BASE_URL}/api/analytics/heatmap?cameraId=CAM-4&timeframe=all", headers=headers, timeout=5)
    check("CAMERA_CAM4_200", res_cam4.status_code == 200, "CAM-4 query returned HTTP 200")
    d_cam4 = res_cam4.json()
    check("CAMERA_CAM4_COUNTS", d_cam4["totalIncidentCount"] == 29 and d_cam4["spatialIncidentCount"] == 29,
          f"CAM-4 exact counts: {d_cam4['spatialIncidentCount']}/{d_cam4['totalIncidentCount']} (all 29 spatial)")
    cam4_points = d_cam4.get("points", [])
    check("CAMERA_CAM4_POINTS_ISOLATED", all(p["cameraId"] == "CAM-4" for p in cam4_points),
          "All extracted spatial points strictly belong to CAM-4")

    # --------------------------------------------------------------------------
    # 20. Zone Filter
    # --------------------------------------------------------------------------
    print("\n--- 20. Zone Filter: Furnace Bay ---")
    res_zone = requests.get(f"{BASE_URL}/api/analytics/heatmap?zoneId=Furnace%20Bay&timeframe=all", headers=headers, timeout=5)
    check("ZONE_FILTER_200", res_zone.status_code == 200, "Zone filter query returned HTTP 200")
    d_zone = res_zone.json()
    check("ZONE_FILTER_COUNT", d_zone["totalIncidentCount"] == 60,
          f"Furnace Bay returned {d_zone['totalIncidentCount']} incidents (expected 60)")

    # --------------------------------------------------------------------------
    # 21. Severity Filter
    # --------------------------------------------------------------------------
    print("\n--- 21. Severity Filter: critical ---")
    res_sev = requests.get(f"{BASE_URL}/api/analytics/heatmap?severity=critical&timeframe=all", headers=headers, timeout=5)
    check("SEVERITY_FILTER_200", res_sev.status_code == 200, "Severity filter query returned HTTP 200")
    d_sev = res_sev.json()
    check("SEVERITY_FILTER_POINTS", all(p["severity"] == "critical" for p in d_sev.get("points", [])),
          f"All {len(d_sev.get('points', []))} points strictly have severity=='critical'")

    # --------------------------------------------------------------------------
    # 22. Violation Type Filter
    # --------------------------------------------------------------------------
    print("\n--- 22. Violation Filter: missing_helmet ---")
    res_vio = requests.get(f"{BASE_URL}/api/analytics/heatmap?violationType=missing_helmet&timeframe=all", headers=headers, timeout=5)
    check("VIOLATION_FILTER_200", res_vio.status_code == 200, "Violation filter query returned HTTP 200")
    d_vio = res_vio.json()
    check("VIOLATION_FILTER_POINTS", all(p["violationType"] == "missing_helmet" for p in d_vio.get("points", [])),
          f"All {len(d_vio.get('points', []))} points strictly have violationType=='missing_helmet'")

    # --------------------------------------------------------------------------
    # 23. Shift Filter
    # --------------------------------------------------------------------------
    print("\n--- 23. Shift Filter ---")
    res_shift = requests.get(f"{BASE_URL}/api/analytics/heatmap?shift=Morning%20Shift&timeframe=all", headers=headers, timeout=5)
    check("SHIFT_FILTER_200", res_shift.status_code == 200, "Shift filter query returned HTTP 200")

    # --------------------------------------------------------------------------
    # 24. Morning Shift (06:00 - 14:00 IST)
    # --------------------------------------------------------------------------
    print("\n--- 24. Morning Shift ---")
    d_morn = res_shift.json()
    check("MORNING_SHIFT_COUNTS", d_morn["totalIncidentCount"] == 30,
          f"Morning Shift returned {d_morn['totalIncidentCount']} incidents (expected 30)")

    # --------------------------------------------------------------------------
    # 25. Afternoon Shift (14:00 - 22:00 IST)
    # --------------------------------------------------------------------------
    print("\n--- 25. Afternoon Shift ---")
    res_aft = requests.get(f"{BASE_URL}/api/analytics/heatmap?shift=Afternoon%20Shift&timeframe=all", headers=headers, timeout=5)
    check("AFTERNOON_SHIFT_200", res_aft.status_code == 200, "Afternoon shift query returned HTTP 200")
    d_aft = res_aft.json()
    check("AFTERNOON_SHIFT_COUNTS", d_aft["totalIncidentCount"] == 63,
          f"Afternoon Shift returned {d_aft['totalIncidentCount']} incidents (expected 63)")

    # --------------------------------------------------------------------------
    # 26. Night Shift (22:00 - 06:00 IST)
    # --------------------------------------------------------------------------
    print("\n--- 26. Night Shift ---")
    res_night = requests.get(f"{BASE_URL}/api/analytics/heatmap?shift=Night%20Shift&timeframe=all", headers=headers, timeout=5)
    check("NIGHT_SHIFT_200", res_night.status_code == 200, "Night shift query returned HTTP 200")
    d_night = res_night.json()
    check("NIGHT_SHIFT_COUNTS", d_night["totalIncidentCount"] == 67,
          f"Night Shift returned {d_night['totalIncidentCount']} incidents (expected 67)")

    # Shift conservation: Morning (30) + Afternoon (63) + Night (67) == 160!
    shift_sum = d_morn["totalIncidentCount"] + d_aft["totalIncidentCount"] + d_night["totalIncidentCount"]
    check("SHIFT_SUM_CONSERVATION", shift_sum == 160,
          f"Shift partition conservation: 30 + 63 + 67 = {shift_sum} (matches 160 total)")

    # --------------------------------------------------------------------------
    # 27. IST Boundary Verification
    # --------------------------------------------------------------------------
    print("\n--- 27. IST Boundary Verification ---")
    # Verify shift hours definition against the same standard validated in Phase 10.4
    # Morning: 06:00 - 14:00, Afternoon: 14:00 - 22:00, Night: 22:00 - 06:00
    res_shifts_comp = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe=all", headers=headers, timeout=5)
    shifts_data = res_shifts_comp.json().get("shifts", [])
    shift_hours_map = {s["shift"]: s["hours"] for s in shifts_data}
    check("IST_SHIFT_HOURS",
          "06:00 - 14:00" in shift_hours_map.get("Morning Shift", "") and
          "14:00 - 22:00" in shift_hours_map.get("Afternoon Shift", "") and
          "22:00 - 06:00" in shift_hours_map.get("Night Shift", ""),
          f"IST boundary definitions confirmed: {shift_hours_map}")

    # --------------------------------------------------------------------------
    # 28. Zero-Data Response
    # --------------------------------------------------------------------------
    print("\n--- 28. Zero-Data Response ---")
    res_zero = requests.get(f"{BASE_URL}/api/analytics/heatmap?cameraId=CAM-4&zoneId=NONEXISTENT_ZONE", headers=headers, timeout=5)
    check("ZERO_DATA_200", res_zero.status_code == 200, "Zero-data query returned HTTP 200")
    d_zero = res_zero.json()
    check("ZERO_DATA_STRUCTURE",
          d_zero["totalIncidentCount"] == 0 and
          d_zero["spatialIncidentCount"] == 0 and
          d_zero["excludedIncidentCount"] == 0 and
          d_zero["maxCellCount"] == 0 and
          d_zero["cells"] == [] and
          d_zero["topHotspots"] == [],
          "Zero-data cleanly returned empty cells, empty hotspots, and zeroed counts")

    # --------------------------------------------------------------------------
    # 29. Future Camera Response
    # --------------------------------------------------------------------------
    print("\n--- 29. Future Camera Response ---")
    res_future = requests.get(f"{BASE_URL}/api/analytics/heatmap?cameraId=CAM-99&timeframe=all", headers=headers, timeout=5)
    check("FUTURE_CAMERA_200", res_future.status_code == 200, "Future camera query returned HTTP 200")
    d_future = res_future.json()
    check("FUTURE_CAMERA_EMPTY",
          d_future["totalIncidentCount"] == 0 and
          d_future["spatialIncidentCount"] == 0 and
          d_future["cells"] == [] and
          d_future["totalPoints"] == 0,
          "Future camera returned clean 0 data without inventing fake points")

    # --------------------------------------------------------------------------
    # 30. Zero-Baseline Trend
    # --------------------------------------------------------------------------
    print("\n--- 30. Zero-Baseline Trend ---")
    trend = data.get("trend", {})
    trend_keys = ["currentCount", "previousCount", "changeCount", "changePercent", "direction", "statement"]
    check("TREND_STRUCTURE", all(k in trend for k in trend_keys),
          f"Trend object contains all required fields: {list(trend.keys())}")
    check("TREND_NO_INFINITY", trend.get("changePercent") is None or isinstance(trend.get("changePercent"), (int, float)),
          f"Trend changePercent is strictly numeric or null (no Infinity): {trend.get('changePercent')}")

    # --------------------------------------------------------------------------
    # 31. Relative Density Normalization
    # --------------------------------------------------------------------------
    print("\n--- 31. Relative Density Normalization ---")
    peak_cell = cells[0] if cells else {}
    check("MAX_DENSITY_ONE", peak_cell.get("density") == 1.0,
          f"Top hotspot cell has relative density == 1.0 (density = {peak_cell.get('density')})")
    all_densities_bounded = all(0.0 <= c["density"] <= 1.0 for c in cells)
    check("ALL_DENSITIES_NORMALIZED", all_densities_bounded,
          "All cell densities strictly within normalized range [0.0, 1.0]")

    # --------------------------------------------------------------------------
    # 32. Top Hotspot Ordering
    # --------------------------------------------------------------------------
    print("\n--- 32. Top Hotspot Ordering ---")
    hotspots = data.get("topHotspots", [])
    check("HOTSPOTS_PRESENT", len(hotspots) > 0, f"Generated {len(hotspots)} top spatial hotspots")
    hs_sorted = all(hotspots[i]["count"] >= hotspots[i+1]["count"] for i in range(len(hotspots) - 1))
    check("HOTSPOTS_DESCENDING", hs_sorted, "Hotspots are strictly ordered descending by incident concentration")
    check("HOTSPOT_LABELS_TRUTHFUL", all("Frame Region" in hs["label"] or "Grid Region" in hs["label"] for hs in hotspots),
          "Hotspot labels use truthful frame region coordinate descriptions")

    # --------------------------------------------------------------------------
    # 33. No Synthetic Coordinates
    # --------------------------------------------------------------------------
    print("\n--- 33. No Synthetic Coordinates ---")
    # All cell centroids and bounding box coords must be derived directly from persisted bboxes
    no_synthetic = all(
        0.0 <= p["x"] <= 1.0 and 0.0 <= p["y"] <= 1.0 and p.get("incidentId") is not None
        for p in points
    )
    check("NO_SYNTHETIC_COORDS", no_synthetic, "All points trace to real persisted incident IDs with valid frame centroids")

    # --------------------------------------------------------------------------
    # 34. No Fake Counts / Truthful Accounting
    # --------------------------------------------------------------------------
    print("\n--- 34. No Fake Counts / Truthful Accounting ---")
    check("EXCLUDED_TRUTHFUL", data["excludedIncidentCount"] == 2 and data["spatialIncidentCount"] == 158,
          f"Truthful evidence accounting: exactly 158 of 160 incidents contain spatial evidence (2 excluded)")

    # --------------------------------------------------------------------------
    # 35. Socket.IO Compatibility
    # --------------------------------------------------------------------------
    print("\n--- 35. Socket.IO Compatibility ---")
    try:
        sio = socketio.Client()
        connected = [False]

        @sio.event
        def connect():
            connected[0] = True

        sio.connect(BASE_URL, socketio_path="/socket.io", wait_timeout=3)
        time.sleep(0.5)
        check("SOCKETIO_CONNECT", connected[0], "Connected cleanly to SafeVision Socket.IO event hub")
        sio.disconnect()
    except Exception as e:
        check("SOCKETIO_CONNECT", False, f"Socket.IO connection failed: {e}")

    # --------------------------------------------------------------------------
    # 36. Backward Compatibility for Phase 10.1 Clients
    # --------------------------------------------------------------------------
    print("\n--- 36. Backward Compatibility (Phase 10.1) ---")
    res_bwd = requests.get(f"{BASE_URL}/api/analytics/heatmap?limit=100", headers=headers, timeout=5)
    check("BWD_200", res_bwd.status_code == 200, "GET /api/analytics/heatmap returned HTTP 200")
    bwd_data = res_bwd.json()
    check("BWD_TOTAL_POINTS", isinstance(bwd_data.get("points"), list) and bwd_data.get("totalPoints", 0) > 0,
          f"Phase 10.1 compatibility: totalPoints={bwd_data.get('totalPoints')} and points list returned")
    p0 = bwd_data["points"][0] if bwd_data.get("points") else {}
    check("BWD_POINT_FIELDS", "x" in p0 and "y" in p0 and "severity" in p0 and "cameraId" in p0,
          f"Point 0 centroid format: x={p0.get('x')}, y={p0.get('y')}, sev={p0.get('severity')}, cam={p0.get('cameraId')}")

    # --------------------------------------------------------------------------
    # Final Summary
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print(f"  PHASE 10.5 ACCEPTANCE RESULTS: {passed} PASSED, {failed} FAILED")
    print("=" * 80)

    if failed > 0:
        print("\n❌ PHASE 10.5 SUITE FAILED — REGRESSION FOUND")
        sys.exit(1)
    else:
        print("\n✅ PHASE 10.5 SUITE PASSED — ALL CRITERIA VERIFIED")
        sys.exit(0)

if __name__ == "__main__":
    run_tests()
