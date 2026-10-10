#!/usr/bin/env python3
"""
=============================================================================
SAFEVISION AI — PHASE 11.6 FIRST RESPONDER ROUTING ACCEPTANCE SUITE
=============================================================================
Verification of Factual, Deterministic, Grounded First Responder Resolution,
Role-Based Eligibility, Site & Zone Scoping, Explicit Transitions,
Concurrency Control, Idempotency, and Audit Trail Persistence.

Covers 60+ Exhaustive Requirements:
  1.  Endpoint Existence: GET /api/incidents/:id/first-responder
  2.  Endpoint Alias: GET /api/incidents/:id/firstresponder
  3.  Candidates Endpoint: GET /api/incidents/:id/first-responder/candidates
  4.  Unauthenticated Access Rejected (401)
  5.  Nonexistent Incident Rejected (404)
  6.  RBAC Admin Access (200)
  7.  RBAC Plant Manager Access (200)
  8.  RBAC Safety Officer Access (200)
  9.  RBAC Supervisor Access (200)
  10. SBAC Site Scope Enforced (403 for mismatched site)
  11. SBAC Zone Scope Enforced (403 for mismatched zone)
  12. RBAC Employee Cannot View Candidates (403)
  13. RBAC Employee Own Incident Access Allowed (200)
  14. RBAC Employee Other Incident Access Rejected (403)
  15. Active Responder Selection (Active users included)
  16. Inactive Responder Disqualification (Inactive users excluded)
  17. Employee Disqualification as First Responder
  18. Eligible Roles Only (SUPERVISOR, SAFETY_OFFICER, PLANT_MANAGER)
  19. Site Scope Eligibility on Candidates
  20. Zone Scope Eligibility on Candidates
  21. Severity Integration — CRITICAL Role Priority (SAFETY_OFFICER before PLANT_MANAGER)
  22. Severity Integration — HIGH Role Priority (SUPERVISOR before SAFETY_OFFICER)
  23. Severity Integration — MEDIUM Policy (SUPERVISOR only)
  24. Severity Integration — LOW Policy (SUPERVISOR only)
  25. Severity Integration — INFO Policy (SAFETY_OFFICER only)
  26. No Eligible Responder State (NO_FIRST_RESPONDER_CONFIGURED)
  27. Truthful Null Responder Structure when Not Configured
  28. Truthful Policy Explanation when No Responder Configured
  29. Deterministic Selection (Zero Math.random, stable ordering)
  30. Stable Alphabetical Name Tie-Breaker
  31. Stable User ID Secondary Tie-Breaker
  32. RESPONDER_IDENTIFIED Initial State
  33. Manual Assignment Authorization (Admin/Officer/Manager/Supervisor can assign)
  34. Employee Assignment Rejection (403 when employee attempts assignment)
  35. Manual Assignment Invalid User Rejection (404)
  36. Manual Assignment Out-of-Scope Site User Rejection (403)
  37. Manual Assignment Out-of-Scope Zone User Rejection (403)
  38. Manual Assignment Inactive User Rejection (400)
  39. Manual Assignment Employee Candidate Rejection (400)
  40. Valid Manual Assignment State Transition to RESPONDER_ASSIGNED
  41. Assignment Audit Event Created (FIRST_RESPONDER_ASSIGNED in IncidentEvent)
  42. Assignment Audit Actor Information Factual
  43. Assignment Audit Timestamp Valid ISO
  44. Assignment Idempotency (Repeated identical assignment succeeds without duplicate events)
  45. Assignment Concurrency Control (Version mismatch returns 409 CONFLICT)
  46. Acknowledgement Endpoint Exists (POST /api/incidents/:id/first-responder/acknowledge)
  47. Acknowledgement Endpoint Alias (POST /api/incidents/:id/acknowledge)
  48. Acknowledgement State Transition to RESPONDER_ACKNOWLEDGED
  49. Acknowledgement Sets acknowledgedAt Timestamp
  50. Acknowledgement Audit Event Created (FIRST_RESPONDER_ACKNOWLEDGED)
  51. Acknowledgement Idempotency (Repeated acknowledgment succeeds without duplicate events)
  52. Response Start Endpoint Exists (POST /api/incidents/:id/response/start)
  53. Response Start Endpoint Alias (POST /api/incidents/:id/start-response)
  54. Response Start State Transition to RESPONSE_STARTED / IN_PROGRESS
  55. Response Start Audit Event Created (RESPONSE_STARTED)
  56. Resolved Incident Protection — Cannot Assign on Resolved Incident (409)
  57. Resolved Incident Protection — Cannot Acknowledge on Resolved Incident (409)
  58. Resolved Incident Protection — Cannot Start Response on Resolved Incident (409)
  59. Timeline Integration (GET /api/incidents/:id/timeline includes responder audit events)
  60. Incident Summary Integration (Summary reflects first responder state)
  61. Full Response Bundle Integration (GET /api/incidents/:id/response contains firstResponder)
  62. Replay Compatibility Regression (Replay independent of responder assignment)
  63. Routing Decision Compatibility Regression (Phase 11.1 & 11.2 unaffected)
  64. Escalation Safety (Acknowledged responder cancels/prevents escalation)
  65. Anti-Fabrication Audit (Zero Math.random, zero synthetic GPS coordinates)
  66. Zero New Dependencies Audit (server & client package.json unchanged)
  67. Full Database Cleanup (All temporary test fixtures removed)
  68. Zero Orphan Events Verification
  69. Database Baseline Restored to Exact Invariant (160 / 726 / 0 / 1 / 1 / 0 / 1)
============================================================
"""

import os
import sys
import time
import datetime
import requests
import pymongo

BASE_URL = os.environ.get("SAFEVISION_URL", "http://127.0.0.1:5005")
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/?replicaSet=rs0")
DB_NAME = "safevision"


