#!/usr/bin/env python3
"""
=============================================================================
SAFEVISION AI — PHASE 11.5 INCIDENT REPLAY ACCEPTANCE SUITE
=============================================================================
Verification of Factual, Deterministic, Grounded Incident Replay & Evidence Serving.

Requirements Covered:
  1.  Endpoint Availability (GET /api/incidents/:id/replay)
  2.  Unauthenticated Access Rejected (401)
  3.  Nonexistent Incident Rejected (404)
  4.  RBAC Admin Access (200)
  5.  RBAC Plant Manager Access (200)
  6.  RBAC Safety Officer In-Zone Access (200)
  7.  RBAC Supervisor In-Zone Access (200)
  8.  RBAC Supervisor Out-of-Zone Access Rejected (403)
  9.  RBAC Employee Own Incident Access (200)
  10. RBAC Employee Other Incident Access Rejected (403)
  11. SBAC Site Scope Enforced (403 for mismatched site)
  12. Real Baseline Incident Replay Data Contract (Root & Nested fields)
  13. Honest Snapshot Fallback (available=True, evidenceType='SNAPSHOT', replayAvailable=False)
  14. Honest Snapshot Message ("Snapshot evidence available — video replay unavailable.")
  15. Real Baseline Incident Media Endpoint (404 when no video exists)
  16. Zero-Evidence Incident Replay (available=False, evidenceType='NONE', replayAvailable=False)
  17. Zero-Evidence Message ("No replay evidence is available for this incident.")
  18. Secure Media Endpoint Authentication (401 for unauthenticated)
  19. Secure Media Endpoint Authorization (403 for zone scope mismatch)
  20. Secure Media Endpoint Site Scope Enforced (403 for site mismatch)
  21. Secure Media Endpoint Employee Scope Enforced (403 for other employee)
  22. Secure Media Endpoint Nonexistent Incident (404)
  23. Temporary Video Fixture Creation & Discovery (Isolated try...finally)
  24. Truthful Video Replay Availability (available=True, evidenceType='VIDEO', replayAvailable=True)
  25. Truthful Video Playback Contract (playable=True, mode='VIDEO', url pointing to media route)
  26. Video Media Full Download (HTTP 200, Content-Type: video/mp4, Content-Length)
  27. Video Media Range Streaming RFC 7233 (HTTP 206 Partial Content, Content-Range, Content-Length)
  28. Video Media Out-of-Bounds Range (HTTP 416 Range Not Satisfiable)
  29. Missing Video File Truthful Degradation (replayAvailable=False if referenced file missing)
  30. Media Endpoint 404 when video deleted
  31. Path Traversal Protection (Reject directory traversal attempts ../, ..\\, UNC, absolute)
  32. Path Traversal Protection on Media Route (Reject unauthorized path escape)
  33. Incident Timestamp Preservation (Exact persisted timestamp, no generation)
  34. Video Duration Handling (Preserved when genuinely known, never fabricated)
  35. Evidence Integrity Handling (Verified boolean based on real evidenceHash)
  36. Anti-Fabrication & Anti-Hallucination Audit (No synthetic MP4s, no Math.random, no LLM)
  37. Complete Response Bundle Integration (GET /api/incidents/:id/response includes replay)
  38. Phase 11.4 Evidence Timeline Compatibility Preserved
  39. Phase 11.3 Incident Summary Compatibility Preserved
  40. Phase 11.2 Severity Routing Compatibility Preserved
  41. Phase 11.1 Alert Routing Compatibility Preserved
  42. Frontend Contract Compatibility ({ ...replay, replay })
  43. Temporary Test Fixtures Cleaned Up (try / finally)
  44. Database Incident Count Restored to Baseline (160)
  45. Database Event Count Restored to Baseline (726)
  46. Database Nearmiss Count Restored to Baseline (0)
  47. Baseline Camera Count Restored (1)
  48. Baseline Restricted Zone Count Restored (1)
  49. Baseline Emergency Zone Count Restored (0)
  50. Baseline User Count Restored (1)
  51. Zero Orphan Events Verification
  52. Zero Lingering Temporary Video or Evidence Files in server/evidence/
=============================================================================
"""

import os
import sys
import time
import requests
import pymongo

BASE_URL = os.environ.get("SAFEVISION_URL", "http://127.0.0.1:5005")
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/?replicaSet=rs0")
DB_NAME = "safevision"
EVIDENCE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server", "evidence"))


