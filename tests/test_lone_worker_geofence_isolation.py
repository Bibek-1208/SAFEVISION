#!/usr/bin/env python3
"""
SafeVision AI - Phase 9.3 / Phase 10.4 Dedicated Regression Test:
LONE_WORKER_ZONE Geofence Engine Architectural Separation

Verifies that zones designated as LONE_WORKER_ZONE are strictly excluded
from standard restricted perimeter intrusion checks (GeofenceEngine.evaluateTracksForCamera).
Workers operating inside a lone-worker safety zone must NEVER trigger
'unverified_person_in_restricted_zone' or 'restricted_zone' breach incidents.
"""

import sys
import time
import requests
import numpy as np
import cv2
import base64

BASE_URL = "http://127.0.0.1:5005"

def run_tests():
    print("=" * 80)
    print("  SAFEVISION AI — LONE WORKER GEOFENCE SEPARATION REGRESSION SUITE")
    print("=" * 80)

    # 1. Authenticate
    login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@test.local", "password": "Test@1234"}, timeout=5)
    assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
    token = login_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print("[PASS] AUTH_SUCCESS: Authenticated as administrator")

    # 2. Create synthetic image buffer
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:, :] = (30, 30, 30)
    _, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    frame_b64 = base64.b64encode(buffer).decode('utf-8')

    # 3. Create a test LONE_WORKER_ZONE for CAM-4
    zone_payload = {
        "name": "Isolation Verification Lone Worker Zone",
        "description": "Regression test ensuring LONE_WORKER_ZONE is not treated as restricted perimeter",
        "cameraId": "CAM-4",
        "zoneType": "LONE_WORKER_ZONE",
        "polygon": [
            {"x": 0.1, "y": 0.1},
            {"x": 0.9, "y": 0.1},
            {"x": 0.9, "y": 0.9},
            {"x": 0.1, "y": 0.9}
        ],
        "riskLevel": "HIGH",
        "minimumWorkers": 2,
        "isolationThresholdSec": 60,
        "warningThresholdSec": 30,
        "checkInRequired": True,
        "checkInTimeoutSec": 15,
        "enabled": True
    }

    create_res = requests.post(f"{BASE_URL}/api/restricted-zones", json=zone_payload, headers=headers, timeout=5)
    assert create_res.status_code in [200, 201], f"Failed to create lone worker test zone: {create_res.text}"
    zone_data = create_res.json().get("zone", create_res.json())
    zone_id = zone_data["zoneId"]
    print(f"[PASS] ZONE_CREATED: Created test LONE_WORKER_ZONE {zone_id} on CAM-4")

    try:
        # 4. Send multiple consecutive detection frames with a worker located strictly inside the polygon
        # If GeofenceEngine improperly evaluated this zone as a restricted perimeter,
        # TemporalVerificationService would flag 'unverified_person_in_restricted_zone' after 3 frames.
        track_id = "ISO-TRK-999"
        base_time = int(time.time() * 1000)

        for frame_idx in range(5):
            frame_ts = base_time + (frame_idx * 1000)
            det_payload = {
                "cameraId": "CAM-4",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(frame_ts / 1000)),
                "frameWidth": 640,
                "frameHeight": 480,
                "frameTimestampMs": frame_ts,
                "frameBase64": frame_b64,
                "detections": [
                    {
                        "class": "person",
                        "confidence": 0.96,
                        "track_id": track_id,
                        "bbox": {"ymin": 150, "xmin": 280, "ymax": 380, "xmax": 360} # inside [0.1..0.9] polygon
                    }
                ]
            }

            resp = requests.post(f"{BASE_URL}/api/detection/camera-detections", json=det_payload, headers=headers, timeout=5)
            assert resp.status_code == 200, f"Frame {frame_idx} rejected: {resp.text}"
            data = resp.json()

            # Verify: Zero restricted zone breaches returned
            incidents = data.get("incidents", [])
            rz_breaches = [
                inc for inc in incidents
                if inc.get("violationType") in ["restricted_zone", "unverified_person_in_restricted_zone"]
                or "RESTRICTED" in inc.get("ruleId", "")
            ]
            assert len(rz_breaches) == 0, f"Frame {frame_idx}: False positive restricted zone breach detected: {rz_breaches}"

            # Verify: Lone worker evaluation tracks worker correctly
            lw_statuses = data.get("loneWorkerStatuses", [])
            this_status = next((s for s in lw_statuses if s.get("zoneId") == zone_id), None)
            assert this_status is not None, f"Frame {frame_idx}: Lone worker status missing for zone {zone_id}"
            assert this_status.get("state") == "INSIDE_CANDIDATE", f"Frame {frame_idx}: Unexpected state {this_status.get('state')}"
            assert this_status.get("workerCount") == 1, f"Frame {frame_idx}: Expected workerCount=1, got {this_status.get('workerCount')}"

        print("[PASS] ISOLATION_VERIFIED: 5/5 frames evaluated with zero restricted zone false breaches")
        print("[PASS] LONE_WORKER_VALIDATED: Worker correctly evaluated under Lone Worker state machine (INSIDE_CANDIDATE)")

    finally:
        # 5. Clean up test zone
        del_res = requests.delete(f"{BASE_URL}/api/restricted-zones/{zone_id}", headers=headers, timeout=5)
        assert del_res.status_code == 200, f"Failed to delete test zone {zone_id}: {del_res.text}"
        print(f"[PASS] CLEANUP_ZONE: Cleaned up test zone {zone_id}")

    print("\n" + "=" * 80)
    print("  ALL 5 DEDICATED REGRESSION CHECKS PASSED: ARCHITECTURAL SEPARATION VERIFIED")
    print("=" * 80)
    return True

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