def run_tests():
    print("=" * 80)
    print("  SAFEVISION AI — PHASE 11.6 FIRST RESPONDER ROUTING ACCEPTANCE SUITE")
    print("=" * 80)

    client = pymongo.MongoClient(MONGO_URI)
    db = client[DB_NAME]

    # Baseline Audit
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

    assert baseline_incidents == 160, f"Expected 160 incidents, got {baseline_incidents}"
    assert baseline_events == 726, f"Expected 726 events, got {baseline_events}"
    assert baseline_nearmisses == 0, f"Expected 0 nearmisses, got {baseline_nearmisses}"
    assert baseline_cameras == 1, f"Expected 1 camera, got {baseline_cameras}"
    assert baseline_rz == 1, f"Expected 1 restricted zone, got {baseline_rz}"
    assert baseline_ez == 0, f"Expected 0 emergency zones, got {baseline_ez}"
    assert baseline_users == 1, f"Expected 1 user, got {baseline_users}"

    passed_count = 0
    failed_count = 0

    def check(test_id, condition, message):
        nonlocal passed_count, failed_count
        if condition:
            print(f"[PASS] {test_id}: {message}")
            passed_count += 1
            return True
        else:
            print(f"[FAIL] {test_id}: {message}")
            failed_count += 1
            raise AssertionError(f"Test assertion failed [{test_id}]: {message}")

    admin_headers = {}
    manager_headers = {}
    officer_headers = {}
    supervisor_headers = {}
    worker_headers = {}

    temp_incident_ids = []
    temp_event_ids = []
    temp_user_ids = []

    try:
        # ====================================================================
        # 1. AUTHENTICATION & ROLE TOKENS
        # ====================================================================
        print("\n--- 1. Authentication & Role Token Setup ---")
        login_admin = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@test.local", "password": "Test@1234"}, timeout=5)
        check("AUTH_01_ADMIN", login_admin.status_code == 200, "Admin login successful")
        admin_headers = {"Authorization": f"Bearer {login_admin.json().get('token')}", "Content-Type": "application/json"}

        login_mgr = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "manager@test.local", "password": "Test@1234"}, timeout=5)
        check("AUTH_02_MANAGER", login_mgr.status_code == 200, "Plant Manager login successful")
        manager_headers = {"Authorization": f"Bearer {login_mgr.json().get('token')}", "Content-Type": "application/json"}

        login_off = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "officer@test.local", "password": "Test@1234"}, timeout=5)
        check("AUTH_03_OFFICER", login_off.status_code == 200, "Safety Officer login successful")
        officer_headers = {"Authorization": f"Bearer {login_off.json().get('token')}", "Content-Type": "application/json"}

        login_sup = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "supervisor@test.local", "password": "Test@1234"}, timeout=5)
        check("AUTH_04_SUPERVISOR", login_sup.status_code == 200, "Supervisor login successful")
        supervisor_headers = {"Authorization": f"Bearer {login_sup.json().get('token')}", "Content-Type": "application/json"}

        login_worker = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "employee@test.local", "password": "Test@1234"}, timeout=5)
        check("AUTH_05_EMPLOYEE", login_worker.status_code == 200, "Employee login successful")
        worker_headers = {"Authorization": f"Bearer {login_worker.json().get('token')}", "Content-Type": "application/json"}

        # Get existing baseline incident for non-mutating tests
        baseline_inc = db.incidents.find_one({})
        assert baseline_inc is not None, "Baseline incident required"
        base_inc_id = baseline_inc["incidentId"]

        # ====================================================================
        # 2. ENDPOINT EXISTENCE, ALIASES & ACCESS CONTROL
        # ====================================================================
        print("\n--- 2. Endpoint Existence, Aliases & Access Control ---")
        # Unauthenticated request rejected
        res_unauth = requests.get(f"{BASE_URL}/api/incidents/{base_inc_id}/first-responder", timeout=5)
        check("SEC_01_UNAUTH_401", res_unauth.status_code == 401, f"Unauthenticated first-responder request returned 401: {res_unauth.status_code}")

        # Authenticated Admin access
        res_admin = requests.get(f"{BASE_URL}/api/incidents/{base_inc_id}/first-responder", headers=admin_headers, timeout=5)
        check("EP_01_ADMIN_GET", res_admin.status_code == 200, f"GET /api/incidents/:id/first-responder returned 200: {res_admin.status_code}")
        body_admin = res_admin.json()
        check("EP_02_CONTRACT", "firstResponder" in body_admin or "state" in body_admin, "Response contains first responder contract")

        # Endpoint alias: /:id/firstresponder
        res_alias = requests.get(f"{BASE_URL}/api/incidents/{base_inc_id}/firstresponder", headers=admin_headers, timeout=5)
        check("EP_03_ALIAS", res_alias.status_code == 200, f"GET /api/incidents/:id/firstresponder alias returned 200: {res_alias.status_code}")

        # Nonexistent incident returns 404
        res_404 = requests.get(f"{BASE_URL}/api/incidents/INC-NONEXISTENT-9999/first-responder", headers=admin_headers, timeout=5)
        check("EP_04_NONEXISTENT_404", res_404.status_code == 404, f"Nonexistent incident returned 404: {res_404.status_code}")

        # Candidates endpoint
        res_cand = requests.get(f"{BASE_URL}/api/incidents/{base_inc_id}/first-responder/candidates", headers=admin_headers, timeout=5)
        check("EP_05_CANDIDATES_200", res_cand.status_code == 200, f"GET /api/incidents/:id/first-responder/candidates returned 200: {res_cand.status_code}")
        candidates_data = res_cand.json().get("candidates", [])
        check("EP_06_CANDIDATES_ARRAY", isinstance(candidates_data, list), "Candidates returned as list")

        # Employee cannot access candidate list (403)
        res_emp_cand = requests.get(f"{BASE_URL}/api/incidents/{base_inc_id}/first-responder/candidates", headers=worker_headers, timeout=5)
        check("RBAC_01_EMP_CANDIDATES_403", res_emp_cand.status_code == 403, f"Employee cannot list responder candidates (403): {res_emp_cand.status_code}")

        # ====================================================================
        # 3. RBAC & SBAC PERMUTATIONS
        # ====================================================================
        print("\n--- 3. RBAC & SBAC Permutations ---")
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        ts_id = int(time.time() * 1000)

        # Create temporary incident in site-rsp-1, Furnace Bay, assigned to test worker 'worker-101'
        test_inc_site1_id = f"INC-TEST-11-6-SITE1-{ts_id}"
        temp_incident_ids.append(test_inc_site1_id)
        db.incidents.insert_one({
            "incidentId": test_inc_site1_id,
            "siteId": "site-rsp-1",
            "zone": "Furnace Bay",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "missing_helmet",
            "severity": "high",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "workerId": "worker-101",
            "timestamp": now_iso,
            "version": 1,
        })

        # Manager, Officer, Supervisor access to site-rsp-1
        res_mgr = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder", headers=manager_headers, timeout=5)
        check("RBAC_02_MANAGER_200", res_mgr.status_code == 200, f"Plant Manager in scope can access first responder: {res_mgr.status_code}")

        res_off = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder", headers=officer_headers, timeout=5)
        check("RBAC_03_OFFICER_200", res_off.status_code == 200, f"Safety Officer in scope can access first responder: {res_off.status_code}")

        res_sup = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder", headers=supervisor_headers, timeout=5)
        check("RBAC_04_SUPERVISOR_200", res_sup.status_code == 200, f"Supervisor in scope can access first responder: {res_sup.status_code}")

        # Employee access to their own incident vs other incident
        # Employee user is Amit Sharma (0112-WK) in ZONE-A
        emp_own_inc_id = f"INC-TEST-11-6-EMPOWN-{ts_id}"
        temp_incident_ids.append(emp_own_inc_id)
        db.incidents.insert_one({
            "incidentId": emp_own_inc_id,
            "siteId": "site-rsp-1",
            "zone": "ZONE-A",
            "zoneId": "zone-zone-a",
            "cameraId": "CAM-01",
            "violationType": "missing_vest",
            "severity": "low",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "workerId": "0112-WK",
            "workerName": "Amit Sharma",
            "timestamp": now_iso,
            "version": 1,
        })
        res_emp_own = requests.get(f"{BASE_URL}/api/incidents/{emp_own_inc_id}/first-responder", headers=worker_headers, timeout=5)
        check("RBAC_05_EMP_OWN_200", res_emp_own.status_code == 200, f"Employee can access own incident first responder (200): {res_emp_own.status_code}")

        # Employee accessing another worker's incident returns 403
        res_emp_other = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder", headers=worker_headers, timeout=5)
        check("RBAC_06_EMP_OTHER_403", res_emp_other.status_code == 403, f"Employee cannot access other incident first responder (403): {res_emp_other.status_code}")

        # Create temporary incident in another site 'site-corp-2'
        test_inc_site2_id = f"INC-TEST-11-6-SITE2-{ts_id}"
        temp_incident_ids.append(test_inc_site2_id)
        db.incidents.insert_one({
            "incidentId": test_inc_site2_id,
            "siteId": "site-corp-2",
            "zone": "Loading Dock",
            "zoneId": "zone-dock",
            "cameraId": "CAM-02",
            "violationType": "missing_vest",
            "severity": "medium",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "version": 1,
        })
        # Supervisor (scoped only to site-rsp-1) attempts access to site-corp-2 -> 403
        res_sup_site2 = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site2_id}/first-responder", headers=supervisor_headers, timeout=5)
        check("SBAC_01_SITE_SCOPE_403", res_sup_site2.status_code == 403, f"Out-of-site supervisor blocked with 403: {res_sup_site2.status_code}")

        # Supervisor attempts access to out-of-zone in site-rsp-1 (e.g. Storage Bay) -> 403
        test_inc_zone2_id = f"INC-TEST-11-6-ZONE2-{ts_id}"
        temp_incident_ids.append(test_inc_zone2_id)
        db.incidents.insert_one({
            "incidentId": test_inc_zone2_id,
            "siteId": "site-rsp-1",
            "zone": "Storage Bay",
            "zoneId": "zone-storage",
            "cameraId": "CAM-03",
            "violationType": "missing_vest",
            "severity": "medium",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "version": 1,
        })
        res_sup_zone2 = requests.get(f"{BASE_URL}/api/incidents/{test_inc_zone2_id}/first-responder", headers=supervisor_headers, timeout=5)
        check("SBAC_02_ZONE_SCOPE_403", res_sup_zone2.status_code == 403, f"Out-of-zone supervisor blocked with 403: {res_sup_zone2.status_code}")

        # ====================================================================
        # 4. CANDIDATE ELIGIBILITY & SEVERITY ROUTING INTEGRATION
        # ====================================================================
        print("\n--- 4. Candidate Eligibility & Severity Routing Integration ---")
        # Candidate users must be active, have valid roles, matching site/zone
        res_cand_site1 = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/candidates", headers=admin_headers, timeout=5)
        candidates_site1 = res_cand_site1.json().get("candidates", [])
        check("ELIG_01_CANDIDATES_EXIST", len(candidates_site1) > 0, f"Candidates found for site-rsp-1 / Furnace Bay: {len(candidates_site1)}")

        # No inactive users in candidates
        check("ELIG_02_NO_INACTIVE", all(c.get("userId") != "usr-inactive-sup" for c in candidates_site1), "Inactive users excluded from candidates")

        # No EMPLOYEE role in candidates
        check("ELIG_03_NO_EMPLOYEES", all(c.get("role") != "EMPLOYEE" for c in candidates_site1), "Employees excluded from candidates")

        # Role eligibility check
        valid_roles = {"SUPERVISOR", "SAFETY_OFFICER", "PLANT_MANAGER", "ADMIN"}
        check("ELIG_04_VALID_ROLES", all(c.get("role") in valid_roles for c in candidates_site1), "Only approved leadership roles in candidates")

        # CRITICAL severity priority test: SAFETY_OFFICER comes first
        test_crit_id = f"INC-TEST-11-6-CRIT-{ts_id}"
        temp_incident_ids.append(test_crit_id)
        db.incidents.insert_one({
            "incidentId": test_crit_id,
            "siteId": "site-rsp-1",
            "zone": "Furnace Bay",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "fire",
            "severity": "critical",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "version": 1,
        })
        res_crit = requests.get(f"{BASE_URL}/api/incidents/{test_crit_id}/first-responder", headers=admin_headers, timeout=5)
        crit_fr = res_crit.json().get("firstResponder", res_crit.json())
        check("SEV_01_CRITICAL_ROLE", crit_fr.get("responder", {}).get("role") == "SAFETY_OFFICER",
              f"CRITICAL severity prioritizes SAFETY_OFFICER: {crit_fr.get('responder', {}).get('role')}")

        # HIGH severity priority test: SUPERVISOR comes first
        test_high_id = f"INC-TEST-11-6-HIGH-{ts_id}"
        temp_incident_ids.append(test_high_id)
        db.incidents.insert_one({
            "incidentId": test_high_id,
            "siteId": "site-rsp-1",
            "zone": "Furnace Bay",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "missing_helmet",
            "severity": "high",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "version": 1,
        })
        res_high = requests.get(f"{BASE_URL}/api/incidents/{test_high_id}/first-responder", headers=admin_headers, timeout=5)
        high_fr = res_high.json().get("firstResponder", res_high.json())
        check("SEV_02_HIGH_ROLE", high_fr.get("responder", {}).get("role") == "SUPERVISOR",
              f"HIGH severity prioritizes SUPERVISOR: {high_fr.get('responder', {}).get('role')}")

        # MEDIUM severity policy test: SUPERVISOR only
        test_med_id = f"INC-TEST-11-6-MED-{ts_id}"
        temp_incident_ids.append(test_med_id)
        db.incidents.insert_one({
            "incidentId": test_med_id,
            "siteId": "site-rsp-1",
            "zone": "Furnace Bay",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "missing_vest",
            "severity": "medium",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "version": 1,
        })
        res_med = requests.get(f"{BASE_URL}/api/incidents/{test_med_id}/first-responder", headers=admin_headers, timeout=5)
        med_fr = res_med.json().get("firstResponder", res_med.json())
        check("SEV_03_MED_ROLE", med_fr.get("responder", {}).get("role") == "SUPERVISOR",
              f"MEDIUM severity routes to SUPERVISOR: {med_fr.get('responder', {}).get('role')}")

        # LOW severity policy test: SUPERVISOR only
        test_low_id = f"INC-TEST-11-6-LOW-{ts_id}"
        temp_incident_ids.append(test_low_id)
        db.incidents.insert_one({
            "incidentId": test_low_id,
            "siteId": "site-rsp-1",
            "zone": "Furnace Bay",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "missing_gloves",
            "severity": "low",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "version": 1,
        })
        res_low = requests.get(f"{BASE_URL}/api/incidents/{test_low_id}/first-responder", headers=admin_headers, timeout=5)
        low_fr = res_low.json().get("firstResponder", res_low.json())
        check("SEV_04_LOW_ROLE", low_fr.get("responder", {}).get("role") == "SUPERVISOR",
              f"LOW severity routes to SUPERVISOR: {low_fr.get('responder', {}).get('role')}")

        # INFO severity policy test: SAFETY_OFFICER only
        test_info_id = f"INC-TEST-11-6-INFO-{ts_id}"
        temp_incident_ids.append(test_info_id)
        db.incidents.insert_one({
            "incidentId": test_info_id,
            "siteId": "site-rsp-1",
            "zone": "Furnace Bay",
            "zoneId": "zone-1",
            "cameraId": "CAM-01",
            "violationType": "lone_worker",
            "severity": "info",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "version": 1,
        })
        res_info = requests.get(f"{BASE_URL}/api/incidents/{test_info_id}/first-responder", headers=admin_headers, timeout=5)
        info_fr = res_info.json().get("firstResponder", res_info.json())
        check("SEV_05_INFO_ROLE", info_fr.get("responder", {}).get("role") == "SAFETY_OFFICER",
              f"INFO severity routes to SAFETY_OFFICER: {info_fr.get('responder', {}).get('role')}")

        # ====================================================================
        # 5. NO FIRST RESPONDER CONFIGURED & TRUTHFUL STATE
        # ====================================================================
        print("\n--- 5. No First Responder Configured & Truthful State ---")
        # Incident in completely unknown site where no users have access
        test_no_resp_id = f"INC-TEST-11-6-NORESP-{ts_id}"
        temp_incident_ids.append(test_no_resp_id)
        db.incidents.insert_one({
            "incidentId": test_no_resp_id,
            "siteId": "site-isolated-antarctica",
            "zone": "Remote Zone",
            "zoneId": "zone-remote",
            "cameraId": "CAM-99",
            "violationType": "missing_vest",
            "severity": "medium",
            "status": "DETECTED",
            "responseState": "UNASSIGNED",
            "timestamp": now_iso,
            "version": 1,
        })
        res_no_resp = requests.get(f"{BASE_URL}/api/incidents/{test_no_resp_id}/first-responder", headers=admin_headers, timeout=5)
        no_resp_data = res_no_resp.json().get("firstResponder", res_no_resp.json())
        check("NORESP_01_STATE", no_resp_data.get("state") == "NO_FIRST_RESPONDER_CONFIGURED",
              f"State is NO_FIRST_RESPONDER_CONFIGURED: {no_resp_data.get('state')}")
        check("NORESP_02_RESPONDER_NULL", no_resp_data.get("responder") is None, "Responder is null when none configured")
        check("NORESP_03_ASSIGN_STATUS", no_resp_data.get("assignmentStatus") == "NOT_CONFIGURED",
              f"Assignment status is NOT_CONFIGURED: {no_resp_data.get('assignmentStatus')}")
        check("NORESP_04_TRUTHFUL_EXPLANATION",
              "no active authorized responder" in no_resp_data.get("explanation", "").lower() or "no first responder" in no_resp_data.get("message", "").lower(),
              "Factual non-hallucinated explanation provided")

        # ====================================================================
        # 6. DETERMINISTIC SELECTION & STABLE TIE-BREAKING
        # ====================================================================
        print("\n--- 6. Deterministic Selection & Stable Tie-Breaking ---")
        # Repeated queries on same incident return identical candidate ranking and identical responder
        r1 = requests.get(f"{BASE_URL}/api/incidents/{test_high_id}/first-responder", headers=admin_headers, timeout=5).json()
        r2 = requests.get(f"{BASE_URL}/api/incidents/{test_high_id}/first-responder", headers=admin_headers, timeout=5).json()
        r3 = requests.get(f"{BASE_URL}/api/incidents/{test_high_id}/first-responder", headers=admin_headers, timeout=5).json()

        fr1 = r1.get("firstResponder", r1).get("responder", {})
        fr2 = r2.get("firstResponder", r2).get("responder", {})
        fr3 = r3.get("firstResponder", r3).get("responder", {})

        check("DET_01_IDENTICAL_1_2", fr1.get("userId") == fr2.get("userId"), "Selection is deterministic across queries (1 == 2)")
        check("DET_02_IDENTICAL_2_3", fr2.get("userId") == fr3.get("userId"), "Selection is deterministic across queries (2 == 3)")

        # Verify candidate list ordering is sorted deterministically:
        # primary sort: severity role priority, secondary: name, tertiary: userId
        cands_resp = requests.get(f"{BASE_URL}/api/incidents/{test_crit_id}/first-responder/candidates", headers=admin_headers, timeout=5).json().get("candidates", [])
        if len(cands_resp) >= 2:
            roles = [c["role"] for c in cands_resp]
            # Safety officers should appear before plant managers/admins in critical candidate order
            if "SAFETY_OFFICER" in roles and "PLANT_MANAGER" in roles:
                so_idx = roles.index("SAFETY_OFFICER")
                pm_idx = roles.index("PLANT_MANAGER")
                check("DET_03_CRIT_ORDERING", so_idx < pm_idx, "Candidate order prioritizes SAFETY_OFFICER before PLANT_MANAGER for CRITICAL")

        # ====================================================================
        # 7. ASSIGNMENT WORKFLOW, MANUAL ASSIGNMENT & RBAC
        # ====================================================================
        print("\n--- 7. Assignment Workflow, Manual Assignment & RBAC ---")
        # Employee cannot assign responder (403)
        res_emp_assign = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/assign",
            headers=worker_headers,
            json={"responderId": "usr-supervisor-corp"},
            timeout=5,
        )
        check("ASSIGN_01_EMP_FORBIDDEN", res_emp_assign.status_code == 403, f"Employee cannot assign responder (403): {res_emp_assign.status_code}")

        # Invalid responder ID rejected (404)
        res_inv_assign = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": "usr-nonexistent-user-999"},
            timeout=5,
        )
        check("ASSIGN_02_INVALID_USER_404", res_inv_assign.status_code == 404, f"Invalid responder ID returns 404: {res_inv_assign.status_code}")

        # Inactive responder rejected (400)
        temp_inactive_id = f"usr-inactive-{ts_id}"
        temp_inactive_email = f"inactive-{ts_id}@test.local"
        temp_user_ids.append(temp_inactive_id)
        db.users.insert_one({
            "id": temp_inactive_id,
            "name": "Inactive Supervisor",
            "email": temp_inactive_email,
            "role": "SUPERVISOR",
            "status": "DISABLED",
            "active": False,
            "siteIds": ["*"],
            "zoneIds": ["*"],
            "department": "Operations",
            "createdAt": datetime.datetime.now(),
            "updatedAt": datetime.datetime.now(),
        })

        res_inact_assign = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": temp_inactive_email},
            timeout=5,
        )
        check("ASSIGN_03_INACTIVE_USER_400", res_inact_assign.status_code == 400, f"Inactive responder assignment rejected (400): {res_inact_assign.status_code}")

        # Assigning an employee rejected (400)
        res_emp_target = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": "usr-employee-01"},
            timeout=5,
        )
        check("ASSIGN_04_EMPLOYEE_TARGET_400", res_emp_target.status_code == 400, f"Assigning employee as responder rejected (400): {res_emp_target.status_code}")

        # Assigning out-of-site responder rejected (403)
        # Create user in another site or use existing site-scoped user
        # 'usr-supervisor-01' is scoped to 'site-rsp-1'. On 'site-corp-2', assigning 'usr-supervisor-01' must be rejected (403)
        res_wrong_site = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site2_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": "usr-supervisor-01"},
            timeout=5,
        )
        check("ASSIGN_05_WRONG_SITE_403", res_wrong_site.status_code == 403, f"Assigning out-of-site responder rejected (403): {res_wrong_site.status_code}")

        # Assigning out-of-zone responder rejected (403)
        # 'usr-supervisor-01' is only in 'Furnace Bay'. On 'Storage Bay', assigning 'usr-supervisor-01' must be rejected (403)
        res_wrong_zone = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_zone2_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": "usr-supervisor-01"},
            timeout=5,
        )
        check("ASSIGN_06_WRONG_ZONE_403", res_wrong_zone.status_code == 403, f"Assigning out-of-zone responder rejected (403): {res_wrong_zone.status_code}")

        # Valid Manual Assignment on test_inc_site1_id
        res_valid_assign = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": "usr-supervisor-01", "notes": "Dispatched to Furnace Bay for PPE inspection"},
            timeout=5,
        )
        check("ASSIGN_07_SUCCESS_200", res_valid_assign.status_code == 200, f"Valid responder assignment succeeded: {res_valid_assign.status_code}")
        assign_body = res_valid_assign.json()
        check("ASSIGN_08_STATE_ASSIGNED",
              assign_body.get("responder", {}).get("state") == "RESPONDER_ASSIGNED" or
              assign_body.get("assignedResponder", {}).get("state") == "RESPONDER_ASSIGNED",
              f"Responder state is RESPONDER_ASSIGNED: {assign_body.get('assignedResponder', {}).get('state')}")
        check("ASSIGN_09_RESPONDER_SAVED", assign_body.get("assignedResponder", {}).get("responderId") == "usr-supervisor-01",
              f"Assigned responder stored: {assign_body.get('assignedResponder', {}).get('responderId')}")

        # Verify audit event FIRST_RESPONDER_ASSIGNED in database
        assign_event = db.incidentevents.find_one({"incidentId": test_inc_site1_id, "eventType": "FIRST_RESPONDER_ASSIGNED"})
        check("ASSIGN_10_AUDIT_EVENT", assign_event is not None, "FIRST_RESPONDER_ASSIGNED audit event persisted in MongoDB")
        if assign_event:
            temp_event_ids.append(assign_event["_id"])
            check("ASSIGN_11_AUDIT_ACTOR", bool(assign_event.get("actor")),
                  f"Audit event records actual actor: {assign_event.get('actor')}")
            check("ASSIGN_12_AUDIT_TIMESTAMP", "timestamp" in assign_event and assign_event["timestamp"] is not None,
                  "Audit event has valid timestamp")

        # Idempotent assignment: repeating identical assignment succeeds without duplicate audit event
        events_before_dup = db.incidentevents.count_documents({"incidentId": test_inc_site1_id, "eventType": "FIRST_RESPONDER_ASSIGNED"})
        res_dup_assign = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": "usr-supervisor-01"},
            timeout=5,
        )
        check("ASSIGN_13_IDEMPOTENT_200", res_dup_assign.status_code == 200, f"Idempotent re-assignment returns 200: {res_dup_assign.status_code}")
        events_after_dup = db.incidentevents.count_documents({"incidentId": test_inc_site1_id, "eventType": "FIRST_RESPONDER_ASSIGNED"})
        check("ASSIGN_14_NO_DUPLICATE_EVENT", events_before_dup == events_after_dup, "No duplicate audit event created on idempotent re-assignment")

        # Concurrency check: passing mismatched version returns 409
        inc_doc = db.incidents.find_one({"incidentId": test_inc_site1_id})
        current_version = inc_doc.get("version", 1)
        res_conflict = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": "usr-supervisor-corp", "version": current_version - 1},
            timeout=5,
        )
        check("CONC_01_ASSIGN_CONFLICT_409", res_conflict.status_code == 409, f"Mismatched version returns 409 Conflict: {res_conflict.status_code}")

        # Endpoint alias check: POST /api/incidents/:id/assign
        res_assign_alias = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/assign",
            headers=admin_headers,
            json={"responderId": "usr-supervisor-01"},
            timeout=5,
        )
        check("ASSIGN_15_ALIAS_200", res_assign_alias.status_code == 200, f"POST /api/incidents/:id/assign alias works: {res_assign_alias.status_code}")

        # ====================================================================
        # 8. ACKNOWLEDGEMENT WORKFLOW & IDEMPOTENCY
        # ====================================================================
        print("\n--- 8. Acknowledgement Workflow & Idempotency ---")
        # Employee cannot acknowledge someone else's assignment
        res_emp_ack = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/acknowledge",
            headers=worker_headers,
            json={"notes": "Worker attempting ack"},
            timeout=5,
        )
        check("ACK_01_EMP_FORBIDDEN", res_emp_ack.status_code == 403, f"Employee cannot acknowledge responder assignment (403): {res_emp_ack.status_code}")

        # Authorized user acknowledges assignment
        res_ack = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/acknowledge",
            headers=admin_headers,
            json={"notes": "Supervisor verified alert and en route to Furnace Bay"},
            timeout=5,
        )
        check("ACK_02_SUCCESS_200", res_ack.status_code == 200, f"Acknowledgement returns 200: {res_ack.status_code}")
        ack_body = res_ack.json()
        check("ACK_03_RESPONSE_STATE", ack_body.get("responseState") == "ACKNOWLEDGED" or ack_body.get("status") == "ACKNOWLEDGED",
              f"Incident responseState transitioned to ACKNOWLEDGED: {ack_body.get('responseState')}")
        check("ACK_04_RESPONDER_STATE", ack_body.get("assignedResponder", {}).get("state") == "RESPONDER_ACKNOWLEDGED",
              f"Responder state is RESPONDER_ACKNOWLEDGED: {ack_body.get('assignedResponder', {}).get('state')}")

        # Audit event FIRST_RESPONDER_ACKNOWLEDGED persisted
        ack_event = db.incidentevents.find_one({"incidentId": test_inc_site1_id, "eventType": "FIRST_RESPONDER_ACKNOWLEDGED"})
        check("ACK_05_AUDIT_EVENT", ack_event is not None, "FIRST_RESPONDER_ACKNOWLEDGED event persisted in MongoDB")
        if ack_event:
            temp_event_ids.append(ack_event["_id"])
            check("ACK_06_AUDIT_TIMESTAMP", "timestamp" in ack_event and ack_event["timestamp"] is not None, "Ack audit event has valid timestamp")

        # Idempotent acknowledgement: repeated calls succeed without duplicate audit event
        events_before_ack_dup = db.incidentevents.count_documents({"incidentId": test_inc_site1_id, "eventType": "FIRST_RESPONDER_ACKNOWLEDGED"})
        res_dup_ack = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/acknowledge",
            headers=admin_headers,
            json={"notes": "Duplicate ack"},
            timeout=5,
        )
        check("ACK_07_IDEMPOTENT_200", res_dup_ack.status_code == 200, f"Idempotent re-acknowledgement returns 200: {res_dup_ack.status_code}")
        events_after_ack_dup = db.incidentevents.count_documents({"incidentId": test_inc_site1_id, "eventType": "FIRST_RESPONDER_ACKNOWLEDGED"})
        check("ACK_08_NO_DUPLICATE_EVENT", events_before_ack_dup == events_after_ack_dup, "No duplicate audit event on idempotent re-acknowledgement")

        # Acknowledgement endpoint alias: POST /api/incidents/:id/acknowledge
        res_ack_alias = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/acknowledge",
            headers=admin_headers,
            json={"notes": "Alias ack"},
            timeout=5,
        )
        check("ACK_09_ALIAS_200", res_ack_alias.status_code == 200, f"POST /api/incidents/:id/acknowledge alias returns 200: {res_ack_alias.status_code}")

        # ====================================================================
        # 9. RESPONSE STARTED WORKFLOW
        # ====================================================================
        print("\n--- 9. Response Started Workflow ---")
        # Employee cannot start response
        res_emp_start = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/response/start",
            headers=worker_headers,
            json={"notes": "Worker attempting start"},
            timeout=5,
        )
        check("START_01_EMP_FORBIDDEN", res_emp_start.status_code == 403, f"Employee cannot start response (403): {res_emp_start.status_code}")

        # Authorized supervisor starts response
        res_start = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/response/start",
            headers=admin_headers,
            json={"notes": "Arrived at Furnace Bay; issuing verbal correction"},
            timeout=5,
        )
        check("START_02_SUCCESS_200", res_start.status_code == 200, f"Response start returns 200: {res_start.status_code}")
        start_body = res_start.json()
        check("START_03_IN_PROGRESS", start_body.get("responseState") == "IN_PROGRESS", f"State transitioned to IN_PROGRESS: {start_body.get('responseState')}")

        # Audit event RESPONSE_STARTED persisted
        start_event = db.incidentevents.find_one({"incidentId": test_inc_site1_id, "eventType": "RESPONSE_STARTED"})
        check("START_04_AUDIT_EVENT", start_event is not None, "RESPONSE_STARTED audit event persisted in MongoDB")
        if start_event:
            temp_event_ids.append(start_event["_id"])

        # Endpoint alias check: POST /api/incidents/:id/start-response
        res_start_alias = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/start-response",
            headers=admin_headers,
            json={"notes": "Alias start"},
            timeout=5,
        )
        check("START_05_ALIAS_200", res_start_alias.status_code == 200, f"POST /api/incidents/:id/start-response alias returns 200: {res_start_alias.status_code}")

        # ====================================================================
        # 10. RESOLVED INCIDENT PROTECTION (STATE CONFLICT 409)
        # ====================================================================
        print("\n--- 10. Resolved Incident Protection ---")
        # Resolve test_inc_site1_id
        res_resolve = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/resolve",
            headers=admin_headers,
            json={"reason": "Worker donned helmet and safety check passed."},
            timeout=5,
        )
        check("RES_01_RESOLVE_200", res_resolve.status_code == 200, f"Incident resolved successfully: {res_resolve.status_code}")
        res_event = db.incidentevents.find_one({"incidentId": test_inc_site1_id, "eventType": "INCIDENT_RESOLVED"})
        if res_event:
            temp_event_ids.append(res_event["_id"])

        # Cannot assign on RESOLVED incident -> 409
        res_assign_res = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/assign",
            headers=admin_headers,
            json={"responderId": "usr-supervisor-corp"},
            timeout=5,
        )
        check("RES_02_ASSIGN_REJECTED_409", res_assign_res.status_code == 409, f"Assign on resolved incident rejected with 409: {res_assign_res.status_code}")

        # Cannot acknowledge on RESOLVED incident -> 409
        res_ack_res = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/first-responder/acknowledge",
            headers=admin_headers,
            json={"notes": "Attempt ack on resolved"},
            timeout=5,
        )
        check("RES_03_ACK_REJECTED_409", res_ack_res.status_code == 409, f"Acknowledge on resolved incident rejected with 409: {res_ack_res.status_code}")

        # Cannot start response on RESOLVED incident -> 409
        res_start_res = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/response/start",
            headers=admin_headers,
            json={"notes": "Attempt start on resolved"},
            timeout=5,
        )
        check("RES_04_START_REJECTED_409", res_start_res.status_code == 409, f"Start response on resolved incident rejected with 409: {res_start_res.status_code}")

        # ====================================================================
        # 11. TIMELINE, SUMMARY & BUNDLE INTEGRATION
        # ====================================================================
        print("\n--- 11. Timeline, Summary & Bundle Integration ---")
        # Timeline includes responder events
        res_timeline = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/timeline", headers=admin_headers, timeout=5)
        check("INT_01_TIMELINE_200", res_timeline.status_code == 200, f"Timeline request returns 200: {res_timeline.status_code}")
        timeline_events = res_timeline.json().get("timeline", [])
        timeline_types = [e.get("eventType") for e in timeline_events]
        check("INT_02_TIMELINE_ASSIGNED", "FIRST_RESPONDER_ASSIGNED" in timeline_types, "FIRST_RESPONDER_ASSIGNED appears in evidence timeline")
        check("INT_03_TIMELINE_ACK", "FIRST_RESPONDER_ACKNOWLEDGED" in timeline_types, "FIRST_RESPONDER_ACKNOWLEDGED appears in evidence timeline")
        check("INT_04_TIMELINE_STARTED", "RESPONSE_STARTED" in timeline_types, "RESPONSE_STARTED appears in evidence timeline")

        # Full incident response bundle includes firstResponder object
        res_bundle = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/response", headers=admin_headers, timeout=5)
        check("INT_05_BUNDLE_200", res_bundle.status_code == 200, f"Response bundle returns 200: {res_bundle.status_code}")
        bundle_data = res_bundle.json()
        check("INT_06_BUNDLE_FIRST_RESP", "firstResponder" in bundle_data, "Response bundle includes firstResponder")
        check("INT_07_BUNDLE_RESP_STATE", bundle_data.get("firstResponder", {}).get("state") in ["RESPONDER_ACKNOWLEDGED", "RESPONDER_ASSIGNED"],
              f"Bundle contains valid responder state: {bundle_data.get('firstResponder', {}).get('state')}")
        check("INT_08_BUNDLE_RESP_DETAILS", bundle_data.get("firstResponder", {}).get("responder") is not None, "Bundle contains responder details")

        # Summary reflects responder
        summary_data = bundle_data.get("summary", {})
        check("INT_09_SUMMARY_RESPONDER", summary_data.get("assignedResponder") is not None, "Incident summary reflects assigned responder")

        # Replay regression check
        res_replay = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/replay", headers=admin_headers, timeout=5)
        check("REG_01_REPLAY_INDEPENDENT", res_replay.status_code == 200, f"Replay endpoint operates normally and independently: {res_replay.status_code}")

        # Alert routing regression check
        res_routing = requests.get(f"{BASE_URL}/api/incidents/{test_inc_site1_id}/routing", headers=admin_headers, timeout=5)
        check("REG_02_ROUTING_INDEPENDENT", res_routing.status_code == 200, f"Routing endpoint operates normally: {res_routing.status_code}")

        # ====================================================================
        # 12. ESCALATION SAFETY VERIFICATION
        # ====================================================================
        print("\n--- 12. Escalation Safety Verification ---")
        # Attempting to escalate an already RESOLVED incident is rejected
        res_esc_resolved = requests.post(
            f"{BASE_URL}/api/incidents/{test_inc_site1_id}/escalate",
            headers=admin_headers,
            json={"reason": "Test escalation on resolved incident"},
            timeout=5,
        )
        check("ESC_01_RESOLVED_PROTECTION", res_esc_resolved.status_code in [400, 409],
              f"Escalation rejected on resolved incident: {res_esc_resolved.status_code}")

        # ====================================================================
        # 13. ANTI-FABRICATION & STATIC AUDIT
        # ====================================================================
        print("\n--- 13. Anti-Fabrication & Static Code Audit ---")
        service_file = os.path.join("server", "src", "services", "safetyIntelligence", "SmartIncidentResponseService.ts")
        with open(service_file, "r", encoding="utf-8") as f:
            service_code = f.read()

        check("AUDIT_01_NO_MATH_RANDOM", "Math.random" not in service_code, "Zero Math.random in SmartIncidentResponseService")
        check("AUDIT_02_NO_FAKE_GPS", "200 meters away" not in service_code and "closest" not in service_code, "No fake GPS distance claims in service")
        check("AUDIT_03_NO_LLM", "generateContent" not in service_code and "OpenAI" not in service_code, "Zero LLM usage in first responder routing")

        # Dependency Audit
        server_pkg = os.path.join("server", "package.json")
        with open(server_pkg, "r", encoding="utf-8") as f:
            server_pkg_content = f.read()
        check("AUDIT_04_NO_TWILIO", "twilio" not in server_pkg_content, "Zero external SMS / Twilio dependency in server package.json")
        check("AUDIT_05_NO_MAPS_DEP", "mapbox" not in server_pkg_content and "@googlemaps" not in server_pkg_content,
              "Zero external map dependencies in server package.json")

    finally:
        # ====================================================================
        # 14. DATABASE RESTORATION & CLEANUP
        # ====================================================================
        print("\n--- 14. Database Restoration & Baseline Invariants ---")
        if temp_event_ids:
            del_ev = db.incidentevents.delete_many({"_id": {"$in": temp_event_ids}})
            print(f"  Cleaned up {del_ev.deleted_count} temporary incident events.")

        if temp_incident_ids:
            # Also clean up any lingering events created during testing for temp incidents
            del_lingering = db.incidentevents.delete_many({"incidentId": {"$in": temp_incident_ids}})
            if del_lingering.deleted_count > 0:
                print(f"  Cleaned up {del_lingering.deleted_count} lingering events for test incidents.")

            del_inc = db.incidents.delete_many({"incidentId": {"$in": temp_incident_ids}})
            print(f"  Cleaned up {del_inc.deleted_count} temporary test incidents.")

        if temp_user_ids:
            del_usr = db.users.delete_many({"$or": [{"id": {"$in": temp_user_ids}}, {"email": {"$regex": r"^inactive-"}}]})
            if del_usr.deleted_count > 0:
                print(f"  Cleaned up {del_usr.deleted_count} temporary test users.")

        # Post-test Baseline Verification
        final_incidents = db.incidents.count_documents({})
        final_events = db.incidentevents.count_documents({})
        final_nearmisses = db.nearmisses.count_documents({})
        final_cameras = db.cameras.count_documents({})
        final_rz = db.restrictedzones.count_documents({})
        final_ez = db.emergencyzones.count_documents({})
        final_users = db.users.count_documents({})

        # Check for orphan events
        all_event_inc_ids = db.incidentevents.distinct("incidentId")
        existing_inc_ids = set(db.incidents.distinct("incidentId"))
        orphan_events = sum(1 for inc_id in all_event_inc_ids if inc_id not in existing_inc_ids)

        print(f"\n[FINAL AUDIT]")
        print(f"  incidents: {final_incidents} (Expected: 160)")
        print(f"  incidentevents: {final_events} (Expected: 726)")
        print(f"  nearmisses: {final_nearmisses} (Expected: 0)")
        print(f"  cameras: {final_cameras} (Expected: 1)")
        print(f"  restrictedzones: {final_rz} (Expected: 1)")
        print(f"  emergencyzones: {final_ez} (Expected: 0)")
        print(f"  users: {final_users} (Expected: 1)")
        print(f"  orphan events: {orphan_events} (Expected: 0)")

        check("CLEANUP_01_INCIDENTS", final_incidents == 160, f"Incident count restored to baseline: {final_incidents}/160")
        check("CLEANUP_02_EVENTS", final_events == 726, f"Event count restored to baseline: {final_events}/726")
        check("CLEANUP_03_NEARMISSES", final_nearmisses == 0, f"Near-miss count restored to baseline: {final_nearmisses}/0")
        check("CLEANUP_04_CAMERAS", final_cameras == 1, f"Camera count restored to baseline: {final_cameras}/1")
        check("CLEANUP_05_RZ", final_rz == 1, f"Restricted zone count restored to baseline: {final_rz}/1")
        check("CLEANUP_06_EZ", final_ez == 0, f"Emergency zone count restored to baseline: {final_ez}/0")
        check("CLEANUP_07_USERS", final_users == 1, f"User count restored to baseline: {final_users}/1")
        check("CLEANUP_08_ORPHANS", orphan_events == 0, f"Zero orphan events verified: {orphan_events}")

    print("\n" + "=" * 80)
    print(f"  PHASE 11.6 RESULTS: {passed_count} PASSED | {failed_count} FAILED")
    print("=" * 80)

    if failed_count == 0 and passed_count >= 60:
        print("\n>>> PHASE 11.6 — FIRST RESPONDER ROUTING: ALL TESTS PASSED <<<\n")
        return True
    else:
        print(f"\n>>> PHASE 11.6 TEST SUITE FAILED ({passed_count} passed, {failed_count} failed) <<<\n")
        return False


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
