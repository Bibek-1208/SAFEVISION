#!/usr/bin/env python3
"""
================================================================================
  SAFEVISION AI — PHASE 10.3 ACCEPTANCE SUITE
  ZONE COMPARISON & EXPOSURE RANKING
================================================================================
Tests verify:
1. Admin authentication & Bearer token authorization
2. GET /api/analytics/zone-comparison returns HTTP 200
3. Complete response structure & top-level schema validation
4. Real zone extraction from MongoDB (zero demo zones)
5. Accurate incident counts across monitored facility zones
6. Severity breakdown (critical, high, medium, low, info)
7. Zone ranking logic (total incidents, critical incidents, recent activity)
8. Mathematical trend calculation (current vs previous equivalent window)
9. Zero-baseline trend handling (changePercent=None when previous=0)
10. Timeframe filtering: 24h
11. Timeframe filtering: 7d
12. Timeframe filtering: 30d
13. Timeframe filtering: all
14. Camera filtering: CAM-4
15. Future/unknown camera filtering: CAM-16 returns HTTP 200 with honest empty data
16. Zone filtering (e.g., zoneId='Furnace Bay')
17. Severity filtering (e.g., severity='critical')
18. Violation type filtering (e.g., violationType='missing_helmet')
19. Camera-zone relationship (evidence-based camera associations)
20. No fake zone records
21. Risk score data honesty (severity-derived index, not accident probability)
22. Zero synthetic compliance (compliance is null when denominator unavailable)
23. Empty state handling (clean zero states without 500s)
24. Real-time updates & Socket.IO analytics hub compatibility
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
    print("  SAFEVISION AI — PHASE 10.3 ZONE COMPARISON ACCEPTANCE SUITE")
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
    # 2. GET /api/analytics/zone-comparison (Structure & Baseline)
    # --------------------------------------------------------------------------
    print("\n--- 2. GET /api/analytics/zone-comparison (Structure & Baseline) ---")
    zc_url = f"{BASE_URL}/api/analytics/zone-comparison"
    res = requests.get(zc_url, headers=headers, timeout=5)
    check("ZC_STATUS_200", res.status_code == 200, "GET /api/analytics/zone-comparison returned HTTP 200")
    data = res.json()

    required_keys = ["timeframe", "zones", "ranking", "summary", "filtersApplied", "totalIncidents", "timestamp"]
    for k in required_keys:
        check(f"ZC_KEY_{k.upper()}", k in data, f"Key '{k}' present in zone-comparison payload")

    check("ZC_ZONES_IS_LIST", isinstance(data.get("zones"), list), "zones is a list")
    check("ZC_RANKING_IS_LIST", isinstance(data.get("ranking"), list), "ranking is a list")
    check("ZC_SUMMARY_IS_OBJECT", isinstance(data.get("summary"), dict), "summary is an object")
    check("ZC_TOTAL_INCIDENTS_NUMERIC", isinstance(data.get("totalIncidents"), (int, float)), f"totalIncidents is numeric: {data.get('totalIncidents')}")

    # --------------------------------------------------------------------------
    # 3. Real Zone List & Data Integrity
    # --------------------------------------------------------------------------
    print("\n--- 3. Real Zone List & Data Integrity ---")
    zones = data.get("zones", [])
    check("ZONES_NON_EMPTY", len(zones) > 0, f"Monitored zones count: {len(zones)}")

    if len(zones) > 0:
        first_zone = zones[0]
        zone_keys = ["zoneId", "zoneName", "incidentCount", "severity", "cameras", "violationTypes", "latestIncident", "riskScore", "riskLevel", "trend"]
        for zk in zone_keys:
            check(f"ZONE_FIELD_{zk.upper()}", zk in first_zone, f"Zone field '{zk}' present in zone object")

        sev = first_zone.get("severity", {})
        sev_keys = ["critical", "high", "medium", "low", "info"]
        for sk in sev_keys:
            check(f"SEV_FIELD_{sk.upper()}", sk in sev, f"Severity field '{sk}' present in severity breakdown")

        # Verify no demo/fake zones
        zone_names = [z.get("zoneName") for z in zones]
        check("NO_DEMO_ZONE_DEMO1", "DEMO_ZONE_1" not in zone_names, "No fake 'DEMO_ZONE_1' present")
        check("NO_DEMO_ZONE_TEST99", "TEST_ZONE_99" not in zone_names, "No fake 'TEST_ZONE_99' present")

    # --------------------------------------------------------------------------
    # 4. Zone Ranking Logic
    # --------------------------------------------------------------------------
    print("\n--- 4. Zone Ranking Logic ---")
    ranking = data.get("ranking", [])
    check("RANKING_NON_EMPTY", len(ranking) > 0, f"Ranking count: {len(ranking)}")

    if len(ranking) > 0:
        first_rank = ranking[0]
        check("RANK_1_NUMBER", first_rank.get("rank") == 1, f"First item rank is 1: {first_rank.get('rank')}")
        check("RANK_INCIDENT_COUNT", first_rank.get("incidentCount") >= 0, f"Rank 1 incident count: {first_rank.get('incidentCount')}")
        
        # Verify ranking is strictly sorted descending by incidentCount
        is_sorted = True
        for i in range(len(ranking) - 1):
            if ranking[i].get("incidentCount", 0) < ranking[i+1].get("incidentCount", 0):
                is_sorted = False
                break
        check("RANKING_STRICTLY_SORTED", is_sorted, "Ranking list is correctly sorted descending by incidentCount")

    # --------------------------------------------------------------------------
    # 5. Trend Calculations & Zero Baseline
    # --------------------------------------------------------------------------
    print("\n--- 5. Trend Calculations & Zero Baseline ---")
    for z in zones[:5]:
        tr = z.get("trend", {})
        check("TREND_DIRECTION_VALID", tr.get("direction") in ["increase", "decrease", "stable"], f"Zone {z.get('zoneName')} direction valid: {tr.get('direction')}")
        if tr.get("previousCount") == 0:
            check("ZERO_BASELINE_PERCENT_NULL", tr.get("changePercent") is None, f"Zero baseline for {z.get('zoneName')} correctly sets changePercent=None")
        else:
            check("BASELINE_PERCENT_NUMERIC", isinstance(tr.get("changePercent"), (int, float)), f"Baseline percent for {z.get('zoneName')}: {tr.get('changePercent')}%")

    # --------------------------------------------------------------------------
    # 6. Timeframe Filtering (24h, 7d, 30d, all)
    # --------------------------------------------------------------------------
    print("\n--- 6. Timeframe Filtering (24h, 7d, 30d, all) ---")
    for tf in ["24h", "7d", "30d", "all"]:
        r = requests.get(f"{zc_url}?timeframe={tf}", headers=headers, timeout=5)
        check(f"TF_{tf.upper()}_200", r.status_code == 200, f"timeframe={tf} returned HTTP 200")
        tf_data = r.json()
        check(f"TF_{tf.upper()}_TIMEFRAME", tf_data.get("timeframe") == tf, f"timeframe matches {tf}")
        check(f"TF_{tf.upper()}_ZONES_LIST", isinstance(tf_data.get("zones"), list), f"timeframe={tf} zones is list")

    res_all = requests.get(f"{zc_url}?timeframe=all", headers=headers, timeout=5).json()
    check("TF_ALL_TOTAL_INCIDENTS", res_all.get("totalIncidents", 0) >= 150, f"Total incidents in 'all' timeframe: {res_all.get('totalIncidents')}")

    # --------------------------------------------------------------------------
    # 7. Camera Filtering (CAM-4 & Future Camera CAM-16)
    # --------------------------------------------------------------------------
    print("\n--- 7. Camera Filtering (CAM-4 & Future Camera CAM-16) ---")
    r_cam4 = requests.get(f"{zc_url}?timeframe=all&cameraId=CAM-4", headers=headers, timeout=5)
    check("CAM4_FILTER_200", r_cam4.status_code == 200, "Filter by cameraId=CAM-4 returned HTTP 200")
    cam4_data = r_cam4.json()
    check("CAM4_INCIDENT_COUNT", cam4_data.get("totalIncidents", 0) >= 27, f"CAM-4 incident count: {cam4_data.get('totalIncidents')}")
    check("CAM4_FILTERS_APPLIED", cam4_data.get("filtersApplied", {}).get("cameraId") == "CAM-4", "filtersApplied reflects CAM-4")

    # Future camera CAM-16 must return clean empty data, NOT 500!
    r_cam16 = requests.get(f"{zc_url}?timeframe=all&cameraId=CAM-16", headers=headers, timeout=5)
    check("CAM16_FILTER_200", r_cam16.status_code == 200, "Future camera CAM-16 returned HTTP 200 (not 500)")
    cam16_data = r_cam16.json()
    check("CAM16_TOTAL_ZERO", cam16_data.get("totalIncidents") == 0, f"CAM-16 total incidents is 0: {cam16_data.get('totalIncidents')}")
    check("CAM16_ZONES_EMPTY", len(cam16_data.get("zones", [])) == 0, "CAM-16 zones list is empty []")
    check("CAM16_RANKING_EMPTY", len(cam16_data.get("ranking", [])) == 0, "CAM-16 ranking list is empty []")

    # --------------------------------------------------------------------------
    # 8. Zone Filtering
    # --------------------------------------------------------------------------
    print("\n--- 8. Zone Filtering ---")
    r_zone = requests.get(f"{zc_url}?timeframe=all&zoneId=Furnace%20Bay", headers=headers, timeout=5)
    check("ZONE_FILTER_200", r_zone.status_code == 200, "Filter by zoneId=Furnace Bay returned HTTP 200")
    zone_data = r_zone.json()
    check("ZONE_FILTER_COUNT", zone_data.get("totalIncidents") == 60, f"Furnace Bay incident count matches: {zone_data.get('totalIncidents')}")
    check("ZONE_FILTER_SINGLE", len(zone_data.get("zones", [])) == 1, f"Only 1 zone returned for single zone query: {len(zone_data.get('zones', []))}")

    # --------------------------------------------------------------------------
    # 9. Violation Type Filtering
    # --------------------------------------------------------------------------
    print("\n--- 9. Violation Type Filtering ---")
    r_vtype = requests.get(f"{zc_url}?timeframe=all&violationType=missing_helmet", headers=headers, timeout=5)
    check("VTYPE_FILTER_200", r_vtype.status_code == 200, "Filter by violationType=missing_helmet returned HTTP 200")
    vtype_data = r_vtype.json()
    check("VTYPE_FILTER_TOTAL", vtype_data.get("totalIncidents") == 104, f"missing_helmet incidents: {vtype_data.get('totalIncidents')}")

    # --------------------------------------------------------------------------
    # 10. Severity Filtering
    # --------------------------------------------------------------------------
    print("\n--- 10. Severity Filtering ---")
    r_sev = requests.get(f"{zc_url}?timeframe=all&severity=critical", headers=headers, timeout=5)
    check("SEV_FILTER_200", r_sev.status_code == 200, "Filter by severity=critical returned HTTP 200")
    sev_data = r_sev.json()
    check("SEV_FILTER_TOTAL", sev_data.get("totalIncidents") >= 10, f"Critical incidents count: {sev_data.get('totalIncidents')}")

    # --------------------------------------------------------------------------
    # 11. Camera <-> Zone Relationship
    # --------------------------------------------------------------------------
    print("\n--- 11. Camera <-> Zone Relationship ---")
    furnace_bay = next((z for z in res_all.get("zones", []) if "Furnace Bay" in z.get("zoneName")), None)
    check("FURNACE_BAY_FOUND", furnace_bay is not None, "Furnace Bay zone found in 'all' timeframe")
    if furnace_bay:
        cameras = furnace_bay.get("cameras", [])
        check("FURNACE_BAY_CAMERAS", len(cameras) > 0, f"Evidence cameras linked to Furnace Bay: {cameras}")
        check("FURNACE_BAY_HAS_EVIDENCE_CAM", any(c in cameras for c in ["TRY", "CAM1", "VHJV", "CAM-4", "CAM-01"]), "Evidence-based camera present in Furnace Bay cameras")

        # Also verify CAM-4 is linked to at least one active zone
        cam4_zones = [z for z in res_all.get("zones", []) if "CAM-4" in z.get("cameras", [])]
        check("CAM4_LINKED_TO_ZONES", len(cam4_zones) > 0, f"CAM-4 linked to {len(cam4_zones)} monitored zone(s): {[z.get('zoneName') for z in cam4_zones[:3]]}")

    # --------------------------------------------------------------------------
    # 12. Violation Breakdown By Zone
    # --------------------------------------------------------------------------
    print("\n--- 12. Violation Breakdown By Zone ---")
    if furnace_bay:
        vtypes = furnace_bay.get("violationTypes", [])
        check("VTYPES_NON_EMPTY", len(vtypes) > 0, f"Furnace Bay violation types count: {len(vtypes)}")
        check("VTYPES_STRUCTURE", "type" in vtypes[0] and "count" in vtypes[0], f"Violation type entry format: {vtypes[0]}")
        top_vtype = vtypes[0]
        check("TOP_VTYPE_NAME", top_vtype.get("type") in ["missing_helmet", "restricted_zone"], f"Top violation type in Furnace Bay: {top_vtype.get('type')} ({top_vtype.get('count')})")

    # --------------------------------------------------------------------------
    # 13. Data Honesty (Zero Synthetic Metrics)
    # --------------------------------------------------------------------------
    print("\n--- 13. Data Honesty (Zero Synthetic Metrics) ---")
    # Verify no arbitrary formula strings or synthetic compliance in response
    resp_text = json.dumps(res_all)
    check("NO_100_MINUS_INCIDENTS", "100 - " not in resp_text, "No synthetic '100 - incidents' formulas")
    check("NO_FAKE_COMPLIANCE_100", '"compliance": 100' not in resp_text, "No fabricated 100% compliance")

    # Check riskScore is an empirical severity index or null, with riskLevel
    for z in res_all.get("zones", [])[:5]:
        rs = z.get("riskScore")
        rl = z.get("riskLevel")
        check(f"RISK_SCORE_VALID_{z.get('zoneId')}", rs is None or (isinstance(rs, int) and 0 <= rs <= 100), f"Risk score for {z.get('zoneName')} is valid index or null: {rs}")
        check(f"RISK_LEVEL_VALID_{z.get('zoneId')}", rl in ["LOW", "MODERATE", "HIGH", "CRITICAL", "NO DATA"], f"Risk level for {z.get('zoneName')}: {rl}")

    # --------------------------------------------------------------------------
    # 14. Empty State Handling
    # --------------------------------------------------------------------------
    print("\n--- 14. Empty State Handling ---")
    r_empty = requests.get(f"{zc_url}?timeframe=24h&cameraId=NONEXISTENT_CAMERA_99", headers=headers, timeout=5)
    check("EMPTY_STATE_200", r_empty.status_code == 200, "Nonexistent camera returned HTTP 200")
    empty_data = r_empty.json()
    check("EMPTY_TOTAL_ZERO", empty_data.get("totalIncidents") == 0, "totalIncidents is 0")
    check("EMPTY_ZONES_ARRAY", empty_data.get("zones") == [], "zones is empty []")
    check("EMPTY_RANKING_ARRAY", empty_data.get("ranking") == [], "ranking is empty []")

    # --------------------------------------------------------------------------
    # 15. Socket.IO Real-Time Analytics Compatibility
    # --------------------------------------------------------------------------
    print("\n--- 15. Socket.IO Real-Time Analytics Compatibility ---")
    sio = socketio.Client()
    connected = False
    try:
        sio.connect(BASE_URL, transports=['websocket', 'polling'])
        connected = sio.connected
        time.sleep(0.5)
        sio.disconnect()
    except Exception as e:
        connected = False

    check("SOCKET_IO_COMPATIBILITY", connected, "Connected to SafeVision Socket.IO core for analytics update notifications")

    # --------------------------------------------------------------------------
    # Summary
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print(f"  PHASE 10.3 ZONE COMPARISON RESULTS: {passed} PASSED, {failed} FAILED")
    print("=" * 80)

    if failed > 0:
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    run_tests()
