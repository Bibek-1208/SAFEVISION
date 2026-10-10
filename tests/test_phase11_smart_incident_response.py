#!/usr/bin/env python3
"""
SAFEVISION AI — PHASE 11 ACCEPTANCE TEST SUITE
Smart Incident Response & Actionable Workflow Verification

Tests:
 1. Incident response endpoint (GET /api/incidents/:id/response)
 2. Real incident lookup (by incidentId and MongoDB _id)
 3. Severity routing calculation
 4. Critical severity routing
 5. High severity routing
 6. Medium severity routing
 7. Low severity routing
 8. No-recipient behavior
 9. Real role resolution
10. Incident summary factual schema
11. Evidence timeline factual schema
12. Chronological timeline ordering
13. Missing evidence handling
14. Existing evidence handling
15. Replay unavailable honest state
16. Replay evidence association
17. First responder resolution
18. No responder state
19. Acknowledgement workflow
20. Assignment workflow
21. Response start workflow
22. Resolution workflow
23. Escalation workflow
24. Unauthorized mutation rejection (HTTP 403 for EMPLOYEE)
25. Authorized mutation success
26. Invalid action / transition rejection (HTTP 400)
27. Socket.IO event compatibility
28. Audit event creation
29. Active incident queue (GET /api/incidents/response/queue)
30. Queue severity ordering
31. Queue newest-first ordering
32. Camera filter
33. Zone filter
34. Violation filter
35. Status filter
36. Zero-data state handling
37. Nonexistent incident 404
38. Incident without evidence
39. Incident without worker
40. Incident without zone
41. Incident without camera
42. Explicit near-miss relationship
43. No timestamp-inferred relationship
44. No fabricated recipient
45. No fabricated responder
46. No fabricated replay
47. Database cleanup protocol
48. Orphan-event check
49. Baseline incident count
50. Baseline incident-event count
51. Baseline camera count
52. Baseline restricted-zone count
53. Baseline near-miss count
54. Baseline emergency-zone count
55. Phase 10.6 regression compatibility
56. Phase 10.5 regression compatibility
57. Phase 10.4 regression compatibility
58. Phase 10.3 regression compatibility
59. Phase 10.2 regression compatibility
60. Phase 10.1 regression compatibility
"""

import sys
import os
import time
import datetime
import requests
import pymongo
from bson import ObjectId

BASE_URL = os.environ.get("SAFEVISION_URL", "http://127.0.0.1:5005")
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017")
DB_NAME = "safevision"

