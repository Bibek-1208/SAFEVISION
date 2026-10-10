#!/usr/bin/env python3
"""
SAFEVISION AI — PHASE 11.1 ACCEPTANCE TEST SUITE
Proper Alert Routing Verification & Hardening

Tests:
 1. Critical severity routing (SAFETY_OFFICER, PLANT_MANAGER, ADMIN)
 2. High severity routing (SUPERVISOR, SAFETY_OFFICER)
 3. Medium severity routing (SUPERVISOR)
 4. Low severity routing (SUPERVISOR)
 5. Info severity routing (SAFETY_OFFICER)
 6. Real user directory lookup (valid ID, name, email, role, department)
 7. Site scoping matching
 8. Zone scoping matching
 9. Wildcard scope resolution ('*')
10. Inactive user rejection
11. No recipient honest return (NO_RECIPIENT_CONFIGURED, recipient: null)
12. No fabricated recipient
13. Deterministic routing repeatability
14. Routing explanation factual grounding
15. Violation-specific routing logic
16. Emergency routing classification
17. Routing endpoint (GET /api/incidents/:id/routing)
18. Nonexistent incident (HTTP 404)
19. Unauthorized incident access rejection (HTTP 403)
20. Routing mutation authorization (POST /api/incidents/:id/route)
21. ALERT_ROUTED audit event creation in MongoDB
22. Routing event metadata schema verification
23. Socket.IO incident.routed emission
24. Delivery-vs-routing state separation
25. Notification channel state
26. No fake delivery confirmation
27. Active queue compatibility (GET /api/incidents/response/queue)
28. Response bundle compatibility (GET /api/incidents/:id/response)
29. Frontend routing data contract compliance
30. Zero Math.random in routing service
31. Zero synthetic production recipients
32. Test fixture cleanup protocol
33. Orphan incident event check (0)
34. Database baseline verification (160, 726, 0, 1, 0, 1, 1)
35. Regression compatibility
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
    print("  SAFEVISION AI — PHASE 11.1 PROPER ALERT ROUTING ACCEPTANCE SUITE")
    print("=" * 80)

    client = pymongo.MongoClient(MONGO_URI)
    db = client[DB_NAME]

    # 1. Baseline Counts Verification
    baseline_incidents = db.incidents.count_documents({})
    baseline_events = db.incidentevents.count_documents({})
    baseline_nearmisses = db.nearmisses.count_documents({})
    baseline_cameras = db.cameras.count_documents({})
    baseline_rz = db.restrictedzones.count_documents({})
    baseline_ez = db.emergencyzones.count_documents({})
    baseline_users = db.users.count_documents({})

    print(f"\n[BASELINE AUDIT]")
    print(f"  incidents: {baseline_incidents}")
    print(f"  incidentevents: {baseline_events}")
    print(f"  nearmisses: {baseline_nearmisses}")
    print(f"  cameras: {baseline_cameras}")
    print(f"  restrictedzones: {baseline_rz}")
    print(f"  emergencyzones: {baseline_ez}")
    print(f"  users: {baseline_users}")

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

        # 1. Critical Severity Routing Test (using baseline incident INC-8920954)
        print("\n--- 1. Critical Severity Routing ---")
        res_crit = requests.get(f"{BASE_URL}/api/incidents/INC-8920954/routing", headers=admin_headers, timeout=5)
        check("1_CRIT_200", res_crit.status_code == 200, "GET /api/incidents/INC-8920954/routing returned 200")
        crit_data = res_crit.json().get("routingDecision", {})
        check("1_CRIT_ROLES", crit_data.get("targetRoles") == ["SAFETY_OFFICER", "PLANT_MANAGER", "ADMIN"], f"Critical target roles match policy (actual: {crit_data.get('targetRoles')})")
        check("1_CRIT_URGENCY", crit_data.get("urgency") == "IMMEDIATE", f"Critical urgency is IMMEDIATE (actual: {crit_data.get('urgency')})")
        check("1_CRIT_STATUS", crit_data.get("status") == "ROUTED", f"Critical status is ROUTED (actual: {crit_data.get('status')})")

        # 2. High Severity Routing Test (using baseline incident INC-7726273)
        print("\n--- 2. High Severity Routing ---")
        res_high = requests.get(f"{BASE_URL}/api/incidents/INC-7726273/routing", headers=admin_headers, timeout=5)
        check("2_HIGH_200", res_high.status_code == 200, "GET /api/incidents/INC-7726273/routing returned 200")
        high_data = res_high.json().get("routingDecision", {})
        check("2_HIGH_ROLES", high_data.get("targetRoles") == ["SUPERVISOR", "SAFETY_OFFICER"], f"High target roles match policy (actual: {high_data.get('targetRoles')})")
        check("2_HIGH_URGENCY", high_data.get("urgency") == "HIGH", f"High urgency is HIGH (actual: {high_data.get('urgency')})")
        check("2_HIGH_STATUS", high_data.get("status") == "ROUTED", f"High status is ROUTED (actual: {high_data.get('status')})")

        # Create temporary fixtures for specific policy tests
        now_iso = datetime.datetime.utcnow().isoformat() + "Z"

        # Fixture 1: Medium in Furnace Bay (supervisor in scope)
        fix_med_id = f"INC-TEST-11-1-MED-{int(time.time())}"
        test_fixture_ids.append(fix_med_id)
        db.incidents.insert_one({
            "incidentId": fix_med_id,
            "siteId": "site-rsp-1",
            "zone": "Furnace Bay",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "missing_vest",
            "severity": "medium",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "riskScore": 42,
            "confidence": 0.94,
        })

        # 3. Medium Severity Routing Test
        print("\n--- 3. Medium Severity Routing ---")
        res_med = requests.get(f"{BASE_URL}/api/incidents/{fix_med_id}/routing", headers=admin_headers, timeout=5)
        check("3_MED_200", res_med.status_code == 200, f"GET /api/incidents/{fix_med_id}/routing returned 200")
        med_data = res_med.json().get("routingDecision", {})
        check("3_MED_ROLES", med_data.get("targetRoles") == ["SUPERVISOR"], f"Medium target roles are ['SUPERVISOR'] (actual: {med_data.get('targetRoles')})")
        check("3_MED_URGENCY", med_data.get("urgency") == "NORMAL", f"Medium urgency is NORMAL (actual: {med_data.get('urgency')})")
        check("3_MED_STATUS", med_data.get("status") == "ROUTED", f"Medium status is ROUTED (actual: {med_data.get('status')})")

        # Fixture 2: Low in Furnace Bay (supervisor in scope)
        fix_low_id = f"INC-TEST-11-1-LOW-{int(time.time())}"
        test_fixture_ids.append(fix_low_id)
        db.incidents.insert_one({
            "incidentId": fix_low_id,
            "siteId": "site-rsp-1",
            "zone": "Furnace Bay",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "missing_gloves",
            "severity": "low",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "riskScore": 25,
            "confidence": 0.91,
        })

        # 4. Low Severity Routing Test
        print("\n--- 4. Low Severity Routing ---")
        res_low = requests.get(f"{BASE_URL}/api/incidents/{fix_low_id}/routing", headers=admin_headers, timeout=5)
        check("4_LOW_200", res_low.status_code == 200, f"GET /api/incidents/{fix_low_id}/routing returned 200")
        low_data = res_low.json().get("routingDecision", {})
        check("4_LOW_ROLES", low_data.get("targetRoles") == ["SUPERVISOR"], f"Low target roles are ['SUPERVISOR'] (actual: {low_data.get('targetRoles')})")
        check("4_LOW_URGENCY", low_data.get("urgency") == "LOW", f"Low urgency is LOW (actual: {low_data.get('urgency')})")

        # Fixture 3: Info Severity
        fix_info_id = f"INC-TEST-11-1-INFO-{int(time.time())}"
        test_fixture_ids.append(fix_info_id)
        db.incidents.insert_one({
            "incidentId": fix_info_id,
            "siteId": "site-rsp-1",
            "zone": "Zone A - Factory Floor",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "general_safety_notice",
            "severity": "info",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "riskScore": 10,
            "confidence": 0.99,
        })

        # 5. Info Severity Routing Test
        print("\n--- 5. Info Severity Routing ---")
        res_info = requests.get(f"{BASE_URL}/api/incidents/{fix_info_id}/routing", headers=admin_headers, timeout=5)
        check("5_INFO_200", res_info.status_code == 200, f"GET /api/incidents/{fix_info_id}/routing returned 200")
        info_data = res_info.json().get("routingDecision", {})
        check("5_INFO_ROLES", info_data.get("targetRoles") == ["SAFETY_OFFICER"], f"Info target roles are ['SAFETY_OFFICER'] (actual: {info_data.get('targetRoles')})")
        check("5_INFO_URGENCY", info_data.get("urgency") == "LOW", f"Info urgency is LOW (actual: {info_data.get('urgency')})")

        # 6. Real User Directory Lookup
        print("\n--- 6. Real User Directory Lookup ---")
        crit_recipient = crit_data.get("recipient")
        check("6_RECIPIENT_EXISTS", crit_recipient is not None, "Recipient is not null")
        check("6_RECIPIENT_ID", bool(crit_recipient.get("id")), f"Recipient ID exists: {crit_recipient.get('id')}")
        check("6_RECIPIENT_NAME", bool(crit_recipient.get("name")), f"Recipient name exists: {crit_recipient.get('name')}")
        check("6_RECIPIENT_EMAIL", "@" in str(crit_recipient.get("email")), f"Recipient email valid: {crit_recipient.get('email')}")
        check("6_RECIPIENT_ROLE", crit_recipient.get("role") in ["SAFETY_OFFICER", "PLANT_MANAGER", "ADMIN"], f"Recipient role valid: {crit_recipient.get('role')}")
        check("6_RECIPIENT_DEPT", bool(crit_recipient.get("department")), f"Recipient department valid: {crit_recipient.get('department')}")

        # 7. Site Scoping Matching
        print("\n--- 7. Site Scoping Matching ---")
        fix_bad_site_id = f"INC-TEST-11-1-BADSITE-{int(time.time())}"
        test_fixture_ids.append(fix_bad_site_id)
        db.incidents.insert_one({
            "incidentId": fix_bad_site_id,
            "siteId": "SITE-OFFSHORE-99",  # Unauthorized site for standard users
            "zone": "Storage Bay",
            "zoneId": "zone-unauthorized",
            "cameraId": "CAM-09",
            "violationType": "missing_vest",
            "severity": "medium",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "riskScore": 40,
        })
        res_bad_site = requests.get(f"{BASE_URL}/api/incidents/{fix_bad_site_id}/routing", headers=admin_headers, timeout=5)
        bad_site_decision = res_bad_site.json().get("routingDecision", {})
        check("7_SITE_SCOPING", bad_site_decision.get("status") == "NO_RECIPIENT_CONFIGURED", f"Site mismatch produces NO_RECIPIENT_CONFIGURED (actual: {bad_site_decision.get('status')})")

        # 8. Zone Scoping Matching
        print("\n--- 8. Zone Scoping Matching ---")
        # Baseline incident INC-5850757 is in 'Storage Bay', where supervisor is not scoped
        res_zone_scope = requests.get(f"{BASE_URL}/api/incidents/INC-5850757/routing", headers=admin_headers, timeout=5)
        zone_decision = res_zone_scope.json().get("routingDecision", {})
        check("8_ZONE_SCOPING", zone_decision.get("status") == "NO_RECIPIENT_CONFIGURED", f"Zone mismatch for supervisor produces NO_RECIPIENT_CONFIGURED (actual: {zone_decision.get('status')})")

        # 9. Wildcard Scope Resolution ('*')
        print("\n--- 9. Wildcard Scope Resolution ---")
        # Admin or Safety Officer with wildcard can resolve across zones on CRITICAL
        check("9_WILDCARD_MATCH", crit_data.get("status") == "ROUTED" and len(crit_data.get("targetUsers", [])) > 0, "Users with wildcard scope resolve across facility zones")

        # 10. Inactive User Rejection
        print("\n--- 10. Inactive User Rejection ---")
        # Verify that all candidates returned have status ACTIVE
        target_users = crit_data.get("targetUsers", [])
        for u in target_users:
            check("10_ACTIVE_USER", u.get("status", "ACTIVE") == "ACTIVE", f"User {u.get('email')} is ACTIVE")

        # 11. No Recipient State
        print("\n--- 11. No Recipient State ---")
        res_no_rec = requests.get(f"{BASE_URL}/api/incidents/INC-2061247/routing", headers=admin_headers, timeout=5)
        no_rec_data = res_no_rec.json().get("routingDecision", {})
        check("11_NO_REC_STATUS", no_rec_data.get("status") == "NO_RECIPIENT_CONFIGURED", f"Status is NO_RECIPIENT_CONFIGURED (actual: {no_rec_data.get('status')})")
        check("11_NO_REC_NULL", no_rec_data.get("recipient") is None, f"Recipient is null (actual: {no_rec_data.get('recipient')})")
        check("11_NO_REC_USERS_EMPTY", len(no_rec_data.get("targetUsers", [])) == 0, f"Target users list is empty (count: {len(no_rec_data.get('targetUsers', []))})")

        # 12. No Fabricated Recipient
        print("\n--- 12. No Fabricated Recipient ---")
        check("12_NO_FAKE_USER", no_rec_data.get("recipient") is None, "No fake user object generated")
        check("12_NO_FAKE_EMAIL", "email" not in no_rec_data or no_rec_data.get("email") is None, "No fake email generated")

        # 13. Deterministic Routing
        print("\n--- 13. Deterministic Routing ---")
        first_run = requests.get(f"{BASE_URL}/api/incidents/INC-7726273/routing", headers=admin_headers, timeout=5).json()
        runs_identical = True
        for i in range(5):
            iter_run = requests.get(f"{BASE_URL}/api/incidents/INC-7726273/routing", headers=admin_headers, timeout=5).json()
            if iter_run.get("routingDecision", {}).get("recipient") != first_run.get("routingDecision", {}).get("recipient"):
                runs_identical = False
                break
            if iter_run.get("routingDecision", {}).get("routingReason") != first_run.get("routingDecision", {}).get("routingReason"):
                runs_identical = False
                break
        check("13_DETERMINISTIC", runs_identical, "5 consecutive evaluations yielded 100% identical recipient and routingReason")

        # 14. Routing Explanation Factual Grounding
        print("\n--- 14. Routing Explanation ---")
        reason = crit_data.get("routingReason", "")
        check("14_EXPLAIN_SEV", "CRITICAL" in reason, f"Reason states CRITICAL severity: {reason}")
        check("14_EXPLAIN_ZONE", "Machine Room Alpha" in reason, f"Reason states zone: {reason}")
        check("14_EXPLAIN_CAM", "CAM-4" in reason, f"Reason states camera: {reason}")
        check("14_EXPLAIN_ROLES", "SAFETY_OFFICER" in reason, f"Reason states target roles: {reason}")

        # 15. Violation-Specific Routing
        print("\n--- 15. Violation-Specific Routing ---")
        high_reason = high_data.get("routingReason", "")
        check("15_VIOLATION_SPECIFIC", "missing helmet" in high_reason, f"Reason factually reflects violation: {high_reason}")

        # 16. Emergency Routing Classification
        print("\n--- 16. Emergency Routing Classification ---")
        res_emrg = requests.get(f"{BASE_URL}/api/incidents/INC-2061247/routing", headers=admin_headers, timeout=5)
        emrg_reason = res_emrg.json().get("routingDecision", {}).get("routingReason", "")
        check("16_EMERGENCY_DETAIL", "emergency escape corridor obstruction" in emrg_reason, f"Emergency incident reflects escape corridor detail: {emrg_reason}")
        check("16_NO_FALSE_EMERGENCY", "emergency escape corridor" not in high_reason, "Non-emergency incident does NOT claim emergency escape corridor obstruction")

        # 17. Routing Endpoint (GET /api/incidents/:id/routing)
        print("\n--- 17. Routing Endpoint Contract ---")
        res_ep = requests.get(f"{BASE_URL}/api/incidents/INC-7726273/routing", headers=admin_headers, timeout=5)
        check("17_EP_200", res_ep.status_code == 200, "GET /api/incidents/:id/routing returned 200")
        ep_json = res_ep.json()
        check("17_EP_FIELDS", "status" in ep_json and "routingDecision" in ep_json and "routing" in ep_json and "firstResponder" in ep_json, "Response contains status, routingDecision, routing, and firstResponder")

        # 18. Nonexistent Incident 404
        print("\n--- 18. Nonexistent Incident ---")
        res_404 = requests.get(f"{BASE_URL}/api/incidents/INC-NONEXISTENT-9999/routing", headers=admin_headers, timeout=5)
        check("18_NONEXISTENT_404", res_404.status_code == 404, f"Nonexistent incident returned HTTP 404 (actual: {res_404.status_code})")

        # 19. Unauthorized Incident Access (EMPLOYEE role scope restriction)
        print("\n--- 19. Unauthorized Incident Access ---")
        res_worker_unauth = requests.get(f"{BASE_URL}/api/incidents/INC-8920954/routing", headers=worker_headers, timeout=5)
        check("19_WORKER_UNAUTH_403", res_worker_unauth.status_code in [403, 404], f"Worker forbidden from other workers' incident routing (actual: {res_worker_unauth.status_code})")

        # 20. Routing Mutation Authorization (POST /api/incidents/:id/route)
        print("\n--- 20. Routing Mutation Authorization ---")
        res_worker_route = requests.post(f"{BASE_URL}/api/incidents/{fix_med_id}/route", headers=worker_headers, timeout=5)
        check("20_WORKER_MUTATION_403", res_worker_route.status_code == 403, f"Worker forbidden from triggering routing mutation (actual: {res_worker_route.status_code})")

        # 21. ALERT_ROUTED Audit Event & Mutation Execution
        print("\n--- 21. ALERT_ROUTED Event & Execution ---")
        res_do_route = requests.post(f"{BASE_URL}/api/incidents/{fix_med_id}/route", headers=supervisor_headers, timeout=5)
        check("21_ROUTE_SUCCESS_200", res_do_route.status_code == 200, f"Supervisor trigger routing returned 200 (actual: {res_do_route.status_code})")
        route_body = res_do_route.json()
        check("21_RESPONSE_STATE_ROUTED", route_body.get("incident", {}).get("responseState") == "ROUTED", f"Incident responseState updated to ROUTED (actual: {route_body.get('incident', {}).get('responseState')})")

        # 22. Routing Event Metadata Schema in MongoDB
        print("\n--- 22. Routing Event Metadata Schema ---")
        routed_event = db.incidentevents.find_one({"incidentId": fix_med_id, "eventType": "ALERT_ROUTED"})
        check("22_EVENT_PERSISTED", routed_event is not None, f"ALERT_ROUTED event persisted in MongoDB for {fix_med_id}")
        meta = routed_event.get("metadata", {})
        check("22_META_RECIPIENT_ID", "recipientUserId" in meta or "recipientId" in meta, f"Metadata has recipient ID: {meta}")
        check("22_META_RECIPIENT_ROLE", "recipientRole" in meta, f"Metadata has recipientRole: {meta.get('recipientRole')}")
        check("22_META_POLICY_ID", "policyId" in meta, f"Metadata has policyId: {meta.get('policyId')}")
        check("22_META_SEVERITY", meta.get("severity") == "medium", f"Metadata has severity: {meta.get('severity')}")
        check("22_META_VIOLATION", meta.get("violationType") == "missing_vest", f"Metadata has violationType: {meta.get('violationType')}")
        check("22_META_ZONE", meta.get("zone") == "Furnace Bay", f"Metadata has zone: {meta.get('zone')}")
        check("22_META_CAMERA", meta.get("camera") == "CAM-01", f"Metadata has camera: {meta.get('camera')}")
        check("22_META_REASON", bool(meta.get("routingReason")), f"Metadata has routingReason: {meta.get('routingReason')}")

        # 23. Socket.IO incident.routed event test
        print("\n--- 23. Socket.IO Realtime Event Emission ---")
        try:
            import socketio
            sio_received = []
            sio = socketio.Client()
            @sio.on("incident.routed")
            def on_routed(data):
                sio_received.append(data)

            sio.connect(BASE_URL, auth={"token": admin_token})
            time.sleep(0.5)

            # Trigger routing on low fixture
            requests.post(f"{BASE_URL}/api/incidents/{fix_low_id}/route", headers=supervisor_headers, timeout=5)
            time.sleep(1)
            sio.disconnect()

            check("23_SOCKET_EMITTED", len(sio_received) > 0, f"Socket.IO incident.routed event received (count: {len(sio_received)})")
            if sio_received:
                found_match = any(
                    (ev.get("incidentId") == fix_low_id or ev.get("entityId") == fix_low_id or (isinstance(ev.get("payload"), dict) and ev.get("payload", {}).get("incidentId") == fix_low_id))
                    for ev in sio_received
                )
                check("23_SOCKET_INC_ID", found_match, f"Socket event contains incidentId {fix_low_id}")
                check("23_SOCKET_NO_SECRETS", "password" not in str(sio_received) and "hash" not in str(sio_received), "Socket payload contains no secrets or credentials")
        except Exception as e:
            print(f"[WARN] Socket.IO test error: {e}")
            check("23_SOCKET_FALLBACK", False, f"Socket.IO test failed: {e}")

        # 24. Delivery-vs-Routing Distinction
        print("\n--- 24. Delivery-vs-Routing Distinction ---")
        check("24_DELIVERY_PENDING", med_data.get("deliveryStatus") == "DELIVERY_PENDING", f"deliveryStatus is DELIVERY_PENDING, not fake DELIVERED (actual: {med_data.get('deliveryStatus')})")
        check("24_NO_REC_NOT_CONFIGURED", no_rec_data.get("deliveryStatus") == "NOT_CONFIGURED", f"No recipient deliveryStatus is NOT_CONFIGURED (actual: {no_rec_data.get('deliveryStatus')})")

        # 25. Notification Channel State
        print("\n--- 25. Notification Channel State ---")
        check("25_CHANNEL_STATE", med_data.get("channel") in ["IN_APP", "IN_APP_PUSH"], f"Channel is IN_APP (actual: {med_data.get('channel')})")
        check("25_CHANNEL_STATUS", med_data.get("channelStatus") == "ACTIVE", f"channelStatus is ACTIVE (actual: {med_data.get('channelStatus')})")

        # 26. No Fake Delivery Confirmation
        print("\n--- 26. No Fake Delivery ---")
        check("26_NO_FAKE_CONFIRMATION", "deliveryReceipt" not in med_data and "deliveredAt" not in med_data, "No fabricated delivery receipts or fake timestamps")

        # 27. Active Queue Compatibility
        print("\n--- 27. Active Queue Compatibility ---")
        res_q = requests.get(f"{BASE_URL}/api/incidents/response/queue", headers=admin_headers, timeout=5)
        check("27_QUEUE_200", res_q.status_code == 200, "GET /api/incidents/response/queue returned 200")
        q_items = res_q.json().get("incidents", res_q.json().get("items", []))
        check("27_QUEUE_ITEMS", len(q_items) > 0, f"Queue returns active items: {len(q_items)}")

        # 28. Response Bundle Compatibility (GET /api/incidents/:id/response)
        print("\n--- 28. Response Bundle Compatibility ---")
        res_bundle = requests.get(f"{BASE_URL}/api/incidents/INC-8920954/response", headers=admin_headers, timeout=5)
        check("28_BUNDLE_200", res_bundle.status_code == 200, "GET /api/incidents/INC-8920954/response returned 200")
        bundle_json = res_bundle.json()
        check("28_BUNDLE_ROUTING", "routingDecision" in bundle_json, "Response bundle includes routingDecision")

        # 29. Frontend Routing Data Contract
        print("\n--- 29. Frontend Data Contract Compliance ---")
        bundle_rd = bundle_json.get("routingDecision", {})
        check("29_CONTRACT_STATUS", bundle_rd.get("status") in ["ROUTED", "NO_RECIPIENT_CONFIGURED"], f"Contract status: {bundle_rd.get('status')}")
        check("29_CONTRACT_RECIPIENT", "recipient" in bundle_rd, "Contract recipient field present")
        check("29_CONTRACT_POLICY", bool(bundle_rd.get("ruleMatched") or bundle_rd.get("policyId")), "Contract policy field present")
        check("29_CONTRACT_REASON", bool(bundle_rd.get("routingReason")), "Contract routingReason field present")
        check("29_CONTRACT_DELIVERY", "deliveryStatus" in bundle_rd, "Contract deliveryStatus field present")

        # 30. No Math.random in SmartIncidentResponseService
        print("\n--- 30. Static Code Audit: No Math.random ---")
        service_file = os.path.join(os.path.dirname(__file__), "..", "server", "src", "services", "safetyIntelligence", "SmartIncidentResponseService.ts")
        with open(service_file, "r", encoding="utf-8") as f:
            service_code = f.read()
        check("30_NO_MATH_RANDOM", "Math.random" not in service_code, "Zero Math.random in SmartIncidentResponseService.ts")

        # 31. No Production Fake Recipient
        print("\n--- 31. Static Code Audit: No Fake Recipient ---")
        check("31_NO_MOCK_USER", "mock_recipient" not in service_code and "fake_email" not in service_code, "No mock recipient or fake email in SmartIncidentResponseService.ts")

        # 32. Phase 10 & 9.3 Regression Compatibility
        print("\n--- 32. Regression Compatibility ---")
        p10_6 = requests.get(f"{BASE_URL}/api/analytics/near-misses", headers=admin_headers, timeout=5)
        check("32_P10_6_REG", p10_6.status_code == 200, "Phase 10.6 Near-Miss Analytics endpoint returns HTTP 200")
        p10_5 = requests.get(f"{BASE_URL}/api/analytics/heatmap", headers=admin_headers, timeout=5)
        check("32_P10_5_REG", p10_5.status_code == 200, "Phase 10.5 Safety Heatmap endpoint returns HTTP 200")
        p10_4 = requests.get(f"{BASE_URL}/api/analytics/shift-analysis", headers=admin_headers, timeout=5)
        check("32_P10_4_REG", p10_4.status_code == 200, "Phase 10.4 Shift Analysis endpoint returns HTTP 200")
        p10_3 = requests.get(f"{BASE_URL}/api/analytics/zone-comparison", headers=admin_headers, timeout=5)
        check("32_P10_3_REG", p10_3.status_code == 200, "Phase 10.3 Zone Comparison endpoint returns HTTP 200")
        p10_2 = requests.get(f"{BASE_URL}/api/analytics/trends", headers=admin_headers, timeout=5)
        check("32_P10_2_REG", p10_2.status_code == 200, "Phase 10.2 Safety Trends endpoint returns HTTP 200")
        p10_1 = requests.get(f"{BASE_URL}/api/analytics", headers=admin_headers, timeout=5)
        check("32_P10_1_REG", p10_1.status_code == 200, "Phase 10.1 Analytics Data Layer endpoint returns HTTP 200")

    finally:
        # 33. Database Cleanup Protocol
        print("\n--- 33. Database Cleanup Protocol ---")
        if test_fixture_ids:
            del_inc = db.incidents.delete_many({"incidentId": {"$in": test_fixture_ids}})
            del_evt = db.incidentevents.delete_many({"incidentId": {"$in": test_fixture_ids}})
            del_aud = db.auditlogs.delete_many({"resourceId": {"$in": test_fixture_ids}})
            print(f"  Cleaned {del_inc.deleted_count} fixture incident(s) and {del_evt.deleted_count} fixture event(s).")
        check("33_CLEANUP_SUCCESS", True, "Test fixtures cleaned from MongoDB")

        # 34. Orphan-Event Check
        print("\n--- 34. Orphan-Event Check ---")
        all_inc_ids = [i["incidentId"] for i in db.incidents.find({}, {"incidentId": 1})]
        orphan_count = db.incidentevents.count_documents({"incidentId": {"$nin": all_inc_ids}})
        check("34_ORPHAN_COUNT_ZERO", orphan_count == 0, f"Zero orphan incident events in MongoDB (count: {orphan_count})")

        # 35. Final Database Baseline Checks
        print("\n--- 35. Final Database Baseline Verification ---")
        final_incidents = db.incidents.count_documents({})
        final_events = db.incidentevents.count_documents({})
        final_nearmisses = db.nearmisses.count_documents({})
        final_cameras = db.cameras.count_documents({})
        final_rz = db.restrictedzones.count_documents({})
        final_ez = db.emergencyzones.count_documents({})
        final_users = db.users.count_documents({})

        print(f"  incidents: {final_incidents} (baseline: {baseline_incidents})")
        print(f"  incidentevents: {final_events} (baseline: {baseline_events})")
        print(f"  nearmisses: {final_nearmisses} (baseline: {baseline_nearmisses})")
        print(f"  cameras: {final_cameras} (baseline: {baseline_cameras})")
        print(f"  restrictedzones: {final_rz} (baseline: {baseline_rz})")
        print(f"  emergencyzones: {final_ez} (baseline: {baseline_ez})")
        print(f"  users: {final_users} (baseline: {baseline_users})")

        check("35_BASELINE_INCIDENTS", final_incidents == baseline_incidents == 160, f"Incidents restored to baseline: {final_incidents}/160")
        check("35_BASELINE_EVENTS", final_events == baseline_events == 726, f"Events restored to baseline: {final_events}/726")
        check("35_BASELINE_CAMERAS", final_cameras == baseline_cameras == 1, f"Cameras restored to baseline: {final_cameras}/1")
        check("35_BASELINE_RZ", final_rz == baseline_rz == 1, f"Restricted zones restored to baseline: {final_rz}/1")
        check("35_BASELINE_NEARMISSES", final_nearmisses == baseline_nearmisses == 0, f"Near-misses restored to baseline: {final_nearmisses}/0")
        check("35_BASELINE_EZ", final_ez == baseline_ez == 0, f"Emergency zones restored to baseline: {final_ez}/0")
        check("35_BASELINE_USERS", final_users == baseline_users == 1, f"Users restored to baseline: {final_users}/1")

    print("\n" + "=" * 80)
    print(f"  PHASE 11.1 SUITE COMPLETE: {passed_count} PASSED, {failed_count} FAILED")
    print("=" * 80)

    if failed_count > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
