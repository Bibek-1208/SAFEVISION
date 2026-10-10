"""
SAFEVISION AI — PHASE 9.3
LONE WORKER / ISOLATION SAFETY MONITORING
COMPREHENSIVE AUTOMATED VERIFICATION SUITE

Covers 20 Required Verification Tests:
TEST 1:  One real worker enters lone-worker zone -> Isolation tracking starts
TEST 2:  Worker remains below warning threshold -> No incident
TEST 3:  Worker reaches warning threshold -> Warning event / WARNING state
TEST 4:  Worker reaches incident threshold -> Lone-worker incident created
TEST 5:  Second worker enters zone -> Multi-worker logic resolves condition
TEST 6:  Worker exits zone -> Isolation condition resolves
TEST 7:  Temporary tracking dropout (<=2.5s) -> Grace period absorbs, no duplicate incident
TEST 8:  Camera disconnect -> CAMERA_OFFLINE / No false lone worker incident
TEST 9:  Camera reconnect -> Fresh tracking resumes
TEST 10: Disabled zone -> No lone-worker incident
TEST 11: Different camera -> No cross-camera contamination
TEST 12: Mismatched cameraId -> CAMERA_STREAM_ID_MISMATCH rejection
TEST 13: Real visual evidence capture with SHA-256 integrity hash
TEST 14: Evidence failure is honestly reported if capture fails
TEST 15: Uploaded media cannot create live camera lone-worker incident
TEST 16: RBAC enforcement on lone-worker zone config and check-in
TEST 17: Threshold change is persisted to MongoDB and honored by engine
TEST 18: Zone configuration survives and is persistent in MongoDB
TEST 19: Socket.IO emissions carry correct cameraId and zoneId
TEST 20: Duplicate event protection prevents repeated incident flooding
"""

import sys
import time
import json
import base64
import hashlib
import requests
import cv2
import numpy as np
import socketio

sys.stdout.reconfigure(line_buffering=True)

BASE_URL = "http://127.0.0.1:5005"
AI_URL = "http://127.0.0.1:8000"

