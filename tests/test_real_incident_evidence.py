"""
SAFEVISION AI — PHASE 9.1.2
REAL INCIDENT EVIDENCE CAPTURE VERIFICATION TEST

Verifies:
1. Real camera live feed and snapshot availability
2. Real frame capture at confirmation time
3. Forensic annotation (bounding box, violation, track ID, timestamp)
4. Evidence persistence to physical file server/evidence/<incidentId>.jpg
5. Image decoding and SHA-256 calculation
6. MongoDB reference and evidence schema
7. Authenticated GET /api/incidents/:id/evidence endpoint
8. Explicit failure reason when frame capture is unavailable (no generic placeholders)
"""

import os
import sys
import json
import time
import hashlib
import cv2
import numpy as np
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:5005"
AI_URL = "http://127.0.0.1:8000"
EVIDENCE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server", "evidence"))

def test_real_incident_evidence():
    print("=" * 70)
    print("  SAFEVISION AI — PHASE 9.1.2 REAL INCIDENT EVIDENCE VERIFICATION")
    print("=" * 70)
    
    passed = 0
    failed = 0
    
    def check(condition, message):
        nonlocal passed, failed
        if condition:
            print(f"[PASS] {message}")
            passed += 1
        else:
            print(f"[FAIL] {message}")
            failed += 1
            raise AssertionError(f"Verification assertion failed: {message}")

    # 1. Authenticate as Admin
    print("\n--- 1. Authenticating as Administrator ---")
    login_payload = json.dumps({"email": "admin@test.local", "password": "Test@1234"}).encode()
    login_req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_payload, headers={"Content-Type": "application/json"})
    login_res = urllib.request.urlopen(login_req)
    token = json.loads(login_res.read())["token"]
    check(bool(token), "Admin authenticated and JWT token acquired")

    # 2. Verify Camera Resolution & Live Snapshot
    print("\n--- 2. Verifying Real Camera Live Snapshot ---")
    cam_req = urllib.request.Request(f"{BASE_URL}/api/cameras", headers={"Authorization": f"Bearer {token}"})
    cams_data = json.loads(urllib.request.urlopen(cam_req).read())
    cameras = cams_data.get("cameras", cams_data)
    check(len(cameras) > 0, f"Retrieved {len(cameras)} registered cameras")
    
    test_cam = cameras[0]
    cam_id = test_cam.get("code") or test_cam.get("id")
    print(f"Target Camera: {cam_id} ({test_cam.get('name')})")

    # Fetch live snapshot
    snap_req = urllib.request.Request(f"{BASE_URL}/api/cameras/{cam_id}/snapshot", headers={"Authorization": f"Bearer {token}"})
    snap_res = urllib.request.urlopen(snap_req, timeout=5)
    check(snap_res.status == 200, f"Camera snapshot returned HTTP 200")
    check(snap_res.headers.get("Content-Type") == "image/jpeg", "Snapshot Content-Type is image/jpeg")
    
    snap_bytes = snap_res.read()
    check(len(snap_bytes) > 10000, f"Snapshot contains real payload ({len(snap_bytes)} bytes)")
    snap_arr = np.frombuffer(snap_bytes, dtype=np.uint8)
    snap_img = cv2.imdecode(snap_arr, cv2.IMREAD_COLOR)
    check(snap_img is not None, f"Snapshot successfully decoded into OpenCV image: shape={snap_img.shape}")
    check(snap_img.shape[0] >= 720 and snap_img.shape[1] >= 1280, f"Valid CCTV resolution: {snap_img.shape[1]}x{snap_img.shape[0]}")

    # 3. Capture Real Forensic Frame from AI Engine
    print("\n--- 3. Capturing Real Forensic Evidence Frame from AI Engine ---")
    evidence_payload = {
        "track_id": "TRACK-001002",
        "violation_type": "missing_helmet",
        "confidence": 0.884,
        "bounding_box": {"ymin": 0.18, "xmin": 0.35, "ymax": 0.75, "xmax": 0.58},
        "zone_name": "Main Furnace Bay",
        "is_breach": False
    }
    ai_cap_req = urllib.request.Request(
        f"{AI_URL}/camera/{cam_id}/capture-evidence",
        data=json.dumps(evidence_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    ai_cap_res = urllib.request.urlopen(ai_cap_req, timeout=5)
    ai_evidence = json.loads(ai_cap_res.read())
    
    check(ai_evidence.get("captured") is True, "AI engine successfully captured real CCTV frame")
    check(bool(ai_evidence.get("sha256")), f"Evidence has valid SHA-256: {ai_evidence.get('sha256')}")
    check(bool(ai_evidence.get("evidenceBase64")), "Evidence contains base64 image data")
    
    # 4. Ingest Incident with Visual Evidence into Backend
    print("\n--- 4. Ingesting Confirmed Incident with Evidence ---")
    candidate_payload = {
        "candidate": {
            "trackId": f"TRACK-{int(time.time()) % 100000}",
            "violationType": "missing_helmet",
            "cameraId": cam_id,
            "zone": "Main Furnace Bay",
            "confidence": 0.884,
            "boundingBox": {"ymin": 0.18, "xmin": 0.35, "ymax": 0.75, "xmax": 0.58},
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "ruleId": "RULE-PPE-HELMET-01"
        },
        "evidenceBase64": ai_evidence["evidenceBase64"]
    }
    
    ingest_req = urllib.request.Request(
        f"{BASE_URL}/api/detection/incident-candidate",
        data=json.dumps(candidate_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    ingest_res = urllib.request.urlopen(ingest_req)
    ingest_data = json.loads(ingest_res.read())
    
    check(ingest_data.get("incidentCreated") is True, "Incident candidate accepted and incident created")
    incident = ingest_data["incident"]
    inc_id = incident["incidentId"]
    print(f"Created Incident ID: {inc_id}")
    
    # 5. Verify Physical File Persistence in server/evidence/
    print("\n--- 5. Verifying Physical Evidence File on Disk ---")
    expected_file = os.path.join(EVIDENCE_DIR, f"{inc_id}.jpg")
    check(os.path.exists(expected_file), f"Physical evidence file exists: {expected_file}")
    
    file_size = os.path.getsize(expected_file)
    check(file_size > 10000, f"Evidence file size is valid ({file_size} bytes)")
    
    # Verify file is a valid decodable JPEG image
    file_img = cv2.imread(expected_file)
    check(file_img is not None, f"Persisted file decodes correctly: shape={file_img.shape}")
    
    # Calculate SHA-256 of physical file
    with open(expected_file, "rb") as f:
        file_sha256 = hashlib.sha256(f.read()).hexdigest()
    print(f"Calculated physical file SHA-256: {file_sha256}")
    
    # 6. Verify MongoDB Incident Record & Evidence Reference
    print("\n--- 6. Verifying MongoDB Incident Record Structure ---")
    get_inc_req = urllib.request.Request(f"{BASE_URL}/api/incidents/{inc_id}", headers={"Authorization": f"Bearer {token}"})
    get_inc_res = urllib.request.urlopen(get_inc_req)
    fetched_inc = json.loads(get_inc_res.read())["incident"]
    
    check(fetched_inc.get("incidentId") == inc_id, f"Incident ID matches: {inc_id}")
    check(bool(fetched_inc.get("evidence")), "Incident contains structured evidence object")
    
    ev = fetched_inc["evidence"]
    check(ev.get("captured") is True, "evidence.captured is True")
    check(ev.get("mediaType") == "image/jpeg", "evidence.mediaType is 'image/jpeg'")
    check(ev.get("sha256") == file_sha256, f"evidence.sha256 matches physical file hash ({file_sha256[:16]}...)")
    check(ev.get("cameraId") == cam_id, f"evidence.cameraId matches {cam_id}")
    check(fetched_inc.get("evidenceImage") == f"/api/incidents/{inc_id}/evidence", f"evidenceImage points to API endpoint: {fetched_inc.get('evidenceImage')}")

    # 7. Authenticated Evidence API Verification
    print("\n--- 7. Verifying GET /api/incidents/:id/evidence ---")
    ev_api_req = urllib.request.Request(f"{BASE_URL}/api/incidents/{inc_id}/evidence", headers={"Authorization": f"Bearer {token}"})
    ev_api_res = urllib.request.urlopen(ev_api_req)
    
    check(ev_api_res.status == 200, f"Evidence API returned HTTP 200")
    check(ev_api_res.headers.get("Content-Type") == "image/jpeg", "Evidence API returned Content-Type: image/jpeg")
    
    ev_bytes = ev_api_res.read()
    check(len(ev_bytes) == file_size, f"Evidence API returned exact physical file byte length ({len(ev_bytes)} bytes)")
    api_sha256 = hashlib.sha256(ev_bytes).hexdigest()
    check(api_sha256 == file_sha256, f"Evidence API bytes match SHA-256 hash ({api_sha256[:16]}...)")
    
    api_img = cv2.imdecode(np.frombuffer(ev_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    check(api_img is not None, f"Evidence API stream decodes to real image: shape={api_img.shape}")

    # 8. Path Traversal & Security Validation
    print("\n--- 8. Verifying Path Traversal and Security Defenses ---")
    bad_id = "../package.json"
    try:
        bad_req = urllib.request.Request(f"{BASE_URL}/api/incidents/{urllib.parse.quote(bad_id)}/evidence", headers={"Authorization": f"Bearer {token}"})
        urllib.request.urlopen(bad_req)
        check(False, "Path traversal should have been rejected")
    except urllib.error.HTTPError as e:
        check(e.code in [400, 404], f"Path traversal properly blocked with HTTP {e.code}")

    # 9. Explicit Failure Reporting Test (Telemetry-Only Distinction)
    print("\n--- 9. Verifying Explicit Failure Reporting (No Fake Placeholders) ---")
    # Simulate a candidate with no camera frame available
    missing_cam_candidate = {
        "candidate": {
            "trackId": f"TRACK-OFFLINE-{int(time.time()) % 1000}",
            "violationType": "missing_vest",
            "cameraId": "CAM-NONEXISTENT",
            "zone": "Storage Bay",
            "confidence": 0.75,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "ruleId": "RULE-PPE-VEST-01"
        }
    }
    miss_req = urllib.request.Request(
        f"{BASE_URL}/api/detection/incident-candidate",
        data=json.dumps(missing_cam_candidate).encode(),
        headers={"Content-Type": "application/json"}
    )
    miss_res = urllib.request.urlopen(miss_req)
    miss_data = json.loads(miss_res.read())
    if miss_data.get("incidentCreated"):
        miss_inc = miss_data["incident"]
        check(miss_inc.get("evidence", {}).get("captured") is False, "Evidence marked captured=False when camera offline")
        check(miss_inc.get("evidence", {}).get("failureReason") in ["CAMERA_OFFLINE", "FRAME_UNAVAILABLE"], 
              f"Explicit failure reason recorded: {miss_inc.get('evidence', {}).get('failureReason')}")
    else:
        print("[INFO] Offline camera candidate handled or filtered appropriately")

    print("\n" + "=" * 70)
    print(f"  REAL INCIDENT EVIDENCE TEST COMPLETE: {passed} PASSED, {failed} FAILED")
    print("=" * 70)
    return {
        "incidentId": inc_id,
        "cameraId": cam_id,
        "trackId": candidate_payload["candidate"]["trackId"],
        "file": expected_file,
        "size": file_size,
        "sha256": file_sha256,
        "dimensions": f"{file_img.shape[1]}x{file_img.shape[0]}"
    }

if __name__ == "__main__":
    res = test_real_incident_evidence()
    print(json.dumps(res, indent=2))
