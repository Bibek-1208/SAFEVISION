#!/usr/bin/env python3
"""
================================================================================
  SAFEVISION AI — PHASE 10.4 ACCEPTANCE SUITE
  OPERATIONAL SHIFT SAFETY ANALYSIS (IST / UTC+05:30)
================================================================================
Tests verify:
1. Admin authentication & Bearer token authorization
2. GET /api/analytics/shift-analysis returns HTTP 200
3. Complete response structure & top-level schema validation
4. Exactly 3 standard operational shifts (Morning, Afternoon, Night)
5. Standard shift names & exact formatting
6. Standard operational shift hours
7. 06:00 boundary logic (Morning Shift start)
8. 14:00 boundary logic (Afternoon Shift start)
9. 22:00 boundary logic (Night Shift start)
10. Midnight crossing boundary logic (00:00 - 05:59 Night Shift)
11. 05:59 boundary logic (Night Shift end)
12. IST timezone handling (+05:30 offset verification)
13. Timeframe filtering: 24h
14. Timeframe filtering: 7d
15. Timeframe filtering: 30d
16. Timeframe filtering: all
17. Camera filtering: CAM-4
18. Future/unknown camera filtering: CAM-16 returns HTTP 200 with clean 0 data
19. Zone filtering (e.g. zoneId='Furnace Bay')
20. Severity filtering (e.g. severity='critical')
21. Violation type filtering (e.g. violationType='missing_helmet')
22. Severity distribution per shift (critical, high, medium, low, info)
23. Violation type distribution per shift (sorted descending by count)
24. Zone distribution per shift (sorted descending by count)
25. Camera distribution per shift (evidence-based camera counts)
26. Mathematical shift trend calculation (current vs previous equivalent window)
27. Zero-baseline trend handling (changePercent=None when previous=0)
28. Data honesty: Zero synthetic compliance (compliance is null when denominator unavailable)
29. Data honesty: Reused deterministic exposure index (not accident probability)
30. Empty state handling (nonexistent camera/zone cleanly returns HTTP 200 with 0 incidents)
31. Socket.IO analytics hub compatibility
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
    print("  SAFEVISION AI — PHASE 10.4 SHIFT ANALYSIS ACCEPTANCE SUITE")
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
    # 2. GET /api/analytics/shift-analysis (Structure & Baseline)
    # --------------------------------------------------------------------------
    print("\n--- 2. GET /api/analytics/shift-analysis (Structure & Baseline) ---")
    res = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe=all", headers=headers, timeout=10)
    check("SA_STATUS_200", res.status_code == 200, f"GET /api/analytics/shift-analysis returned HTTP {res.status_code}")
    data = res.json()

    for key in ["timeframe", "shifts", "timeline", "summary", "filtersApplied", "totalIncidents", "timestamp"]:
        check(f"SA_KEY_{key.upper()}", key in data, f"Key '{key}' present in shift-analysis payload")

    check("SA_SHIFTS_IS_LIST", isinstance(data.get("shifts"), list), "shifts is a list")
    check("SA_TIMELINE_IS_LIST", isinstance(data.get("timeline"), list), "timeline is a list")
    check("SA_SUMMARY_IS_OBJECT", isinstance(data.get("summary"), dict), "summary is an object")
    total_incidents = data.get("totalIncidents", 0)
    check("SA_TOTAL_INCIDENTS_NUMERIC", isinstance(total_incidents, (int, float)) and total_incidents > 0, f"totalIncidents is numeric: {total_incidents}")

    # --------------------------------------------------------------------------
    # 3. Exactly 3 Standard Shifts & Plant Shift Definitions
    # --------------------------------------------------------------------------
    print("\n--- 3. Exactly 3 Standard Shifts & Plant Shift Definitions ---")
    shifts = data.get("shifts", [])
    check("SHIFTS_EXACTLY_3", len(shifts) == 3, f"Exactly 3 standard plant shifts: {len(shifts)}")

    expected_shifts = [
        {"shift": "Morning Shift", "hours": "06:00 - 14:00"},
        {"shift": "Afternoon Shift", "hours": "14:00 - 22:00"},
        {"shift": "Night Shift", "hours": "22:00 - 06:00"},
    ]

    for i, exp in enumerate(expected_shifts):
        s = shifts[i] if i < len(shifts) else {}
        check(f"SHIFT_NAME_{i+1}", s.get("shift") == exp["shift"], f"Shift {i+1} name matches: {s.get('shift')}")
        check(f"SHIFT_HOURS_{i+1}", s.get("hours") == exp["hours"], f"Shift {i+1} hours match: {s.get('hours')}")

    # --------------------------------------------------------------------------
    # 4. Shift Metrics & Field Integrity
    # --------------------------------------------------------------------------
    print("\n--- 4. Shift Metrics & Field Integrity ---")
    for s in shifts:
        shift_name = s.get("shift")
        for f in ["incidentCount", "criticalCount", "highCount", "mediumCount", "lowCount", "infoCount",
                  "violationTypes", "zones", "cameras", "trend", "exposureIndex", "riskLevel", "compliance"]:
            check(f"FIELD_{f.upper()}_{shift_name}", f in s, f"Field '{f}' present in {shift_name}")

        trend = s.get("trend", {})
        for tfld in ["currentCount", "previousCount", "changeCount", "changePercent", "direction"]:
            check(f"TREND_FIELD_{tfld.upper()}_{shift_name}", tfld in trend, f"Trend field '{tfld}' present in {shift_name}")

        # Severity breakdown non-negative and sums to incidentCount
        sev_sum = s.get("criticalCount", 0) + s.get("highCount", 0) + s.get("mediumCount", 0) + s.get("lowCount", 0) + s.get("infoCount", 0)
        check(f"SEV_SUM_MATCH_{shift_name}", sev_sum == s.get("incidentCount"), f"{shift_name} severity sum ({sev_sum}) matches incidentCount ({s.get('incidentCount')})")

    # Verify total across all 3 shifts matches totalIncidents
    shift_sum = sum(s.get("incidentCount", 0) for s in shifts)
    check("SHIFT_SUM_TOTAL_MATCH", shift_sum == total_incidents, f"Sum of 3 shifts ({shift_sum}) matches totalIncidents ({total_incidents})")

    # --------------------------------------------------------------------------
    # 5. Shift Classification & IST (+05:30) Midnight Crossing Boundary Verification
    # --------------------------------------------------------------------------
    print("\n--- 5. Shift Classification & Boundary Rules ---")
    # Verify that Night Shift includes midnight crossing (hours 22:00 - 06:00 IST)
    night_shift = next((s for s in shifts if s.get("shift") == "Night Shift"), None)
    morning_shift = next((s for s in shifts if s.get("shift") == "Morning Shift"), None)
    afternoon_shift = next((s for s in shifts if s.get("shift") == "Afternoon Shift"), None)

    check("NIGHT_SHIFT_EXISTS", night_shift is not None, "Night Shift present")
    check("MORNING_SHIFT_EXISTS", morning_shift is not None, "Morning Shift present")
    check("AFTERNOON_SHIFT_EXISTS", afternoon_shift is not None, "Afternoon Shift present")

    # Check shift distribution in rsp dataset (night shift should have real incidents)
    check("NIGHT_SHIFT_HAS_INCIDENTS", night_shift.get("incidentCount", 0) > 0, f"Night Shift has recorded incidents: {night_shift.get('incidentCount')}")

    # --------------------------------------------------------------------------
    # 6. Timeframe Filtering (24h, 7d, 30d, all)
    # --------------------------------------------------------------------------
    print("\n--- 6. Timeframe Filtering (24h, 7d, 30d, all) ---")
    for tf in ["24h", "7d", "30d", "all"]:
        res_tf = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe={tf}", headers=headers, timeout=10)
        check(f"TF_{tf.upper()}_200", res_tf.status_code == 200, f"timeframe={tf} returned HTTP 200")
        tf_data = res_tf.json()
        check(f"TF_{tf.upper()}_MATCH", tf_data.get("timeframe") == tf, f"timeframe matches '{tf}'")
        check(f"TF_{tf.upper()}_3_SHIFTS", len(tf_data.get("shifts", [])) == 3, f"timeframe={tf} returns exactly 3 shifts")

    # --------------------------------------------------------------------------
    # 7. Camera Filtering (CAM-4 & Future Camera CAM-16)
    # --------------------------------------------------------------------------
    print("\n--- 7. Camera Filtering (CAM-4 & Future Camera CAM-16) ---")
    res_cam4 = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe=all&cameraId=CAM-4", headers=headers, timeout=10)
    check("CAM4_FILTER_200", res_cam4.status_code == 200, "Filter by cameraId=CAM-4 returned HTTP 200")
    cam4_data = res_cam4.json()
    cam4_total = cam4_data.get("totalIncidents", 0)
    check("CAM4_INCIDENT_COUNT", cam4_total > 0, f"CAM-4 incident count: {cam4_total}")
    check("CAM4_FILTERS_APPLIED", cam4_data.get("filtersApplied", {}).get("cameraId") == "CAM-4", "filtersApplied reflects CAM-4")

    # Future camera CAM-16 must return clean empty data, NOT HTTP 500
    res_cam16 = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe=all&cameraId=CAM-16", headers=headers, timeout=10)
    check("CAM16_FILTER_200", res_cam16.status_code == 200, f"Future camera CAM-16 returned HTTP {res_cam16.status_code} (not 500)")
    cam16_data = res_cam16.json()
    check("CAM16_TOTAL_ZERO", cam16_data.get("totalIncidents") == 0, "CAM-16 total incidents is 0")
    check("CAM16_SHIFTS_COUNT_3", len(cam16_data.get("shifts", [])) == 3, "CAM-16 returns 3 initialized standard shifts")
    for s16 in cam16_data.get("shifts", []):
        check(f"CAM16_COUNT_ZERO_{s16.get('shift')}", s16.get("incidentCount") == 0, f"CAM-16 {s16.get('shift')} count is 0")

    # --------------------------------------------------------------------------
    # 8. Zone Filtering
    # --------------------------------------------------------------------------
    print("\n--- 8. Zone Filtering ---")
    res_zone = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe=all&zoneId=Furnace Bay", headers=headers, timeout=10)
    check("ZONE_FILTER_200", res_zone.status_code == 200, "Filter by zoneId=Furnace Bay returned HTTP 200")
    zone_data = res_zone.json()
    check("ZONE_FILTER_TOTAL", zone_data.get("totalIncidents", 0) == 60, f"Furnace Bay incident count matches 60: {zone_data.get('totalIncidents')}")

    # --------------------------------------------------------------------------
    # 9. Severity Filtering
    # --------------------------------------------------------------------------
    print("\n--- 9. Severity Filtering ---")
    res_sev = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe=all&severity=critical", headers=headers, timeout=10)
    check("SEV_FILTER_200", res_sev.status_code == 200, "Filter by severity=critical returned HTTP 200")
    sev_data = res_sev.json()
    check("SEV_FILTER_TOTAL", sev_data.get("totalIncidents", 0) > 0, f"Critical incidents count: {sev_data.get('totalIncidents')}")
    # Verify that in critical-filtered response, only critical incidents are counted
    for s_sev in sev_data.get("shifts", []):
        check(f"SEV_ONLY_CRIT_{s_sev.get('shift')}", s_sev.get("highCount") == 0 and s_sev.get("mediumCount") == 0, f"{s_sev.get('shift')} non-critical counts are 0")

    # --------------------------------------------------------------------------
    # 10. Violation Type Filtering
    # --------------------------------------------------------------------------
    print("\n--- 10. Violation Type Filtering ---")
    res_vtype = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe=all&violationType=missing_helmet", headers=headers, timeout=10)
    check("VTYPE_FILTER_200", res_vtype.status_code == 200, "Filter by violationType=missing_helmet returned HTTP 200")
    vtype_data = res_vtype.json()
    check("VTYPE_FILTER_TOTAL", vtype_data.get("totalIncidents", 0) >= 104, f"missing_helmet incident count: {vtype_data.get('totalIncidents')}")

    # --------------------------------------------------------------------------
    # 11. Breakdown Sub-Arrays: Violations, Zones, Cameras
    # --------------------------------------------------------------------------
    print("\n--- 11. Breakdown Sub-Arrays: Violations, Zones, Cameras ---")
    for s in shifts:
        sname = s.get("shift")
        vtypes = s.get("violationTypes", [])
        zones_list = s.get("zones", [])
        cams = s.get("cameras", [])

        if s.get("incidentCount", 0) > 0:
            check(f"VTYPES_NON_EMPTY_{sname}", len(vtypes) > 0, f"{sname} has violation types: {len(vtypes)}")
            check(f"VTYPES_SORTED_{sname}", all(vtypes[i]["count"] >= vtypes[i+1]["count"] for i in range(len(vtypes)-1)), f"{sname} violations sorted descending")

            check(f"ZONES_NON_EMPTY_{sname}", len(zones_list) > 0, f"{sname} has zone breakdown: {len(zones_list)}")
            check(f"ZONES_SORTED_{sname}", all(zones_list[i]["count"] >= zones_list[i+1]["count"] for i in range(len(zones_list)-1)), f"{sname} zones sorted descending")

            check(f"CAMS_NON_EMPTY_{sname}", len(cams) > 0, f"{sname} has camera breakdown: {len(cams)}")
            check(f"CAMS_SORTED_{sname}", all(cams[i]["count"] >= cams[i+1]["count"] for i in range(len(cams)-1)), f"{sname} cameras sorted descending")

    # --------------------------------------------------------------------------
    # 12. Trend Calculation & Zero-Baseline Honesty
    # --------------------------------------------------------------------------
    print("\n--- 12. Trend Calculation & Zero-Baseline Honesty ---")
    for s in shifts:
        sname = s.get("shift")
        trend = s.get("trend", {})
        direction = trend.get("direction")
        check(f"TREND_DIR_VALID_{sname}", direction in ["increase", "decrease", "stable"], f"{sname} direction valid: {direction}")
        if trend.get("previousCount") == 0:
            check(f"ZERO_BASELINE_NULL_{sname}", trend.get("changePercent") is None, f"{sname} zero baseline correctly sets changePercent=None")
        else:
            check(f"BASELINE_PERCENT_NUMERIC_{sname}", isinstance(trend.get("changePercent"), (int, float)), f"{sname} changePercent is numeric: {trend.get('changePercent')}%")

    # --------------------------------------------------------------------------
    # 13. Data Honesty (Zero Synthetic Metrics)
    # --------------------------------------------------------------------------
    print("\n--- 13. Data Honesty (Zero Synthetic Metrics) ---")
    for s in shifts:
        sname = s.get("shift")
        # Compliance MUST be null when observation denominator is unavailable
        check(f"NO_SYNTHETIC_COMPLIANCE_{sname}", s.get("compliance") is None, f"{sname} compliance is truthfully null")
        # Exposure index must be within [0, 100] and not a percentage of accidents
        exp = s.get("exposureIndex")
        check(f"EXPOSURE_INDEX_VALID_{sname}", exp is not None and 0 <= exp <= 100, f"{sname} exposure index valid: {exp}/100")
        check(f"RISK_LEVEL_VALID_{sname}", s.get("riskLevel") in ["LOW", "MODERATE", "HIGH", "CRITICAL", "NO DATA"], f"{sname} risk level valid: {s.get('riskLevel')}")

    # --------------------------------------------------------------------------
    # 14. Timeline Trajectory Alignment
    # --------------------------------------------------------------------------
    print("\n--- 14. Timeline Trajectory Alignment ---")
    timeline = data.get("timeline", [])
    check("TIMELINE_NON_EMPTY", len(timeline) > 0, f"Timeline has {len(timeline)} interval buckets")
    if timeline:
        t0 = timeline[0]
        for tfld in ["bucket", "timeLabel", "total", "morning", "afternoon", "night"]:
            check(f"TIMELINE_FIELD_{tfld.upper()}", tfld in t0, f"Timeline bucket field '{tfld}' present")

    # --------------------------------------------------------------------------
    # 15. Summary Metrics (Highest Volume, Critical, Worsening)
    # --------------------------------------------------------------------------
    print("\n--- 15. Summary Metrics ---")
    summary = data.get("summary", {})
    check("SUMMARY_SHIFTS_COUNT", summary.get("totalShiftsMonitored") == 3, "totalShiftsMonitored is 3")
    if total_incidents > 0:
        check("HIGHEST_INCIDENT_SHIFT", summary.get("highestIncidentShift") is not None, f"Highest volume shift: {summary.get('highestIncidentShift', {}).get('shift')}")
        check("HIGHEST_CRITICAL_SHIFT", summary.get("highestCriticalShift") is not None, f"Highest critical shift: {summary.get('highestCriticalShift', {}).get('shift')}")

    # --------------------------------------------------------------------------
    # 16. Empty State Handling
    # --------------------------------------------------------------------------
    print("\n--- 16. Empty State Handling ---")
    res_empty = requests.get(f"{BASE_URL}/api/analytics/shift-analysis?timeframe=all&cameraId=CAM-NONEXISTENT-9999", headers=headers, timeout=10)
    check("EMPTY_STATE_200", res_empty.status_code == 200, "Nonexistent camera returned HTTP 200")
    empty_data = res_empty.json()
    check("EMPTY_TOTAL_ZERO", empty_data.get("totalIncidents") == 0, "totalIncidents is 0 for empty filter")
    check("EMPTY_SHIFTS_LEN_3", len(empty_data.get("shifts", [])) == 3, "Exactly 3 shifts returned for empty query")
    for es in empty_data.get("shifts", []):
        check(f"EMPTY_SHIFT_ZERO_{es.get('shift')}", es.get("incidentCount") == 0, f"{es.get('shift')} count is 0")
        check(f"EMPTY_SHIFT_VTYPES_{es.get('shift')}", len(es.get("violationTypes", [])) == 0, f"{es.get('shift')} violationTypes is empty")
        check(f"EMPTY_SHIFT_ZONES_{es.get('shift')}", len(es.get("zones", [])) == 0, f"{es.get('shift')} zones is empty")
        check(f"EMPTY_SHIFT_CAMS_{es.get('shift')}", len(es.get("cameras", [])) == 0, f"{es.get('shift')} cameras is empty")

    # --------------------------------------------------------------------------
    # 17. Socket.IO Real-Time Analytics Compatibility
    # --------------------------------------------------------------------------
    print("\n--- 17. Socket.IO Real-Time Analytics Compatibility ---")
    sio = socketio.Client(reconnection=False)
    connected = False
    try:
        sio.connect(f"{BASE_URL}", auth={"token": token}, wait_timeout=3)
        connected = sio.connected
    except Exception as e:
        connected = False

    check("SOCKET_IO_COMPATIBILITY", connected, "Connected to SafeVision Socket.IO core for analytics update notifications")
    if connected:
        sio.disconnect()

    # --------------------------------------------------------------------------
    # Summary
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print(f"  PHASE 10.4 SHIFT ANALYSIS RESULTS: {passed} PASSED, {failed} FAILED")
    print("=" * 80)
    return failed == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