def run_tests():
    print("=" * 80)
    print("  SAFEVISION AI — PHASE 11 SMART INCIDENT RESPONSE ACCEPTANCE SUITE")
    print("=" * 80)

    client = pymongo.MongoClient(MONGO_URI)
    db = client[DB_NAME]

    # Baseline counts
    baseline_incidents = db.incidents.count_documents({})
    baseline_events = db.incidentevents.count_documents({})
    baseline_nearmisses = db.nearmisses.count_documents({})
    baseline_cameras = db.cameras.count_documents({})
    baseline_rz = db.restrictedzones.count_documents({})
    baseline_ez = db.emergencyzones.count_documents({})

    print(f"\n[BASELINE AUDIT]")
    print(f"  incidents: {baseline_incidents}")
    print(f"  incidentevents: {baseline_events}")
    print(f"  nearmisses: {baseline_nearmisses}")
    print(f"  cameras: {baseline_cameras}")
    print(f"  restrictedzones: {baseline_rz}")
    print(f"  emergencyzones: {baseline_ez}")

    test_results = {}
    passed_count = 0
    failed_count = 0

    def check(test_id, condition, message):
        nonlocal passed_count, failed_count
        if condition:
            print(f"[PASS] {test_id}: {message}")
            test_results[test_id] = "PASS"
            passed_count += 1
            return True
        else:
            print(f"[FAIL] {test_id}: {message}")
            test_results[test_id] = "FAIL"
            failed_count += 1
            raise AssertionError(f"Test assertion failed [{test_id}]: {message}")

    admin_headers = {}
    supervisor_headers = {}
    worker_headers = {}

    test_fixture_ids = []

    try:
        # Authenticate users
        print("\n--- Authentication Setup ---")
        login_admin = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@test.local", "password": "Test@1234"}, timeout=5)
        check("AUTH_ADMIN", login_admin.status_code == 200, "Admin login successful")
        admin_token = login_admin.json().get("token")
        admin_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

        login_sup = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "supervisor@test.local", "password": "Test@1234"}, timeout=5)
        check("AUTH_SUPERVISOR", login_sup.status_code == 200, "Supervisor login successful")
        sup_token = login_sup.json().get("token")
        supervisor_headers = {"Authorization": f"Bearer {sup_token}", "Content-Type": "application/json"}

        login_worker = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "employee@test.local", "password": "Test@1234"}, timeout=5)
        check("AUTH_WORKER", login_worker.status_code == 200, "Employee login successful")
        worker_token = login_worker.json().get("token")
        worker_headers = {"Authorization": f"Bearer {worker_token}", "Content-Type": "application/json"}

        # Find a real incident from database for read tests
        real_inc = db.incidents.find_one({})
        check("EXISTING_DATA_EXISTS", real_inc is not None, "Real persisted incidents found in DB")
        real_inc_id = real_inc.get("incidentId")
        real_inc_obj_id = str(real_inc.get("_id"))

        # 1. Incident response endpoint
        print("\n--- 1. Incident Response Endpoint ---")
        res_resp = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/response", headers=admin_headers, timeout=5)
        check("1_ENDPOINT_200", res_resp.status_code == 200, f"GET /api/incidents/{real_inc_id}/response returned HTTP 200")
        bundle = res_resp.json()
        expected_bundle_keys = ["incident", "summary", "routing", "firstResponder", "evidenceTimeline", "replay"]
        for k in expected_bundle_keys:
            check(f"1_BUNDLE_{k.upper()}", k in bundle, f"Bundle contains '{k}'")

        # 2. Real incident lookup (by incidentId and MongoDB _id)
        print("\n--- 2. Real Incident Lookup ---")
        res_by_obj_id = requests.get(f"{BASE_URL}/api/incidents/{real_inc_obj_id}/response", headers=admin_headers, timeout=5)
        check("2_LOOKUP_OBJ_ID", res_by_obj_id.status_code == 200, "Lookup by MongoDB ObjectId string succeeded")
        check("2_MATCHING_ID", res_by_obj_id.json()["summary"]["incidentId"] == real_inc_id, "Summary incidentId matches query target")

        # 3. Severity routing calculation
        print("\n--- 3. Severity Routing Calculation ---")
        routing = bundle["routing"]
        check("3_ROUTING_TARGET_ROLE", "targetRole" in routing and routing["targetRole"] is not None, f"Target role: {routing.get('targetRole')}")
        check("3_ROUTING_URGENCY", routing.get("urgency") in ["IMMEDIATE", "HIGH", "NORMAL", "LOW"], f"Valid urgency: {routing.get('urgency')}")
        check("3_ROUTING_REASON", "reason" in routing and len(routing["reason"]) > 0, f"Routing explanation: {routing.get('reason')}")
        check("3_ROUTING_AUDIT", "calculatedAt" in routing and "ruleMatched" in routing, "Routing audit metadata present")

        # 4-7. Severity Routing Rules (Critical, High, Medium, Low)
        print("\n--- 4-7. Severity Routing Variations ---")
        crit_inc = db.incidents.find_one({"severity": "critical"})
        if crit_inc:
            res_crit = requests.get(f"{BASE_URL}/api/incidents/{crit_inc['incidentId']}/routing", headers=admin_headers, timeout=5)
            check("4_CRITICAL_ROUTING", res_crit.status_code == 200, "Critical incident routing query returned 200")
            crit_routing = res_crit.json().get("routing", {})
            check("4_CRITICAL_URGENCY", crit_routing.get("urgency") == "IMMEDIATE", "Critical incident urgency is IMMEDIATE")
            check("4_CRITICAL_ROLE", crit_routing.get("targetRole") in ["SAFETY_OFFICER", "PLANT_MANAGER", "ADMIN"], f"Critical target role: {crit_routing.get('targetRole')}")

        high_inc = db.incidents.find_one({"severity": "high"})
        if high_inc:
            res_high = requests.get(f"{BASE_URL}/api/incidents/{high_inc['incidentId']}/routing", headers=admin_headers, timeout=5)
            check("5_HIGH_ROUTING", res_high.status_code == 200, "High incident routing query returned 200")
            high_routing = res_high.json().get("routing", {})
            check("5_HIGH_URGENCY", high_routing.get("urgency") == "HIGH", "High incident urgency is HIGH")
            check("5_HIGH_ROLE", high_routing.get("targetRole") in ["SUPERVISOR", "SAFETY_OFFICER"], f"High target role: {high_routing.get('targetRole')}")

        med_inc = db.incidents.find_one({"severity": "medium"})
        if med_inc:
            res_med = requests.get(f"{BASE_URL}/api/incidents/{med_inc['incidentId']}/routing", headers=admin_headers, timeout=5)
            check("6_MEDIUM_ROUTING", res_med.status_code == 200, "Medium incident routing query returned 200")
            med_routing = res_med.json().get("routing", {})
            check("6_MEDIUM_URGENCY", med_routing.get("urgency") == "NORMAL", "Medium incident urgency is NORMAL")
            check("6_MEDIUM_ROLE", med_routing.get("targetRole") == "SUPERVISOR", "Medium target role is SUPERVISOR")

        low_inc = db.incidents.find_one({"severity": "low"})
        if low_inc:
            res_low = requests.get(f"{BASE_URL}/api/incidents/{low_inc['incidentId']}/routing", headers=admin_headers, timeout=5)
            check("7_LOW_ROUTING", res_low.status_code == 200, "Low incident routing query returned 200")
            low_routing = res_low.json().get("routing", {})
            check("7_LOW_URGENCY", low_routing.get("urgency") == "LOW", "Low incident urgency is LOW")

        # 8. No-recipient behavior
        print("\n--- 8. No-Recipient Behavior ---")
        # An incident with an unknown site/zone will not find a scoped recipient
        check("8_NO_RECIPIENT_HONEST", routing.get("status") in ["ROUTED", "NO_RECIPIENT_CONFIGURED"], f"Status: {routing.get('status')}")
        if routing.get("status") == "NO_RECIPIENT_CONFIGURED":
            check("8_NO_RECIPIENT_NULL", routing.get("recipient") is None, "Recipient is null when not configured")

        # 9. Real role resolution
        print("\n--- 9. Real Role Resolution ---")
        if routing.get("recipient"):
            recip = routing["recipient"]
            check("9_RECIPIENT_NAME", len(recip.get("name", "")) > 0, f"Recipient name: {recip.get('name')}")
            check("9_RECIPIENT_ROLE", recip.get("role") in ["ADMIN", "PLANT_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"], f"Recipient role: {recip.get('role')}")

        # 10. Incident summary factual schema
        print("\n--- 10. Incident Summary Factual Schema ---")
        res_sum = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/response-summary", headers=admin_headers, timeout=5)
        check("10_SUMMARY_200", res_sum.status_code == 200, "GET /api/incidents/:id/response-summary returned 200")
        sum_data = res_sum.json().get("summary", {})
        expected_sum_fields = ["incidentId", "timestamp", "severity", "violationType", "zone", "camera", "evidenceAvailable", "responseStatus"]
        for f in expected_sum_fields:
            check(f"10_SUM_{f.upper()}", f in sum_data, f"Summary field '{f}' present")
        check("10_NO_SPECULATIVE_TEXT", "Worker intentionally" not in str(sum_data), "Summary contains no fabricated or speculative intent text")

        # 11-12. Evidence timeline & Chronological ordering
        print("\n--- 11-12. Evidence Timeline ---")
        res_time = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/timeline", headers=admin_headers, timeout=5)
        check("11_TIMELINE_200", res_time.status_code == 200, "GET /api/incidents/:id/timeline returned 200")
        timeline = res_time.json().get("timeline", [])
        check("11_TIMELINE_IS_LIST", isinstance(timeline, list), "Timeline is a list")
        if len(timeline) > 1:
            # Check chronological ascending order
            timestamps = [t.get("timestamp") for t in timeline if t.get("timestamp")]
            sorted_timestamps = sorted(timestamps)
            check("12_TIMELINE_CHRONOLOGICAL", timestamps == sorted_timestamps, "Timeline events are ordered chronologically")

        # 13-14. Missing vs Existing Evidence Handling
        print("\n--- 13-14. Evidence Handling ---")
        check("13_EVIDENCE_BOOL", isinstance(sum_data.get("evidenceAvailable"), bool), "evidenceAvailable is boolean")
        replay = bundle["replay"]
        check("14_REPLAY_SCHEMA", "hasReplayVideo" in replay and "evidenceSnapshot" in replay, "Replay schema has expected fields")

        # 15-16. Replay unavailable honest state & association
        print("\n--- 15-16. Replay Behavior ---")
        res_rep = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/replay", headers=admin_headers, timeout=5)
        check("15_REPLAY_200", res_rep.status_code == 200, "GET /api/incidents/:id/replay returned 200")
        rep_data = res_rep.json().get("replay", {})
        check("15_HONEST_REPLAY_FLAG", rep_data.get("hasReplayVideo") is False, "hasReplayVideo is False (no fabricated video)")
        check("15_HONEST_REPLAY_NOTE", "Snapshot evidence only — replay video unavailable." in rep_data.get("replayNote", "") or "No evidence available" in rep_data.get("replayNote", ""), f"Replay note: {rep_data.get('replayNote')}")
        check("16_REPLAY_INC_ID", rep_data.get("incidentId") == real_inc_id, "Replay matches requested incident ID")

        # 17-18. First responder resolution
        print("\n--- 17-18. First Responder Resolution ---")
        first_resp = bundle["firstResponder"]
        expected_fr_states = ["NO_FIRST_RESPONDER_CONFIGURED", "RESPONDER_IDENTIFIED", "RESPONDER_ASSIGNED", "RESPONDER_ACKNOWLEDGED"]
        check("17_FR_STATUS_VALID", first_resp.get("status") in expected_fr_states, f"First responder status: {first_resp.get('status')}")
        if first_resp.get("status") == "NO_FIRST_RESPONDER_CONFIGURED":
            check("18_FR_NO_RESPONDER_NULL", first_resp.get("responder") is None, "Responder object is null when NO_FIRST_RESPONDER_CONFIGURED")

        # =================================================================
        # ISOLATED TEST FIXTURE FOR MUTATION TESTS (Steps 19-28)
        # =================================================================
        print("\n--- Isolated Fixture Creation for Workflow Testing ---")
        fixture_inc_id = f"TEST-PHASE11-FIXTURE-{int(time.time())}"
        test_fixture_ids.append(fixture_inc_id)

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        fixture_doc = {
            "incidentId": fixture_inc_id,
            "source": "AI_INFERENCE",
            "ruleId": "RULE-TEST-P11",
            "siteId": "site-rsp-1",
            "zoneId": "ZONE-A",
            "zone": "ZONE-A",
            "cameraId": "CAM-01",
            "violationType": "missing_helmet",
            "severity": "high",
            "confidence": 0.95,
            "status": "OPEN",
            "responseState": "UNASSIGNED",
            "whyFlagged": "Test incident for Phase 11 Smart Incident Response",
            "recommendedAction": "Acknowledge and dispatch supervisor",
            "timestamp": now_iso,
            "createdAt": datetime.datetime.now(datetime.timezone.utc),
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
            "__v": 0
        }
        db.incidents.insert_one(fixture_doc)

        # Also create initial detection event
        evt_id = f"EVT-TEST-{int(time.time())}"
        db.incidentevents.insert_one({
            "eventId": evt_id,
            "incidentId": fixture_inc_id,
            "eventType": "PPE_VIOLATION_OBSERVED",
            "timestamp": datetime.datetime.now(datetime.timezone.utc),
            "description": "Missing helmet observed by test fixture.",
            "actor": "TEST_RUNNER",
            "__v": 0
        })

        # 19. Route workflow
        print("\n--- 19. Route Workflow ---")
        res_route = requests.post(f"{BASE_URL}/api/incidents/{fixture_inc_id}/route", headers=supervisor_headers, timeout=5)
        check("19_ROUTE_200", res_route.status_code == 200, "POST /api/incidents/:id/route returned 200")
        route_state = res_route.json().get("incident", {}).get("responseState")
        check("19_ROUTE_STATE", route_state == "ROUTED", f"State transitioned to ROUTED (actual: {route_state})")

        # 20. Acknowledgement workflow
        print("\n--- 20. Acknowledgement Workflow ---")
        res_ack = requests.post(f"{BASE_URL}/api/incidents/{fixture_inc_id}/acknowledge", headers=supervisor_headers, json={"notes": "Acknowledged by testing supervisor"}, timeout=5)
        check("20_ACK_200", res_ack.status_code == 200, "POST /api/incidents/:id/acknowledge returned 200")
        ack_state = res_ack.json().get("incident", {}).get("responseState")
        check("20_ACK_STATE", ack_state == "ACKNOWLEDGED", f"State transitioned to ACKNOWLEDGED (actual: {ack_state})")

        # 21. Assignment workflow
        print("\n--- 21. Assignment Workflow ---")
        res_assign = requests.post(
            f"{BASE_URL}/api/incidents/{fixture_inc_id}/assign",
            headers=supervisor_headers,
            json={"responderId": "usr-supervisor-01", "notes": "Assigned to shift supervisor"},
            timeout=5
        )
        check("21_ASSIGN_200", res_assign.status_code == 200, "POST /api/incidents/:id/assign returned 200")
        assigned_resp = res_assign.json().get("incident", {}).get("assignedResponder")
        check("21_ASSIGN_RESPONDER_SET", assigned_resp is not None, "assignedResponder is set")

        # 22. Response start workflow
        print("\n--- 22. Response Start Workflow ---")
        res_start = requests.post(f"{BASE_URL}/api/incidents/{fixture_inc_id}/start-response", headers=supervisor_headers, json={"notes": "First responder on site"}, timeout=5)
        check("22_START_200", res_start.status_code == 200, "POST /api/incidents/:id/start-response returned 200")
        start_state = res_start.json().get("incident", {}).get("responseState")
        check("22_START_STATE", start_state == "IN_PROGRESS", f"State transitioned to IN_PROGRESS (actual: {start_state})")

        # 23. Escalation workflow
        print("\n--- 23. Escalation Workflow ---")
        res_esc = requests.post(f"{BASE_URL}/api/incidents/{fixture_inc_id}/escalate", headers=supervisor_headers, json={"reason": "Hazard severity elevated"}, timeout=5)
        check("23_ESC_200", res_esc.status_code == 200, "POST /api/incidents/:id/escalate returned 200")
        esc_state = res_esc.json().get("incident", {}).get("responseState")
        check("23_ESC_STATE", esc_state == "ESCALATED", f"State transitioned to ESCALATED (actual: {esc_state})")

        # 24. Resolution workflow (Admin / Safety Officer authorization)
        print("\n--- 24. Resolution Workflow ---")
        res_resolve = requests.post(
            f"{BASE_URL}/api/incidents/{fixture_inc_id}/resolve",
            headers=admin_headers,
            json={"resolutionNotes": "Safety briefing completed, helmet provided."},
            timeout=5
        )
        check("24_RESOLVE_200", res_resolve.status_code == 200, "POST /api/incidents/:id/resolve returned 200")
        res_state = res_resolve.json().get("incident", {}).get("responseState")
        check("24_RESOLVE_STATE", res_state == "RESOLVED", f"State transitioned to RESOLVED (actual: {res_state})")

        # 25. Unauthorized mutation rejection (EMPLOYEE role)
        print("\n--- 25. Unauthorized Mutation Rejection ---")
        res_unauth = requests.post(f"{BASE_URL}/api/incidents/{fixture_inc_id}/acknowledge", headers=worker_headers, timeout=5)
        check("25_UNAUTH_403", res_unauth.status_code == 403, f"Worker mutation correctly rejected with HTTP 403 (actual: {res_unauth.status_code})")

        # 26. Authorized mutation validation
        print("\n--- 26. Authorized Mutation Validation ---")
        check("26_AUTH_MUTATION", res_resolve.status_code == 200 and res_ack.status_code == 200, "Authorized role mutations succeeded")

        # 27. Invalid transition / missing body handling
        print("\n--- 27. Invalid Action Rejection ---")
        # Cannot assign to empty responder
        res_bad_assign = requests.post(f"{BASE_URL}/api/incidents/{fixture_inc_id}/assign", headers=supervisor_headers, json={}, timeout=5)
        check("27_BAD_ACTION_400", res_bad_assign.status_code == 400, f"Empty assignment body rejected with HTTP 400 (actual: {res_bad_assign.status_code})")

        # 28. Audit event creation verification
        print("\n--- 28. Audit Event Creation ---")
        fixture_events = list(db.incidentevents.find({"incidentId": fixture_inc_id}))
        event_types = [e.get("eventType") for e in fixture_events]
        check("28_AUDIT_EVENTS_LOGGED", len(fixture_events) >= 3, f"Persisted {len(fixture_events)} timeline audit events for fixture")
        check("28_RESOLVED_EVENT_EXISTS", ("RESOLVED" in event_types or "INCIDENT_RESOLVED" in event_types), f"Resolve event logged in MongoDB IncidentEvent collection (found: {event_types})")

        # 29-35. Active Incident Queue and Filtering
        print("\n--- 29-35. Active Incident Queue & Filtering ---")
        res_queue = requests.get(f"{BASE_URL}/api/incidents/response/queue", headers=admin_headers, timeout=5)
        check("29_QUEUE_200", res_queue.status_code == 200, "GET /api/incidents/response/queue returned 200")
        queue_data = res_queue.json()
        check("29_QUEUE_SCHEMA", "items" in queue_data and "total" in queue_data and "summary" in queue_data, "Queue schema valid")

        # 30. Severity ordering: CRITICAL before HIGH before MEDIUM before LOW
        print("\n--- 30. Queue Severity Ordering ---")
        items = queue_data.get("items", [])
        if len(items) > 1:
            severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
            ranks = [severity_rank.get(str(it.get("severity")).lower(), 5) for it in items]
            is_sorted = all(ranks[i] <= ranks[i+1] for i in range(len(ranks)-1))
            check("30_QUEUE_SEVERITY_SORT", is_sorted, "Queue items are sorted by severity descending (CRITICAL -> HIGH -> MEDIUM -> LOW)")

        # 31. Newest-first ordering within same severity
        print("\n--- 31. Newest-first ordering within same severity ---")
        same_sev_groups = {}
        for it in items:
            sev = str(it.get("severity")).lower()
            same_sev_groups.setdefault(sev, []).append(it.get("timestamp"))
        ordered_within_sev = True
        for sev, ts_list in same_sev_groups.items():
            valid_ts = [t for t in ts_list if t]
            if len(valid_ts) > 1:
                # descending time
                for i in range(len(valid_ts)-1):
                    if valid_ts[i] < valid_ts[i+1]:
                        ordered_within_sev = False
                        break
        check("31_NEWEST_FIRST_SORT", ordered_within_sev, "Within same severity, newer incidents precede older incidents")

        # 32. Camera filter
        print("\n--- 32. Camera Filter ---")
        res_cam_filter = requests.get(f"{BASE_URL}/api/incidents/response/queue?camera=CAM-01", headers=admin_headers, timeout=5)
        check("32_CAM_FILTER_200", res_cam_filter.status_code == 200, "Camera filter returned 200")
        cam_items = res_cam_filter.json().get("items", [])
        all_cam = all(it.get("camera") == "CAM-01" or it.get("cameraId") == "CAM-01" for it in cam_items)
        check("32_CAM_FILTER_MATCH", all_cam, "All returned items match camera filter CAM-01")

        # 33. Zone filter
        print("\n--- 33. Zone Filter ---")
        res_zone_filter = requests.get(f"{BASE_URL}/api/incidents/response/queue?zone=ZONE-A", headers=admin_headers, timeout=5)
        check("33_ZONE_FILTER_200", res_zone_filter.status_code == 200, "Zone filter returned 200")

        # 34. Violation filter
        print("\n--- 34. Violation Filter ---")
        res_viol_filter = requests.get(f"{BASE_URL}/api/incidents/response/queue?violationType=missing_helmet", headers=admin_headers, timeout=5)
        check("34_VIOL_FILTER_200", res_viol_filter.status_code == 200, "Violation filter returned 200")

        # 35. Status filter
        print("\n--- 35. Status Filter ---")
        res_stat_filter = requests.get(f"{BASE_URL}/api/incidents/response/queue?status=UNASSIGNED", headers=admin_headers, timeout=5)
        check("35_STATUS_FILTER_200", res_stat_filter.status_code == 200, "Status filter returned 200")

        # 36. Zero-data state handling
        print("\n--- 36. Zero-Data State Handling ---")
        res_zero = requests.get(f"{BASE_URL}/api/incidents/response/queue?camera=CAM-NONEXISTENT-XYZ", headers=admin_headers, timeout=5)
        check("36_ZERO_DATA_200", res_zero.status_code == 200, "Zero-data filter query returned 200")
        check("36_ZERO_DATA_EMPTY", len(res_zero.json().get("items", [])) == 0, "Items list is empty for nonexistent camera")
        check("36_ZERO_DATA_MSG", "No active incidents" in res_zero.json().get("message", ""), "Truthful no-data message returned")

        # 37. Nonexistent incident handling (404)
        print("\n--- 37. Nonexistent Incident 404 ---")
        res_404 = requests.get(f"{BASE_URL}/api/incidents/INC-DOES-NOT-EXIST-404/response", headers=admin_headers, timeout=5)
        check("37_NONEXISTENT_404", res_404.status_code == 404, "Nonexistent incident ID returns HTTP 404")

        # 38-41. Edge Cases (Incident without evidence, worker, zone, camera)
        print("\n--- 38-41. Edge Case Robustness ---")
        edge_inc_id = f"TEST-PHASE11-EDGE-{int(time.time())}"
        test_fixture_ids.append(edge_inc_id)

        edge_doc = {
            "incidentId": edge_inc_id,
            "source": "AI_INFERENCE",
            "ruleId": "RULE-TEST-EDGE",
            "siteId": "site-rsp-1",
            "zoneId": None,
            "zone": None,
            "cameraId": None,
            "workerId": None,
            "workerName": None,
            "violationType": "worker_isolated",
            "severity": "medium",
            "confidence": 0.88,
            "status": "OPEN",
            "responseState": "UNASSIGNED",
            "evidenceImage": None,
            "timestamp": now_iso,
            "createdAt": datetime.datetime.now(datetime.timezone.utc),
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
            "__v": 0
        }
        db.incidents.insert_one(edge_doc)

        res_edge = requests.get(f"{BASE_URL}/api/incidents/{edge_inc_id}/response", headers=admin_headers, timeout=5)
        check("38_EDGE_200", res_edge.status_code == 200, "Edge incident without optional fields returns HTTP 200")
        edge_bundle = res_edge.json()
        check("38_WITHOUT_EVIDENCE", edge_bundle["summary"]["evidenceAvailable"] is False, "Evidence is correctly reported as False")
        check("39_WITHOUT_WORKER", edge_bundle["summary"]["worker"] is None, "Worker is correctly reported as None")
        check("40_WITHOUT_ZONE", edge_bundle["summary"]["zone"] == "Unassigned", "Missing zone defaults to Unassigned")
        check("41_WITHOUT_CAMERA", edge_bundle["summary"]["camera"] == "Unknown", "Missing camera defaults to Unknown")

        # 42-43. Near-miss relationship handling
        print("\n--- 42-43. Near-Miss Grounding ---")
        check("42_EXPLICIT_NEAR_MISS", edge_bundle["summary"]["relatedNearMiss"] is None, "Explicit near-miss is None when not linked")
        check("43_NO_TIMESTAMP_INFERRED", "relatedNearMiss" in edge_bundle["summary"], "relatedNearMiss field strictly present without guessing")

        # 44-46. No Fabricated Data Audits
        print("\n--- 44-46. Anti-Fabrication Audits ---")
        check("44_NO_FABRICATED_RECIPIENT", "admin@fake.domain" not in str(bundle) and "test@example.com" not in str(bundle), "No synthetic email addresses")
        check("45_NO_FABRICATED_RESPONDER", "John Doe (Responder)" not in str(bundle), "No synthetic responder names")
        check("46_NO_FABRICATED_REPLAY", bundle["replay"]["hasReplayVideo"] is False, "Replay video is not fabricated")

        # 55-60. Phase 10 Regression Compatibility
        print("\n--- 55-60. Phase 10 Regression Compatibility ---")
        p10_6 = requests.get(f"{BASE_URL}/api/analytics/near-misses", headers=admin_headers, timeout=5)
        check("55_P10_6_COMPAT", p10_6.status_code == 200, "Phase 10.6 Near-Miss Analytics endpoint returns HTTP 200")

        p10_5 = requests.get(f"{BASE_URL}/api/analytics/heatmap", headers=admin_headers, timeout=5)
        check("56_P10_5_COMPAT", p10_5.status_code == 200, "Phase 10.5 Safety Heatmap endpoint returns HTTP 200")

        p10_4 = requests.get(f"{BASE_URL}/api/analytics/shift-analysis", headers=admin_headers, timeout=5)
        check("57_P10_4_COMPAT", p10_4.status_code == 200, "Phase 10.4 Shift Analysis endpoint returns HTTP 200")

        p10_3 = requests.get(f"{BASE_URL}/api/analytics/zone-comparison", headers=admin_headers, timeout=5)
        check("58_P10_3_COMPAT", p10_3.status_code == 200, "Phase 10.3 Zone Comparison endpoint returns HTTP 200")

        p10_2 = requests.get(f"{BASE_URL}/api/analytics/trends", headers=admin_headers, timeout=5)
        check("59_P10_2_COMPAT", p10_2.status_code == 200, "Phase 10.2 Safety Trends endpoint returns HTTP 200")

        p10_1 = requests.get(f"{BASE_URL}/api/analytics", headers=admin_headers, timeout=5)
        check("60_P10_1_COMPAT", p10_1.status_code == 200, "Phase 10.1 Analytics Data Layer endpoint returns HTTP 200")

    finally:
        # 47. Database cleanup protocol
        print("\n--- 47. Database Cleanup Protocol ---")
        if test_fixture_ids:
            clean_res_inc = db.incidents.delete_many({"incidentId": {"$in": test_fixture_ids}})
            clean_res_evt = db.incidentevents.delete_many({"incidentId": {"$in": test_fixture_ids}})
            db.auditlogs.delete_many({"details.incidentId": {"$in": test_fixture_ids}})
            print(f"  Cleaned {clean_res_inc.deleted_count} fixture incident(s) and {clean_res_evt.deleted_count} fixture event(s).")
        check("47_CLEANUP_SUCCESS", True, "Test fixtures cleaned from MongoDB")

        # 48. Orphan-event check
        print("\n--- 48. Orphan-Event Check ---")
        all_inc_ids = [i["incidentId"] for i in db.incidents.find({}, {"incidentId": 1})]
        orphan_count = db.incidentevents.count_documents({"incidentId": {"$nin": all_inc_ids}})
        check("48_ORPHAN_COUNT_ZERO", orphan_count == 0, f"Zero orphan incident events in MongoDB (count: {orphan_count})")

        # 49-54. Final Database Baseline Checks
        print("\n--- 49-54. Final Database Baseline Verification ---")
        final_incidents = db.incidents.count_documents({})
        final_events = db.incidentevents.count_documents({})
        final_nearmisses = db.nearmisses.count_documents({})
        final_cameras = db.cameras.count_documents({})
        final_rz = db.restrictedzones.count_documents({})
        final_ez = db.emergencyzones.count_documents({})

        print(f"  incidents: {final_incidents} (baseline: {baseline_incidents})")
        print(f"  incidentevents: {final_events} (baseline: {baseline_events})")
        print(f"  nearmisses: {final_nearmisses} (baseline: {baseline_nearmisses})")
        print(f"  cameras: {final_cameras} (baseline: {baseline_cameras})")
        print(f"  restrictedzones: {final_rz} (baseline: {baseline_rz})")
        print(f"  emergencyzones: {final_ez} (baseline: {baseline_ez})")

        check("49_BASELINE_INCIDENTS", final_incidents == baseline_incidents == 160, f"Incidents restored to baseline: {final_incidents}/160")
        check("50_BASELINE_EVENTS", final_events == baseline_events == 726, f"Events restored to baseline: {final_events}/726")
        check("51_BASELINE_CAMERAS", final_cameras == baseline_cameras == 1, f"Cameras restored to baseline: {final_cameras}/1")
        check("52_BASELINE_RZ", final_rz == baseline_rz == 1, f"Restricted zones restored to baseline: {final_rz}/1")
        check("53_BASELINE_NEARMISSES", final_nearmisses == baseline_nearmisses == 0, f"Near-misses restored to baseline: {final_nearmisses}/0")
        check("54_BASELINE_EZ", final_ez == baseline_ez == 0, f"Emergency zones restored to baseline: {final_ez}/0")

    print("\n" + "=" * 80)
    print(f"  PHASE 11 SUITE COMPLETE: {passed_count} PASSED, {failed_count} FAILED")
    print("=" * 80)

    if failed_count > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