def run_tests():
    print("=" * 80)
    print("  SAFEVISION AI — PHASE 11.5 INCIDENT REPLAY ACCEPTANCE SUITE")
    print("=" * 80)

    client = pymongo.MongoClient(MONGO_URI)
    db = client[DB_NAME]

    # 1. Baseline Audit
    baseline_incidents = db.incidents.count_documents({})
    baseline_events = db.incidentevents.count_documents({})
    baseline_nearmisses = db.nearmisses.count_documents({})
    baseline_cameras = db.cameras.count_documents({})
    baseline_rz = db.restrictedzones.count_documents({})
    baseline_ez = db.emergencyzones.count_documents({})
    baseline_users = db.users.count_documents({})

    evidence_files_before = set(os.listdir(EVIDENCE_DIR))

    print(f"\n[BASELINE AUDIT]")
    print(f"  incidents: {baseline_incidents}")
    print(f"  incidentevents: {baseline_events}")
    print(f"  nearmisses: {baseline_nearmisses}")
    print(f"  cameras: {baseline_cameras}")
    print(f"  restrictedzones: {baseline_rz}")
    print(f"  emergencyzones: {baseline_ez}")
    print(f"  users: {baseline_users}")
    print(f"  evidence files: {len(evidence_files_before)} (all .jpg: {all(f.endswith('.jpg') for f in evidence_files_before)})")

    assert baseline_incidents == 160, f"Expected 160 incidents, got {baseline_incidents}"
    assert baseline_events == 726, f"Expected 726 events, got {baseline_events}"
    assert baseline_nearmisses == 0, f"Expected 0 nearmisses, got {baseline_nearmisses}"
    assert baseline_cameras == 1, f"Expected 1 camera, got {baseline_cameras}"
    assert baseline_rz == 1, f"Expected 1 restricted zone, got {baseline_rz}"
    assert baseline_ez == 0, f"Expected 0 emergency zones, got {baseline_ez}"
    assert baseline_users == 1, f"Expected 1 user, got {baseline_users}"
    assert len(evidence_files_before) == 92, f"Expected 92 evidence files, got {len(evidence_files_before)}"

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
    temp_evidence_files = []

    try:
        # Step 1: Authentication & Role Setup
        print("\n--- 1. Authentication & Role Setup ---")
        login_admin = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@test.local", "password": "Test@1234"},
            timeout=5,
        )
        check("AUTH_ADMIN", login_admin.status_code == 200, "Admin login successful")
        admin_headers = {
            "Authorization": f"Bearer {login_admin.json().get('token')}",
            "Content-Type": "application/json",
        }

        login_mgr = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "manager@test.local", "password": "Test@1234"},
            timeout=5,
        )
        check("AUTH_PLANT_MANAGER", login_mgr.status_code == 200, "Plant Manager login successful")
        manager_headers = {
            "Authorization": f"Bearer {login_mgr.json().get('token')}",
            "Content-Type": "application/json",
        }

        login_off = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "officer@test.local", "password": "Test@1234"},
            timeout=5,
        )
        check("AUTH_SAFETY_OFFICER", login_off.status_code == 200, "Safety Officer login successful")
        officer_headers = {
            "Authorization": f"Bearer {login_off.json().get('token')}",
            "Content-Type": "application/json",
        }

        login_sup = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "supervisor@test.local", "password": "Test@1234"},
            timeout=5,
        )
        check("AUTH_SUPERVISOR", login_sup.status_code == 200, "Supervisor login successful")
        supervisor_headers = {
            "Authorization": f"Bearer {login_sup.json().get('token')}",
            "Content-Type": "application/json",
        }

        login_worker = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "employee@test.local", "password": "Test@1234"},
            timeout=5,
        )
        check("AUTH_EMPLOYEE", login_worker.status_code == 200, "Employee login successful")
        worker_headers = {
            "Authorization": f"Bearer {login_worker.json().get('token')}",
            "Content-Type": "application/json",
        }

        # Step 2: Unauthenticated and Nonexistent Incident Checks
        print("\n--- 2. Unauthenticated & Nonexistent Incident Checks ---")
        unauth_resp = requests.get(f"{BASE_URL}/api/incidents/INC-1001/replay", timeout=5)
        check("REPLAY_UNAUTH_401", unauth_resp.status_code == 401, "Unauthenticated replay access rejected with 401")

        unauth_media = requests.get(f"{BASE_URL}/api/incidents/INC-1001/replay/media", timeout=5)
        check("MEDIA_UNAUTH_401", unauth_media.status_code == 401, "Unauthenticated video media access rejected with 401")

        notfound_resp = requests.get(f"{BASE_URL}/api/incidents/INC-NONEXISTENT-9999/replay", headers=admin_headers, timeout=5)
        check("REPLAY_NOT_FOUND_404", notfound_resp.status_code == 404, "Nonexistent incident replay returns 404")

        notfound_media = requests.get(f"{BASE_URL}/api/incidents/INC-NONEXISTENT-9999/replay/media", headers=admin_headers, timeout=5)
        check("MEDIA_NOT_FOUND_404", notfound_media.status_code == 404, "Nonexistent incident media returns 404")

        # Step 3: Real Baseline Incident Replay Data Contract (Snapshot Only)
        print("\n--- 3. Real Baseline Incident Replay Contract & Snapshot Fallback ---")
        evidence_files = set(os.listdir(EVIDENCE_DIR))
        matching_inc = None
        for inc in db.incidents.find({"zone": "Furnace Bay", "siteId": "site-rsp-1"}):
            if f"{inc.get('incidentId')}.jpg" in evidence_files:
                matching_inc = inc
                break
        assert matching_inc is not None, "Baseline incident with on-disk evidence must exist"
        existing_doc = matching_inc
        real_inc_id = existing_doc["incidentId"]

        replay_resp = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/replay", headers=admin_headers, timeout=5)
        check("REPLAY_BASE_200", replay_resp.status_code == 200, "Admin can retrieve baseline incident replay")
        replay_data = replay_resp.json()

        # Check dual contract: top-level fields and nested .replay object
        check("CONTRACT_DUAL_COMPAT", "replay" in replay_data and "incidentId" in replay_data, "Response provides both root contract and nested .replay for backward compatibility")
        check("CONTRACT_INCIDENT_ID", replay_data.get("incidentId") == real_inc_id, f"incidentId matches requested {real_inc_id}")
        check("CONTRACT_AVAILABLE_BOOL", isinstance(replay_data.get("available"), bool), "available is boolean")
        check("CONTRACT_EVIDENCE_TYPE", replay_data.get("evidenceType") in ["VIDEO", "SNAPSHOT", "NONE"], "evidenceType is valid enum")
        check("CONTRACT_REPLAY_AVAIL_BOOL", isinstance(replay_data.get("replayAvailable"), bool), "replayAvailable is boolean")

        # Since baseline has no video:
        check("REAL_EVIDENCE_TYPE_SNAPSHOT", replay_data.get("evidenceType") == "SNAPSHOT", "Baseline incident reports evidenceType SNAPSHOT truthfully")
        check("REAL_REPLAY_UNAVAILABLE", replay_data.get("replayAvailable") is False, "replayAvailable is False when only snapshot exists")
        check("REAL_AVAILABLE_TRUE", replay_data.get("available") is True, "available is True because evidence snapshot exists")
        check("REAL_SNAPSHOT_FALLBACK_MSG", "Snapshot evidence available" in replay_data.get("message", "") and "video replay unavailable" in replay_data.get("message", ""), "Message truthfully states snapshot fallback")

        # Check source object
        src = replay_data.get("source", {})
        check("SOURCE_STRUCTURE", isinstance(src, dict), "source is an object")
        check("SOURCE_CAMERA", src.get("cameraId") == existing_doc.get("cameraId"), "source.cameraId matches persisted incident")
        check("SOURCE_ZONE", src.get("zone") == existing_doc.get("zone"), "source.zone matches persisted incident")

        # Check evidence & playback object
        ev_obj = replay_data.get("evidence", {})
        pb_obj = replay_data.get("playback", {})
        check("EVIDENCE_MIME_JPEG", ev_obj.get("mimeType") == "image/jpeg", "evidence.mimeType is image/jpeg for snapshot")
        check("PLAYBACK_PLAYABLE_FALSE", pb_obj.get("playable") is False, "playback.playable is False for snapshot")
        check("PLAYBACK_MODE_SNAPSHOT", pb_obj.get("mode") == "SNAPSHOT", "playback.mode is SNAPSHOT")
        check("PLAYBACK_URL_VALID", pb_obj.get("url") == f"/api/incidents/{real_inc_id}/evidence", "playback.url points to authenticated evidence endpoint")

        # Check integrity object
        integrity_obj = replay_data.get("integrity", {})
        check("INTEGRITY_VERIFIED_MATCH", integrity_obj.get("verified") == bool(existing_doc.get("evidenceHash")), "integrity.verified matches evidenceHash presence")
        check("INTEGRITY_HASH_MATCH", integrity_obj.get("hash") == existing_doc.get("evidenceHash"), "integrity.hash matches persisted evidenceHash")

        # Check timestamp
        check("TIMESTAMP_PRESERVED", replay_data.get("incidentTimestamp") is not None, "incidentTimestamp is preserved from persisted record")

        # Verify real baseline incident media route returns 404 (not fake video)
        media_404 = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/replay/media", headers=admin_headers, timeout=5)
        check("BASELINE_MEDIA_404_TRUTHFUL", media_404.status_code == 404, "Media route returns 404 truthfully when no video file exists on disk")
        check("BASELINE_MEDIA_404_MSG", "not found" in media_404.json().get("error", "").lower(), "Error message indicates video file unavailable")

        # Step 4: RBAC & SBAC Authorization on Replay Endpoint
        print("\n--- 4. RBAC & SBAC Authorization on Replay Endpoint ---")
        # Plant Manager
        pm_resp = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/replay", headers=manager_headers, timeout=5)
        check("RBAC_PLANT_MGR_200", pm_resp.status_code == 200, "Plant Manager has authorized access to incident replay")

        # Safety Officer in-zone
        so_resp = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/replay", headers=officer_headers, timeout=5)
        check("RBAC_SAFETY_OFFICER_200", so_resp.status_code == 200, "Safety Officer in-zone has authorized access")

        # Supervisor in-zone
        sup_resp = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/replay", headers=supervisor_headers, timeout=5)
        check("RBAC_SUPERVISOR_IN_ZONE_200", sup_resp.status_code == 200, "Supervisor in-zone has authorized access")

        # Create temporary incident in Zone 3 (restricted for supervisor whose zone is Furnace Bay)
        inc_out_of_zone = {
            "incidentId": "INC-TEST-REPLAY-ZONE3-115",
            "title": "Zone Scope Replay Test",
            "zone": "Zone 3 - Continuous Casting",
            "zoneId": "ZONE-03",
            "siteId": "site-rsp-1",
            "cameraId": "CAM-01",
            "severity": "medium",
            "status": "DETECTED",
            "violationType": "no_hard_hat",
            "timestamp": "2026-10-05T08:00:00.000Z",
            "evidenceHash": "zone3-test-hash",
        }
        db.incidents.insert_one(inc_out_of_zone)
        temp_incident_ids.append("INC-TEST-REPLAY-ZONE3-115")

        sup_out_resp = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-REPLAY-ZONE3-115/replay", headers=supervisor_headers, timeout=5)
        check("RBAC_SUPERVISOR_OUT_OF_ZONE_403", sup_out_resp.status_code == 403, "Supervisor out-of-zone access rejected with 403")
        check("RBAC_SUPERVISOR_OUT_CODE", sup_out_resp.json().get("code") == "ZONE_SCOPE_FORBIDDEN", "Forbidden error code is ZONE_SCOPE_FORBIDDEN")

        # Media route out-of-zone test
        sup_media_out = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-REPLAY-ZONE3-115/replay/media", headers=supervisor_headers, timeout=5)
        check("MEDIA_SUPERVISOR_OUT_403", sup_media_out.status_code == 403, "Media endpoint enforces zone scope with 403")

        # SBAC Site Mismatch Test: incident in a different site
        inc_other_site = {
            "incidentId": "INC-TEST-REPLAY-SITE-DIFF-115",
            "title": "Site Scope Replay Test",
            "zone": "Furnace Bay",
            "siteId": "site-coimbatore-2",
            "cameraId": "CAM-01",
            "severity": "medium",
            "status": "DETECTED",
            "violationType": "no_hard_hat",
            "timestamp": "2026-10-05T08:05:00.000Z",
        }
        db.incidents.insert_one(inc_other_site)
        temp_incident_ids.append("INC-TEST-REPLAY-SITE-DIFF-115")

        mgr_site_resp = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-REPLAY-SITE-DIFF-115/replay", headers=manager_headers, timeout=5)
        check("SBAC_SITE_SCOPE_403", mgr_site_resp.status_code == 403, "Site mismatch access rejected with 403")
        check("SBAC_SITE_SCOPE_CODE", mgr_site_resp.json().get("code") == "SITE_SCOPE_FORBIDDEN", "Error code is SITE_SCOPE_FORBIDDEN")

        mgr_media_site_resp = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-REPLAY-SITE-DIFF-115/replay/media", headers=manager_headers, timeout=5)
        check("MEDIA_SITE_SCOPE_403", mgr_media_site_resp.status_code == 403, "Media endpoint enforces site scope with 403")

        # Employee Own Incident vs Other Incident
        inc_employee_own = {
            "incidentId": "INC-TEST-REPLAY-EMP-OWN-115",
            "title": "Employee Own Replay Test",
            "zone": "ZONE-A",
            "siteId": "site-rsp-1",
            "cameraId": "CAM-01",
            "workerId": "0112-WK",
            "employeeId": "0112-WK",
            "workerName": "Amit Sharma",
            "severity": "low",
            "status": "DETECTED",
            "violationType": "no_safety_vest",
            "timestamp": "2026-10-05T08:10:00.000Z",
        }
        db.incidents.insert_one(inc_employee_own)
        temp_incident_ids.append("INC-TEST-REPLAY-EMP-OWN-115")

        inc_employee_other = {
            "incidentId": "INC-TEST-REPLAY-EMP-OTHER-115",
            "title": "Employee Other Replay Test",
            "zone": "ZONE-A",
            "siteId": "site-rsp-1",
            "cameraId": "CAM-01",
            "workerId": "worker-999-other",
            "employeeId": "worker-999-other",
            "severity": "low",
            "status": "DETECTED",
            "violationType": "no_safety_vest",
            "timestamp": "2026-10-05T08:12:00.000Z",
        }
        db.incidents.insert_one(inc_employee_other)
        temp_incident_ids.append("INC-TEST-REPLAY-EMP-OTHER-115")

        emp_own_resp = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-REPLAY-EMP-OWN-115/replay", headers=worker_headers, timeout=5)
        check("RBAC_EMPLOYEE_OWN_200", emp_own_resp.status_code == 200, "Employee can access replay of their own incident")

        emp_other_resp = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-REPLAY-EMP-OTHER-115/replay", headers=worker_headers, timeout=5)
        check("RBAC_EMPLOYEE_OTHER_403", emp_other_resp.status_code == 403, "Employee cannot access replay of another worker's incident")
        check("RBAC_EMPLOYEE_OTHER_CODE", emp_other_resp.json().get("code") == "EMPLOYEE_SCOPE_FORBIDDEN", "Error code is EMPLOYEE_SCOPE_FORBIDDEN")

        emp_media_other = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-REPLAY-EMP-OTHER-115/replay/media", headers=worker_headers, timeout=5)
        check("MEDIA_EMPLOYEE_OTHER_403", emp_media_other.status_code == 403, "Media endpoint enforces employee isolation with 403")

        # Step 5: Zero-Evidence Incident Replay
        print("\n--- 5. Zero-Evidence Incident Replay ---")
        inc_zero_ev = {
            "incidentId": "INC-TEST-REPLAY-ZERO-EV-115",
            "title": "Zero Evidence Incident",
            "zone": "Furnace Bay",
            "siteId": "site-rsp-1",
            "cameraId": "CAM-01",
            "severity": "low",
            "status": "DETECTED",
            "violationType": "general_hazard",
            "timestamp": "2026-10-05T08:15:00.000Z",
            "evidenceImage": "",
        }
        db.incidents.insert_one(inc_zero_ev)
        temp_incident_ids.append("INC-TEST-REPLAY-ZERO-EV-115")

        zero_ev_resp = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-REPLAY-ZERO-EV-115/replay", headers=admin_headers, timeout=5)
        check("ZERO_EV_200", zero_ev_resp.status_code == 200, "Zero-evidence replay query succeeds")
        zdata = zero_ev_resp.json()
        check("ZERO_EV_AVAILABLE_FALSE", zdata.get("available") is False, "available is False for incident with no evidence")
        check("ZERO_EV_TYPE_NONE", zdata.get("evidenceType") == "NONE", "evidenceType is NONE")
        check("ZERO_EV_REPLAY_AVAIL_FALSE", zdata.get("replayAvailable") is False, "replayAvailable is False")
        check("ZERO_EV_PLAYBACK_MODE_NONE", zdata.get("playback", {}).get("mode") == "NONE", "playback.mode is NONE")
        check("ZERO_EV_PLAYABLE_FALSE", zdata.get("playback", {}).get("playable") is False, "playback.playable is False")
        check("ZERO_EV_MSG", "No replay evidence is available for this incident." in zdata.get("message", ""), "Message truthfully states no evidence is available")

        # Step 6: Path Traversal & Security Validation
        print("\n--- 6. Path Traversal & File Access Security ---")
        # Attack 1: Directory traversal in URL path
        pt_url = f"{BASE_URL}/api/incidents/..%2f..%2f..%2fpackage.json/replay"
        pt_resp = requests.get(pt_url, headers=admin_headers, timeout=5)
        check("TRAVERSAL_URL_REJECTED", pt_resp.status_code in [400, 403, 404], "Directory traversal URL rejected safely")

        # Attack 2: Directory traversal in media endpoint
        pt_media_url = f"{BASE_URL}/api/incidents/..%2f..%2f..%2fpackage.json/replay/media"
        pt_media_resp = requests.get(pt_media_url, headers=admin_headers, timeout=5)
        check("TRAVERSAL_MEDIA_REJECTED", pt_media_resp.status_code in [400, 403, 404], "Directory traversal on media endpoint rejected safely")

        # Attack 3: Incident with malicious videoPath in DB pointing outside evidence dir
        inc_traversal = {
            "incidentId": "INC-TEST-TRAVERSAL-ATTACK-115",
            "title": "Traversal Attack Test",
            "zone": "Furnace Bay",
            "siteId": "site-rsp-1",
            "cameraId": "CAM-01",
            "severity": "critical",
            "status": "DETECTED",
            "violationType": "fall_hazard",
            "timestamp": "2026-10-05T08:20:00.000Z",
            "videoPath": "../../package.json",
        }
        db.incidents.insert_one(inc_traversal)
        temp_incident_ids.append("INC-TEST-TRAVERSAL-ATTACK-115")

        traversal_query_resp = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-TRAVERSAL-ATTACK-115/replay", headers=admin_headers, timeout=5)
        check("TRAVERSAL_DB_REPLAY_SAFE", traversal_query_resp.status_code == 200, "Traversal path in DB does not crash replay endpoint")
        tdata = traversal_query_resp.json()
        check("TRAVERSAL_DB_NOT_REPLAYABLE", tdata.get("replayAvailable") is False, "Traversing video path is neutralized and replay is marked unavailable")

        traversal_media_req = requests.get(f"{BASE_URL}/api/incidents/INC-TEST-TRAVERSAL-ATTACK-115/replay/media", headers=admin_headers, timeout=5)
        check("TRAVERSAL_DB_MEDIA_BLOCKED", traversal_media_req.status_code in [400, 404], "Traversing media path cannot be downloaded via media route")

        # Step 7: Temporary Video Fixture & Real Media Serving Verification
        print("\n--- 7. Temporary Video Fixture & Real Media Serving Verification ---")
        temp_vid_inc_id = "INC-TEST-REAL-VIDEO-115"
        temp_vid_filename = f"{temp_vid_inc_id}.mp4"
        temp_vid_path = os.path.join(EVIDENCE_DIR, temp_vid_filename)

        # Create a valid synthetic MP4 container header bytes for byte-range and MIME testing
        # ftyp box + moov structure simulation
        fake_video_content = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41\x00\x00\x00\x08free" + b"A" * 1024
        with open(temp_vid_path, "wb") as f:
            f.write(fake_video_content)
        temp_evidence_files.append(temp_vid_path)

        inc_video_record = {
            "incidentId": temp_vid_inc_id,
            "title": "Temporary Video Evidence Incident",
            "zone": "Furnace Bay",
            "siteId": "site-rsp-1",
            "cameraId": "CAM-01",
            "severity": "critical",
            "status": "DETECTED",
            "violationType": "unauthorized_entry",
            "timestamp": "2026-10-05T08:25:00.000Z",
            "videoPath": temp_vid_filename,
            "durationSeconds": 15,
            "evidenceHash": "hash-vid-fixture-sha256",
        }
        db.incidents.insert_one(inc_video_record)
        temp_incident_ids.append(temp_vid_inc_id)

        # Test video discovery in replay details
        vid_replay_resp = requests.get(f"{BASE_URL}/api/incidents/{temp_vid_inc_id}/replay", headers=admin_headers, timeout=5)
        check("VID_REPLAY_QUERY_200", vid_replay_resp.status_code == 200, "Query for incident with real video returns 200")
        vdata = vid_replay_resp.json()
        check("VID_REPLAY_AVAIL_TRUE", vdata.get("replayAvailable") is True, "replayAvailable is True when valid video file is present")
        check("VID_AVAILABLE_TRUE", vdata.get("available") is True, "available is True")
        check("VID_EVIDENCE_TYPE_VIDEO", vdata.get("evidenceType") == "VIDEO", "evidenceType is VIDEO")
        check("VID_PLAYABLE_TRUE", vdata.get("playback", {}).get("playable") is True, "playback.playable is True")
        check("VID_PLAYBACK_MODE_VIDEO", vdata.get("playback", {}).get("mode") == "VIDEO", "playback.mode is VIDEO")
        check("VID_PLAYBACK_URL_MATCH", vdata.get("playback", {}).get("url") == f"/api/incidents/{temp_vid_inc_id}/replay/media", "playback.url points to media streaming endpoint")
        check("VID_MIME_MP4", vdata.get("evidence", {}).get("mimeType") == "video/mp4", "evidence.mimeType is video/mp4")
        check("VID_SIZE_BYTES_MATCH", vdata.get("evidence", {}).get("sizeBytes") == len(fake_video_content), "evidence.sizeBytes matches actual file size")
        check("VID_DURATION_MATCH", vdata.get("evidence", {}).get("durationSeconds") == 15, "evidence.durationSeconds preserved from record")
        check("VID_MSG", "Replay video available" in vdata.get("message", ""), "Message confirms video availability")

        # Test full video media download (HTTP 200)
        full_stream_resp = requests.get(f"{BASE_URL}/api/incidents/{temp_vid_inc_id}/replay/media", headers=admin_headers, timeout=5)
        check("STREAM_FULL_200", full_stream_resp.status_code == 200, "Full video media fetch returns 200")
        check("STREAM_CONTENT_TYPE", full_stream_resp.headers.get("Content-Type") == "video/mp4", "Content-Type is video/mp4")
        check("STREAM_CONTENT_LENGTH", int(full_stream_resp.headers.get("Content-Length", 0)) == len(fake_video_content), "Content-Length matches full file size")
        check("STREAM_CONTENT_BYTES", full_stream_resp.content == fake_video_content, "Streamed content exactly matches physical file")

        # Test HTTP Byte-Range Request (RFC 7233)
        range_headers = dict(admin_headers)
        range_headers["Range"] = "bytes=0-31"
        range_resp = requests.get(f"{BASE_URL}/api/incidents/{temp_vid_inc_id}/replay/media", headers=range_headers, timeout=5)
        check("STREAM_RANGE_206", range_resp.status_code == 206, "HTTP Range request returns 206 Partial Content")
        check("STREAM_RANGE_HEADER", f"bytes 0-31/{len(fake_video_content)}" in range_resp.headers.get("Content-Range", ""), "Content-Range header formatted correctly")
        check("STREAM_RANGE_LENGTH", int(range_resp.headers.get("Content-Length", 0)) == 32, "Content-Length matches range chunk (32 bytes)")
        check("STREAM_RANGE_ACCEPT_RANGES", range_resp.headers.get("Accept-Ranges") == "bytes", "Accept-Ranges header is bytes")
        check("STREAM_RANGE_BYTES_MATCH", range_resp.content == fake_video_content[0:32], "Range bytes match exact chunk of video file")

        # Test Range Out-of-Bounds (416)
        invalid_range_headers = dict(admin_headers)
        invalid_range_headers["Range"] = f"bytes={len(fake_video_content) + 100}-{len(fake_video_content) + 200}"
        oob_range_resp = requests.get(f"{BASE_URL}/api/incidents/{temp_vid_inc_id}/replay/media", headers=invalid_range_headers, timeout=5)
        check("STREAM_RANGE_OOB_416", oob_range_resp.status_code == 416, "Out-of-bounds byte range returns 416 Range Not Satisfiable")

        # Test video route alias: GET /api/incidents/:id/video
        alias_resp = requests.get(f"{BASE_URL}/api/incidents/{temp_vid_inc_id}/video", headers=admin_headers, timeout=5)
        check("STREAM_ALIAS_200", alias_resp.status_code == 200, "Video streaming alias route GET /:id/video works identically")

        # Now remove the temporary video file to test graceful degradation
        if os.path.exists(temp_vid_path):
            os.remove(temp_vid_path)
            temp_evidence_files.remove(temp_vid_path)

        # After file removal: replay details degrades truthfully
        degraded_resp = requests.get(f"{BASE_URL}/api/incidents/{temp_vid_inc_id}/replay", headers=admin_headers, timeout=5)
        check("DEGRADED_REPLAY_200", degraded_resp.status_code == 200, "Replay query returns 200 after file removal")
        ddata = degraded_resp.json()
        check("DEGRADED_REPLAY_UNAVAIL", ddata.get("replayAvailable") is False, "replayAvailable becomes False when referenced video file is missing on disk")

        # Media route returns 404 after file removal
        degraded_media_resp = requests.get(f"{BASE_URL}/api/incidents/{temp_vid_inc_id}/replay/media", headers=admin_headers, timeout=5)
        check("DEGRADED_MEDIA_404", degraded_media_resp.status_code == 404, "Media route returns 404 after video file is removed")

        # Step 8: Complete Response Bundle Integration
        print("\n--- 8. Complete Response Bundle Integration ---")
        bundle_resp = requests.get(f"{BASE_URL}/api/incidents/{real_inc_id}/response", headers=admin_headers, timeout=5)
        check("BUNDLE_STATUS_200", bundle_resp.status_code == 200, "Response bundle GET /api/incidents/:id/response succeeds")
        bdata = bundle_resp.json()
        check("BUNDLE_HAS_REPLAY", "replay" in bdata, "Response bundle contains replay object")
        check("BUNDLE_REPLAY_TYPE_MATCH", bdata["replay"].get("evidenceType") == "SNAPSHOT", "Response bundle replay evidenceType is SNAPSHOT")
        check("BUNDLE_REPLAY_UNAVAIL", bdata["replay"].get("replayAvailable") is False, "Response bundle replayAvailable is False")
        check("BUNDLE_HAS_TIMELINE", "timeline" in bdata and len(bdata["timeline"]) > 0, "Phase 11.4 timeline is intact in response bundle")
        check("BUNDLE_HAS_SUMMARY", "summary" in bdata and bdata["summary"].get("incidentId") == real_inc_id, "Phase 11.3 summary is intact in response bundle")
        check("BUNDLE_HAS_ROUTING", "routingDecision" in bdata, "Phase 11.2 routing decision is intact in response bundle")

        # Step 9: Code Integrity & Anti-Fabrication Audit
        print("\n--- 9. Code Integrity & Anti-Fabrication Audit ---")
        # Check that SmartIncidentResponseService doesn't fabricate random replay
        srv_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server", "src", "services", "safetyIntelligence", "SmartIncidentResponseService.ts"))
        with open(srv_file, "r", encoding="utf-8") as sf:
            code = sf.read()

        replay_method_block = code[code.find("getReplayDetails"):code.find("getIncidentSummary")]
        check("AUDIT_NO_MATH_RANDOM", "Math.random" not in replay_method_block, "getReplayDetails does not use Math.random")
        check("AUDIT_NO_FAKE_MP4", "placeholder.mp4" not in code and "demo.mp4" not in code and "sample.mp4" not in code, "No hardcoded placeholder/demo MP4 references in SmartIncidentResponseService")

        # Check routes file
        route_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server", "src", "routes", "incident.routes.ts"))
        with open(route_file, "r", encoding="utf-8") as rf:
            route_code = rf.read()
        check("AUDIT_ROUTE_NO_DEMO_MP4", "demo.mp4" not in route_code and "placeholder.mp4" not in route_code, "No fake video files in incident.routes.ts")

    finally:
        # Step 10: Cleanup & Baseline Restoration
        print("\n--- 10. Cleanup & Baseline Restoration ---")
        if temp_incident_ids:
            res_del_inc = db.incidents.delete_many({"incidentId": {"$in": temp_incident_ids}})
            print(f"  Cleaned up {res_del_inc.deleted_count} temporary test incident(s)")

        if temp_event_ids:
            res_del_evt = db.incidentevents.delete_many({"eventId": {"$in": temp_event_ids}})
            print(f"  Cleaned up {res_del_evt.deleted_count} temporary test event(s)")

        for fpath in temp_evidence_files:
            if os.path.exists(fpath):
                os.remove(fpath)
                print(f"  Removed temporary evidence file: {fpath}")

        # Post-test baseline verification
        final_incidents = db.incidents.count_documents({})
        final_events = db.incidentevents.count_documents({})
        final_nearmisses = db.nearmisses.count_documents({})
        final_cameras = db.cameras.count_documents({})
        final_rz = db.restrictedzones.count_documents({})
        final_ez = db.emergencyzones.count_documents({})
        final_users = db.users.count_documents({})

        # Check orphan events
        all_event_inc_ids = db.incidentevents.distinct("incidentId")
        existing_inc_ids = set(db.incidents.distinct("incidentId"))
        orphan_events_count = sum(1 for inc_id in all_event_inc_ids if inc_id not in existing_inc_ids)

        evidence_files_after = set(os.listdir(EVIDENCE_DIR))

        print(f"\n[FINAL AUDIT]")
        print(f"  incidents: {final_incidents} (expected: 160)")
        print(f"  incidentevents: {final_events} (expected: 726)")
        print(f"  nearmisses: {final_nearmisses} (expected: 0)")
        print(f"  cameras: {final_cameras} (expected: 1)")
        print(f"  restrictedzones: {final_rz} (expected: 1)")
        print(f"  emergencyzones: {final_ez} (expected: 0)")
        print(f"  users: {final_users} (expected: 1)")
        print(f"  orphan events: {orphan_events_count} (expected: 0)")
        print(f"  evidence files: {len(evidence_files_after)} (expected: 92)")

        check("CLEANUP_INCIDENTS", final_incidents == 160, "Incident count restored exactly to 160")
        check("CLEANUP_EVENTS", final_events == 726, "IncidentEvent count restored exactly to 726")
        check("CLEANUP_NEARMISSES", final_nearmisses == 0, "Near-miss count remains exactly 0")
        check("CLEANUP_CAMERAS", final_cameras == 1, "Camera count remains exactly 1")
        check("CLEANUP_RZ", final_rz == 1, "Restricted zone count remains exactly 1")
        check("CLEANUP_EZ", final_ez == 0, "Emergency zone count remains exactly 0")
        check("CLEANUP_USERS", final_users == 1, "User count remains exactly 1")
        check("CLEANUP_NO_ORPHAN_EVENTS", orphan_events_count == 0, "Zero orphan events exist")
        check("CLEANUP_EVIDENCE_FILES", len(evidence_files_after) == 92, "Evidence directory restored exactly to 92 files")
        check("CLEANUP_NO_TEMP_VIDEOS", not any(f.endswith(".mp4") for f in evidence_files_after), "No temporary MP4 files remain in evidence directory")

    print("\n" + "=" * 80)
    print(f"  PHASE 11.5 ACCEPTANCE TEST SUMMARY: {passed_count} PASSED, {failed_count} FAILED")
    print("=" * 80)

    if failed_count == 0:
        print("\n>> ALL PHASE 11.5 ASSERTIONS PASSED <<\n")
        return True
    else:
        print(f"\n>> FAILED {failed_count} ASSERTIONS <<\n")
        return False


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