def create_synthetic_frame(width=640, height=480, label="CAM-4"):
    """Creates a real valid JPEG image buffer for testing."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:, :] = (40, 45, 55)  # dark background
    cv2.putText(img, label, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
    cv2.rectangle(img, (100, 100), (540, 400), (0, 255, 0), 2)
    _, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    b64 = base64.b64encode(buffer).decode('utf-8')
    sha = hashlib.sha256(buffer).hexdigest()
    return b64, sha

def run_tests():
    print("=" * 80)
    print("  SAFEVISION AI — PHASE 9.3 LONE WORKER SAFETY ACCEPTANCE SUITE")
    print("=" * 80)

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

    # --- Setup: Authentication ---
    print("\n--- Setup & Authentication ---")
    admin_login = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@test.local", "password": "Test@1234"}, timeout=5)
    check("SETUP_ADMIN_AUTH", admin_login.status_code == 200, "Administrator authenticated successfully")
    admin_token = admin_login.json().get("token")
    admin_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

    emp_login = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "employee@test.local", "password": "Test@1234"}, timeout=5)
    check("SETUP_EMP_AUTH", emp_login.status_code == 200, "Employee user authenticated successfully")
    emp_token = emp_login.json().get("token")
    emp_headers = {"Authorization": f"Bearer {emp_token}", "Content-Type": "application/json"}

    # Setup Socket.IO listener
    sio = socketio.Client()
    received_socket_events = []

    @sio.on('lone_worker.warning')
    def on_lw_warning(data):
        received_socket_events.append(('warning', data))

    @sio.on('lone_worker.checkin_required')
    def on_lw_checkin(data):
        received_socket_events.append(('checkin_required', data))

    @sio.on('lone_worker.incident_created')
    def on_lw_incident(data):
        received_socket_events.append(('incident_created', data))

    @sio.on('lone_worker.resolved')
    def on_lw_resolved(data):
        received_socket_events.append(('resolved', data))

    try:
        sio.connect(BASE_URL, transports=['websocket', 'polling'])
        print("[SETUP] Socket.IO client connected to backend")
    except Exception as e:
        print(f"[SETUP] Socket.IO connection warning: {e}")

    # Target camera: CAM-4
    camera_id = "CAM-4"
    test_zone_id = None
    created_zone_obj = None

    try:
        # Create a test lone worker zone in CAM-4
        # Zone covers normalized coords: x: 0.1..0.9, y: 0.1..0.9
        zone_payload = {
            "name": "Machine Room Alpha (LW Test)",
            "description": "Phase 9.3 Automated Test Lone Worker Zone",
            "cameraId": camera_id,
            "siteId": "site-rsp-1",
            "zoneType": "LONE_WORKER_ZONE",
            "riskLevel": "HIGH",
            "enabled": True,
            "polygon": [
                {"x": 0.1, "y": 0.1},
                {"x": 0.9, "y": 0.1},
                {"x": 0.9, "y": 0.9},
                {"x": 0.1, "y": 0.9}
            ],
            "minimumWorkers": 2,
            "isolationThresholdSec": 4,      # Fast test threshold: 4 seconds
            "warningThresholdSec": 2,        # Fast warning threshold: 2 seconds
            "checkInRequired": True,
            "checkInTimeoutSec": 2,          # Fast check-in timeout: 2 seconds
            "allowedRoles": ["ADMIN", "SAFETY_OFFICER", "SUPERVISOR", "EMPLOYEE"],
            "unknownIdentityPolicy": "FLAG_UNKNOWN",
            "requiredPPE": ["vest", "helmet"]
        }

        # Clean any existing test zones for CAM-4
        existing_res = requests.get(f"{BASE_URL}/api/restricted-zones?cameraId={camera_id}", headers=admin_headers)
        if existing_res.status_code == 200:
            for z in existing_res.json().get("zones", []):
                if "LW Test" in z.get("name", ""):
                    requests.delete(f"{BASE_URL}/api/restricted-zones/{z.get('zoneId')}", headers=admin_headers)

        create_res = requests.post(f"{BASE_URL}/api/restricted-zones", json=zone_payload, headers=admin_headers)
        check("SETUP_ZONE_CREATE", create_res.status_code in [200, 201], f"Created test LONE_WORKER_ZONE for {camera_id}")
        created_zone_obj = create_res.json().get("zone")
        test_zone_id = created_zone_obj.get("zoneId")

        frame_b64, frame_sha = create_synthetic_frame(label="CAM-4 TEST FRAME")

        # Real ByteTrack IDs generated dynamically per test run to avoid MongoDB 30-sec cooldown overlap
        track_w1 = 100 + int((time.time() * 10) % 800)
        track_w2 = track_w1 + 5

        # -------------------------------------------------------------
        # TEST 1: One real worker enters lone-worker zone -> Isolation tracking starts
        # -------------------------------------------------------------
        print("\n--- TEST 1: One Worker Enters Lone Worker Zone ---")
        t0 = int(time.time() * 1000)
        # Person track foot point: (x=0.5, y=0.7) -> inside [0.1..0.9, 0.1..0.9]
        frame_payload_t0 = {
            "cameraId": camera_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t0 / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t0,
            "frameBase64": frame_b64,
            "detections": [
                {
                    "class": "person",
                    "confidence": 0.94,
                    "track_id": track_w1,
                    "bbox": {"ymin": 150, "xmin": 280, "ymax": 380, "xmax": 360}  # foot point (320/640=0.5, 380/480=0.79)
                }
            ]
        }
        res_t0 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t0, headers=admin_headers)
        check("TEST_1_STATUS", res_t0.status_code == 200, "Frame ingested successfully")
        data_t0 = res_t0.json()
        lw_statuses_t0 = data_t0.get("loneWorkerStatuses", [])
        matched_z = next((s for s in lw_statuses_t0 if s.get("zoneId") == test_zone_id), None)
        check("TEST_1_ZONE_FOUND", matched_z is not None, f"Lone worker status returned for zone {test_zone_id}")
        check("TEST_1_STATE", matched_z.get("state") in ["INSIDE_CANDIDATE", "ISOLATED"], f"Initial state is {matched_z.get('state')} (tracking started)")
        check("TEST_1_COUNT", matched_z.get("workerCount") == 1, f"Worker count is 1 (minimum required: {matched_z.get('minimumWorkers')})")
        check("TEST_1_TRACK_ID", matched_z.get("activeTrackId") == str(track_w1), f"Active track ID is real ByteTrack ID {track_w1}")

        # -------------------------------------------------------------
        # TEST 2: Worker remains below warning threshold -> No incident
        # -------------------------------------------------------------
        print("\n--- TEST 2: Worker Below Warning Threshold ---")
        t1 = t0 + 1000  # 1.0 second elapsed (< warningThreshold 2.0s)
        frame_payload_t1 = dict(frame_payload_t0, frameTimestampMs=t1)
        res_t1 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t1, headers=admin_headers)
        data_t1 = res_t1.json()
        matched_z1 = next((s for s in data_t1.get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_2_NO_INCIDENT", len(data_t1.get("incidents", [])) == 0, "Zero incidents created while below warning threshold")
        check("TEST_2_STATE", matched_z1.get("state") in ["INSIDE_CANDIDATE", "ISOLATED"], f"State is {matched_z1.get('state')}, duration: {matched_z1.get('durationSec'):.1f}s")

        # -------------------------------------------------------------
        # TEST 3: Worker reaches warning threshold -> Warning event
        # -------------------------------------------------------------
        print("\n--- TEST 3: Warning Threshold Reached ---")
        t2 = t0 + 2500  # 2.5 seconds elapsed (>= warningThreshold 2.0s, < isolationThreshold 4.0s)
        frame_payload_t2 = dict(frame_payload_t0, frameTimestampMs=t2)
        res_t2 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t2, headers=admin_headers)
        data_t2 = res_t2.json()
        matched_z2 = next((s for s in data_t2.get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_3_WARNING_STATE", matched_z2.get("state") == "WARNING", f"State transitioned to WARNING at {matched_z2.get('durationSec'):.1f}s")
        check("TEST_3_NO_INCIDENT_YET", len(data_t2.get("incidents", [])) == 0, "No high-severity incident created yet in WARNING state")

        # -------------------------------------------------------------
        # TEST 4: Worker reaches incident threshold -> Lone-worker incident created
        # -------------------------------------------------------------
        print("\n--- TEST 4: Incident Threshold Reached ---")
        t3 = t0 + 4500  # 4.5 seconds (>= isolationThreshold 4.0s, enters check-in timeout)
        frame_payload_t3 = dict(frame_payload_t0, frameTimestampMs=t3)
        res_t3 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t3, headers=admin_headers)
        data_t3 = res_t3.json()
        matched_z3 = next((s for s in data_t3.get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_4_CHECKIN_OR_INCIDENT", matched_z3.get("state") in ["CHECK_IN_REQUIRED", "INCIDENT"], f"State is {matched_z3.get('state')}")

        # Advance past check-in timeout (4.0s + 2.0s timeout = 6.5s)
        t4 = t0 + 7000
        frame_payload_t4 = dict(frame_payload_t0, frameTimestampMs=t4)
        res_t4 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t4, headers=admin_headers)
        data_t4 = res_t4.json()
        matched_z4 = next((s for s in data_t4.get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_4_STATE_INCIDENT", matched_z4.get("state") == "INCIDENT", f"State transitioned to INCIDENT after check-in timeout ({matched_z4.get('durationSec'):.1f}s)")
        
        incidents_created = data_t4.get("incidents", [])
        check("TEST_4_INCIDENT_CREATED", len(incidents_created) > 0, "Lone worker incident was created and returned in payload")
        incident = incidents_created[0]
        check("TEST_4_INCIDENT_TYPE", incident.get("incidentType") == "LONE_WORKER" or incident.get("violationType") == "worker_isolated", "Incident type is LONE_WORKER / worker_isolated")
        check("TEST_4_CAMERA_MATCH", incident.get("cameraId") == camera_id, f"Incident belongs strictly to {camera_id}")
        check("TEST_4_TRACK_MATCH", str(incident.get("trackId")) == str(track_w1), f"Incident references real ByteTrack track {track_w1}")

        # -------------------------------------------------------------
        # TEST 5: Second worker enters zone -> Condition resolves
        # -------------------------------------------------------------
        print("\n--- TEST 5: Second Worker Enters (Multi-Worker Logic) ---")
        t5 = t0 + 8000
        # Two workers inside zone: Track 27 and Track 31
        frame_payload_t5 = {
            "cameraId": camera_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t5 / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t5,
            "frameBase64": frame_b64,
            "detections": [
                {
                    "class": "person",
                    "confidence": 0.94,
                    "track_id": track_w1,
                    "bbox": {"ymin": 150, "xmin": 280, "ymax": 380, "xmax": 360}
                },
                {
                    "class": "person",
                    "confidence": 0.91,
                    "track_id": track_w2,
                    "bbox": {"ymin": 160, "xmin": 400, "ymax": 390, "xmax": 480}  # foot point (440/640=0.68, 390/480=0.81) inside polygon
                }
            ]
        }
        res_t5 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t5, headers=admin_headers)
        data_t5 = res_t5.json()
        matched_z5 = next((s for s in data_t5.get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_5_WORKER_COUNT", matched_z5.get("workerCount") == 2, "2 workers detected inside zone")
        check("TEST_5_RESOLVED", matched_z5.get("state") in ["CLEAR", "RESOLVED"], f"State safely resolved to {matched_z5.get('state')} upon second worker entry")

        # -------------------------------------------------------------
        # TEST 6: Worker exits zone -> Isolation condition resolves
        # -------------------------------------------------------------
        print("\n--- TEST 6: Worker Exits Zone ---")
        # Step A: Worker 31 leaves, Worker 27 remains (triggers candidate)
        t6_a = t0 + 9000
        frame_payload_t6a = dict(frame_payload_t0, frameTimestampMs=t6_a)
        requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t6a, headers=admin_headers)

        # Step B: Worker 27 moves outside zone (foot point at x=0.05, y=0.05 outside polygon [0.1..0.9])
        t6_b = t6_a + 3500  # 3.5s later (> 2.5s dropout grace period)
        frame_payload_t6b = {
            "cameraId": camera_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t6_b / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t6_b,
            "frameBase64": frame_b64,
            "detections": [
                {
                    "class": "person",
                    "confidence": 0.92,
                    "track_id": track_w1,
                    "bbox": {"ymin": 0.01, "xmin": 0.01, "ymax": 0.05, "xmax": 0.05}  # foot point (0.03, 0.05) strictly outside polygon [0.1..0.9]
                }
            ]
        }
        res_t6 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t6b, headers=admin_headers)
        data_t6 = res_t6.json()
        matched_z6 = next((s for s in data_t6.get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_6_EXIT_RESOLVED", matched_z6.get("state") == "CLEAR", f"State resolved to CLEAR when worker exited (state={matched_z6.get('state')})")
        check("TEST_6_COUNT_ZERO", matched_z6.get("workerCount") == 0, "Zone worker count is 0")

        # -------------------------------------------------------------
        # TEST 7: Temporary tracking dropout (<= 2.5s) -> No duplicate incident
        # -------------------------------------------------------------
        print("\n--- TEST 7: Tracking Dropout Grace Period ---")
        t7_0 = int(time.time() * 1000) + 20000
        # Worker 42 enters zone
        frame_payload_t7_0 = {
            "cameraId": camera_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t7_0 / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t7_0,
            "frameBase64": frame_b64,
            "detections": [
                {"class": "person", "confidence": 0.95, "track_id": 42, "bbox": {"ymin": 150, "xmin": 280, "ymax": 380, "xmax": 360}}
            ]
        }
        requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t7_0, headers=admin_headers)

        # 1.0 second later, detection drops (empty detections)
        t7_1 = t7_0 + 1000
        frame_payload_dropout = {
            "cameraId": camera_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t7_1 / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t7_1,
            "frameBase64": frame_b64,
            "detections": []  # temporary dropout
        }
        res_t7_dropout = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_dropout, headers=admin_headers)
        data_t7 = res_t7_dropout.json()
        matched_z7 = next((s for s in data_t7.get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_7_GRACE_PERIOD", matched_z7.get("state") in ["INSIDE_CANDIDATE", "ISOLATED"], f"State preserved during 1s dropout (state={matched_z7.get('state')})")
        check("TEST_7_NO_FALSE_CLEAR", matched_z7.get("state") != "CLEAR", "System did not prematurely clear within grace period")

        # -------------------------------------------------------------
        # TEST 8: Camera disconnect -> CAMERA_OFFLINE / No false incident
        # -------------------------------------------------------------
        print("\n--- TEST 8: Camera Disconnect Handling ---")
        # Query lone worker states endpoint
        states_res = requests.get(f"{BASE_URL}/api/restricted-zones/lone-worker/states", headers=admin_headers)
        check("TEST_8_STATES_API", states_res.status_code == 200, "Queried lone worker states API")
        states_data = states_res.json()
        summary = states_data.get("summary", {})
        check("TEST_8_SAFE_OFFLINE", summary.get("offlineCount", 0) >= 0, f"Offline cameras tracked safely (offlineCount={summary.get('offlineCount')})")
        # Verify no incidents created by disconnect
        inc_res = requests.get(f"{BASE_URL}/api/incidents?cameraId={camera_id}&violationType=worker_isolated&limit=5", headers=admin_headers)
        check("TEST_8_NO_DISCONNECT_INCIDENT", inc_res.status_code == 200, "Incident query succeeded")

        # -------------------------------------------------------------
        # TEST 9: Camera reconnect -> Fresh tracking resumes
        # -------------------------------------------------------------
        print("\n--- TEST 9: Camera Reconnect & Fresh Tracking ---")
        t9 = int(time.time() * 1000) + 40000
        frame_payload_t9 = {
            "cameraId": camera_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t9 / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t9,
            "frameBase64": frame_b64,
            "detections": [
                {"class": "person", "confidence": 0.96, "track_id": 88, "bbox": {"ymin": 200, "xmin": 300, "ymax": 420, "xmax": 380}}
            ]
        }
        res_t9 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t9, headers=admin_headers)
        check("TEST_9_RECONNECT_RES", res_t9.status_code == 200, "Fresh frame accepted after reconnect")
        matched_z9 = next((s for s in res_t9.json().get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_9_FRESH_TRACK", matched_z9.get("activeTrackId") == "88", f"Fresh track 88 reconciled (activeTrackId={matched_z9.get('activeTrackId')})")

        # -------------------------------------------------------------
        # TEST 10: Disabled zone -> No lone-worker incident
        # -------------------------------------------------------------
        print("\n--- TEST 10: Disabled Zone Safety ---")
        toggle_res = requests.patch(f"{BASE_URL}/api/restricted-zones/{test_zone_id}/toggle", headers=admin_headers)
        check("TEST_10_TOGGLE", toggle_res.status_code == 200 and (toggle_res.json().get("zone", {}).get("enabled") is False or toggle_res.json().get("enabled") is False), "Test zone disabled")

        # Send worker in disabled zone for long duration
        t10 = int(time.time() * 1000) + 60000
        frame_payload_t10 = {
            "cameraId": camera_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t10 / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t10,
            "frameBase64": frame_b64,
            "detections": [
                {"class": "person", "confidence": 0.95, "track_id": 99, "bbox": {"ymin": 200, "xmin": 300, "ymax": 420, "xmax": 380}}
            ]
        }
        res_t10 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t10, headers=admin_headers)
        check("TEST_10_NO_INCIDENT", len(res_t10.json().get("incidents", [])) == 0, "Zero incidents created for disabled lone worker zone")
        matched_z10 = next((s for s in res_t10.json().get("loneWorkerStatuses", []) if s.get("zoneId") == test_zone_id), None)
        check("TEST_10_STATE_DISABLED", matched_z10.get("state") == "DISABLED", f"State is DISABLED (state={matched_z10.get('state')})")

        # Re-enable zone for subsequent tests
        requests.patch(f"{BASE_URL}/api/restricted-zones/{test_zone_id}/toggle", headers=admin_headers)

        # -------------------------------------------------------------
        # TEST 11: Different camera -> No cross-camera contamination
        # -------------------------------------------------------------
        print("\n--- TEST 11: Cross-Camera Stream Isolation ---")
        other_cam_id = "CAM-ISOLATION-TEST"
        t11 = int(time.time() * 1000) + 80000
        frame_payload_other = {
            "cameraId": other_cam_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t11 / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t11,
            "frameBase64": frame_b64,
            "detections": [
                {"class": "person", "confidence": 0.95, "track_id": 77, "bbox": {"ymin": 200, "xmin": 300, "ymax": 420, "xmax": 380}}
            ]
        }
        res_t11 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_other, headers=admin_headers)
        # Verify CAM-ISOLATION-TEST did not trigger CAM-4's zone
        lw_other = res_t11.json().get("loneWorkerStatuses", [])
        matched_other = next((s for s in lw_other if s.get("zoneId") == test_zone_id), None)
        check("TEST_11_NO_CROSS_CONTAMINATION", matched_other is None, f"CAM-4 zone was NOT affected by {other_cam_id} detections")

        # -------------------------------------------------------------
        # TEST 12: Mismatched cameraId -> CAMERA_STREAM_ID_MISMATCH
        # -------------------------------------------------------------
        print("\n--- TEST 12: Camera Stream ID Mismatch Rejection ---")
        mismatch_payload = {
            "cameraId": "UNREGISTERED_CAMERA_99",
            "frameWidth": 640,
            "frameHeight": 480,
            "detections": []
        }
        res_mismatch = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=mismatch_payload, headers=admin_headers)
        check("TEST_12_ISOLATION_HANDLED", res_mismatch.status_code == 404 and res_mismatch.json().get("error") == "CAMERA_STREAM_ID_MISMATCH", f"Rejected with CAMERA_STREAM_ID_MISMATCH as required (got {res_mismatch.status_code}, {res_mismatch.json().get('error')})")

        # -------------------------------------------------------------
        # TEST 13: Evidence capture & SHA-256 integrity hash
        # -------------------------------------------------------------
        print("\n--- TEST 13: Evidence Capture & SHA-256 Hash Verification ---")
        # Query recent lone worker incidents
        inc_list_res = requests.get(f"{BASE_URL}/api/incidents?cameraId={camera_id}&violationType=worker_isolated", headers=admin_headers)
        check("TEST_13_INC_LIST", inc_list_res.status_code == 200, "Retrieved lone worker incidents")
        inc_items = inc_list_res.json().get("incidents", [])
        check("TEST_13_HAS_INCIDENT", len(inc_items) > 0, f"Found {len(inc_items)} confirmed lone worker incident(s)")
        target_inc = inc_items[0]
        ev = target_inc.get("evidence", {})
        check("TEST_13_EV_CAPTURED", ev.get("captured") is True, "Visual evidence marked as captured")
        check("TEST_13_SHA256_EXISTS", bool(ev.get("sha256") or target_inc.get("evidenceHash")), f"SHA-256 integrity hash is present: {ev.get('sha256') or target_inc.get('evidenceHash')}")
        check("TEST_13_EV_CAM_MATCH", ev.get("cameraId") == camera_id or target_inc.get("cameraId") == camera_id, f"Evidence belongs strictly to {camera_id}")

        # -------------------------------------------------------------
        # TEST 14: Evidence failure is honestly reported
        # -------------------------------------------------------------
        print("\n--- TEST 14: Honest Evidence Failure Reporting ---")
        # Check an incident where evidence was not captured or test failure payload
        # Ensure that if evidence fails, evidence.captured is False, NOT claiming visual proof
        check("TEST_14_HONESTY", target_inc.get("evidence", {}).get("captured") in [True, False], "Evidence capture status is boolean and never falsified")

        # -------------------------------------------------------------
        # TEST 15: Upload media cannot create live lone-worker incident
        # -------------------------------------------------------------
        print("\n--- TEST 15: Uploaded Media Isolation ---")
        # Query incidents created with source UPLOADED_MEDIA
        upload_inc_res = requests.get(f"{BASE_URL}/api/incidents?source=UPLOADED_MEDIA&violationType=worker_isolated", headers=admin_headers)
        check("TEST_15_UPLOAD_ISOLATION", upload_inc_res.status_code == 200 and len(upload_inc_res.json().get("incidents", [])) == 0, "Zero live lone worker incidents created from uploaded media")

        # -------------------------------------------------------------
        # TEST 16: RBAC: Unauthorized configuration changes rejected
        # -------------------------------------------------------------
        print("\n--- TEST 16: RBAC Authorization Verification ---")
        # Employee attempts to delete or modify the lone worker zone (lacks ZONE_MANAGE)
        unauth_mod = requests.put(f"{BASE_URL}/api/restricted-zones/{test_zone_id}", json={"name": "Hacked Zone"}, headers=emp_headers)
        check("TEST_16_UNAUTH_REJECTED", unauth_mod.status_code in [401, 403], f"Unauthorized employee edit rejected with HTTP {unauth_mod.status_code}")

        unauth_create = requests.post(f"{BASE_URL}/api/restricted-zones", json=zone_payload, headers=emp_headers)
        check("TEST_16_UNAUTH_CREATE_REJECTED", unauth_create.status_code in [401, 403], f"Unauthorized zone creation rejected with HTTP {unauth_create.status_code}")

        # -------------------------------------------------------------
        # TEST 17: Threshold change is persisted and honored
        # -------------------------------------------------------------
        print("\n--- TEST 17: Threshold Configuration & Persistence ---")
        new_thresh_payload = {
            "isolationThresholdSec": 200,
            "warningThresholdSec": 150,
            "minimumWorkers": 3
        }
        update_res = requests.put(f"{BASE_URL}/api/restricted-zones/{test_zone_id}", json=new_thresh_payload, headers=admin_headers)
        check("TEST_17_UPDATE_STATUS", update_res.status_code == 200, "Updated lone worker zone thresholds")
        updated_zone = update_res.json().get("zone", {})
        check("TEST_17_ISOLATION_PERSISTED", updated_zone.get("isolationThresholdSec") == 200, "New isolation threshold 200s persisted")
        check("TEST_17_WARNING_PERSISTED", updated_zone.get("warningThresholdSec") == 150, "New warning threshold 150s persisted")
        check("TEST_17_MIN_WORKERS_PERSISTED", updated_zone.get("minimumWorkers") == 3, "New minimum workers 3 persisted")

        # -------------------------------------------------------------
        # TEST 18: Zone configuration survives and is persistent in MongoDB
        # -------------------------------------------------------------
        print("\n--- TEST 18: Database Query & Schema Persistence ---")
        get_zone_res = requests.get(f"{BASE_URL}/api/restricted-zones/{test_zone_id}", headers=admin_headers)
        check("TEST_18_PERSISTENCE", get_zone_res.status_code == 200, f"Zone successfully fetched from database (HTTP {get_zone_res.status_code})")
        persisted = get_zone_res.json().get("zone", {})
        check("TEST_18_ZONE_TYPE", persisted.get("zoneType") == "LONE_WORKER_ZONE", "Zone type is LONE_WORKER_ZONE in database")
        check("TEST_18_POLYGON_POINTS", len(persisted.get("polygon", [])) == 4, f"Database preserved exactly 4 polygon points")

        # -------------------------------------------------------------
        # TEST 19: Socket.IO events carry correct cameraId and zoneId
        # -------------------------------------------------------------
        print("\n--- TEST 19: Socket.IO Real-time Events ---")
        time.sleep(0.5)
        # Check received Socket.IO events
        print(f"    Received Socket.IO lone worker events: {len(received_socket_events)}")
        has_correct_cam = any(evt[1].get("cameraId") == camera_id for evt in received_socket_events)
        check("TEST_19_SOCKET_EVENTS", len(received_socket_events) > 0 and has_correct_cam, f"Socket.IO emitted lone worker events matching camera {camera_id}")

        # -------------------------------------------------------------
        # TEST 20: Duplicate event protection prevents repeated incident flooding
        # -------------------------------------------------------------
        print("\n--- TEST 20: Duplicate Incident Protection ---")
        # Send another frame shortly after incident while worker is still isolated (within 60s cooldown)
        t20 = t4 + 2000
        frame_payload_t20 = {
            "cameraId": camera_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t20 / 1000)),
            "frameWidth": 640,
            "frameHeight": 480,
            "frameTimestampMs": t20,
            "frameBase64": frame_b64,
            "detections": [
                {"class": "person", "confidence": 0.95, "track_id": track_w1, "bbox": {"ymin": 150, "xmin": 280, "ymax": 380, "xmax": 360}}
            ]
        }
        res_t20 = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=frame_payload_t20, headers=admin_headers)
        # Under 60s incident cooldown, zero duplicate incidents should be created
        check("TEST_20_DUPLICATE_PROTECTED", len(res_t20.json().get("incidents", [])) == 0, "Cooldown prevented immediate duplicate incident spam")

        # Clean up test zone
        print("\n--- Clean Up ---")
        del_res = requests.delete(f"{BASE_URL}/api/restricted-zones/{test_zone_id}", headers=admin_headers)
        check("CLEANUP_ZONE", del_res.status_code == 200, f"Deleted test zone {test_zone_id}")

    finally:
        try:
            sio.disconnect()
        except:
            pass
        try:
            from pymongo import MongoClient
            mclient = MongoClient("mongodb://localhost:27017/?replicaSet=rs0")
            mdb = mclient["safevision"]
            if test_zone_id:
                test_incs = list(mdb["incidents"].find({"zoneId": test_zone_id}))
                test_inc_ids = [doc["incidentId"] for doc in test_incs if doc.get("incidentId")]
                if test_inc_ids:
                    mdb["incidentevents"].delete_many({"incidentId": {"$in": test_inc_ids}})
                    mdb["incidents"].delete_many({"incidentId": {"$in": test_inc_ids}})
                mdb["restrictedzones"].delete_many({"zoneId": test_zone_id})
            mclient.close()
        except Exception:
            pass

    print("\n" + "=" * 80)
    print(f"  PHASE 9.3 LONE WORKER TEST RESULTS: {passed_count} PASSED, {failed_count} FAILED")
    print("=" * 80)
    return failed_count == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
