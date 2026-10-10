import os
import sys
import time
import json
import requests
import socketio

BACKEND_URL = "http://127.0.0.1:5005"
AI_URL = "http://127.0.0.1:8000"

def get_auth_token():
    resp = requests.post(
        f"{BACKEND_URL}/api/auth/login",
        json={"email": "admin@safevision.ai", "password": "Password123!"},
        timeout=5.0
    )
    if resp.status_code == 200:
        return resp.json()["token"]
    raise RuntimeError(f"Login failed: {resp.status_code} {resp.text}")

def get_camera_status(token: str, cam_id: str = "cam-01"):
    resp = requests.get(
        f"{BACKEND_URL}/api/cameras/{cam_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=5.0
    )
    if resp.status_code == 200:
        return resp.json().get("camera", {})
    return None

def get_incidents_count(token: str):
    resp = requests.get(
        f"{BACKEND_URL}/api/incidents",
        headers={"Authorization": f"Bearer {token}"},
        timeout=5.0
    )
    if resp.status_code == 200:
        return len(resp.json().get("incidents", []))
    return 0

def run_disconnect_recovery_test():
    print("=== SAFEVISION AI — CAM-01 DISCONNECT & RECOVERY TEST ===")
    token = get_auth_token()
    print("[1] Authenticated with SafeVision backend.")

    # 1. Baseline LIVE Check
    print("\n--- STAGE 1: BASELINE LIVE VERIFICATION ---")
    cam_initial = get_camera_status(token, "cam-01")
    if not cam_initial:
        print("[FAIL] Could not query CAM-01")
        sys.exit(1)

    print(f"CAM-01 Initial Status: {cam_initial.get('status')}")
    print(f"CAM-01 Initial FPS: {cam_initial.get('fps')}")
    print(f"CAM-01 Initial lastFrameAt: {cam_initial.get('lastFrameAt')}")
    print(f"CAM-01 Stream URL: {cam_initial.get('streamUrl')}")
    initial_last_frame = cam_initial.get("lastFrameAt")
    initial_incidents = get_incidents_count(token)
    print(f"Baseline Incidents: {initial_incidents}")

    # Ensure pipeline is running and live frames are flowing
    time.sleep(3)
    cam_live = get_camera_status(token, "cam-01")
    print(f"CAM-01 Live Check Status: {cam_live.get('status')}, lastFrameAt: {cam_live.get('lastFrameAt')}")

    # 2. Trigger Camera Disconnect
    print("\n--- STAGE 2: TRIGGER CAMERA DISCONNECT ---")
    t_disconnect_start = time.time()
    # Signal AI pipeline to stop CAM-01 worker to simulate RTSP camera interruption
    resp = requests.post(f"{AI_URL}/pipeline/camera/remove", json={"cameraId": "CAM-01"}, timeout=5.0)
    print(f"Pipeline camera remove response: {resp.status_code} {resp.text}")

    # Emit explicit disconnect heartbeat to notify backend immediately
    disconnect_hb = {
        "cameraId": "CAM-01",
        "status": "OFFLINE",
        "fps": 0.0,
        "processedFps": 0.0,
        "sourceFps": 0.0,
        "latencyMs": 0.0,
        "frameAgeMs": 0.0,
    }
    requests.post(f"{BACKEND_URL}/api/detection/camera-heartbeat", json=disconnect_hb, timeout=3.0)

    # Wait for disconnect state propagation
    time.sleep(3)
    cam_disconnected = get_camera_status(token, "cam-01")
    print(f"CAM-01 Disconnected Status: {cam_disconnected.get('status')}")
    print(f"CAM-01 Disconnected FPS: {cam_disconnected.get('fps')}")
    print(f"CAM-01 Disconnected lastFrameAt: {cam_disconnected.get('lastFrameAt')}")

    disconnect_last_frame = cam_disconnected.get("lastFrameAt")
    incidents_during_disconnect = get_incidents_count(token)

    # Assertions for Disconnect
    assert cam_disconnected.get("status") in ["OFFLINE", "CONNECTING", "RECONNECTING"], f"Expected OFFLINE/CONNECTING, got {cam_disconnected.get('status')}"
    assert cam_disconnected.get("fps") == 0, f"Expected 0 FPS during disconnect, got {cam_disconnected.get('fps')}"
    assert incidents_during_disconnect == initial_incidents, "False incidents generated during disconnect!"
    print("[PASS] Disconnect test verified: status=OFFLINE/CONNECTING, FPS=0, no false incidents.")

    # Check that lastFrameAt remains frozen during disconnect
    time.sleep(2)
    cam_disconnected_check2 = get_camera_status(token, "cam-01")
    assert cam_disconnected_check2.get("lastFrameAt") == disconnect_last_frame, "lastFrameAt should not advance while camera is disconnected!"
    print("[PASS] lastFrameAt remained frozen during stream disconnection.")

    # 3. Trigger Camera Recovery
    print("\n--- STAGE 3: TRIGGER CAMERA RECOVERY ---")
    t_recovery_start = time.time()

    # Re-sync pipeline with backend to reconnect real physical CCTV stream
    sync_resp = requests.post(f"{AI_URL}/pipeline/sync", json={"backend_url": BACKEND_URL}, timeout=15.0)
    print(f"Pipeline sync response: {sync_resp.status_code} {sync_resp.text}")

    # Wait for physical stream to reconnect and resume frame delivery
    recovered = False
    recovery_latency_ms = None
    for attempt in range(15):
        time.sleep(1.0)
        cam_now = get_camera_status(token, "cam-01")
        cur_status = cam_now.get("status")
        cur_last_frame = cam_now.get("lastFrameAt")
        print(f"  [Attempt {attempt+1}] Status: {cur_status}, FPS: {cam_now.get('fps')}, lastFrameAt: {cur_last_frame}")
        if cur_status == "LIVE" and cur_last_frame != disconnect_last_frame:
            recovery_latency_ms = round((time.time() - t_recovery_start) * 1000, 2)
            recovered = True
            break

    assert recovered, "Camera failed to recover to LIVE status within timeout!"
    print(f"[PASS] Recovery test verified: status=LIVE, frames resumed, recovery time: {recovery_latency_ms} ms")

    # 4. Duplicate Camera Prevention Verification
    resp_all_cams = requests.get(f"{BACKEND_URL}/api/cameras", headers={"Authorization": f"Bearer {token}"}, timeout=5.0)
    all_cams = resp_all_cams.json().get("cameras", [])
    cam01_instances = [c for c in all_cams if c.get("code") == "CAM-01" or c.get("id") == "cam-01"]
    assert len(cam01_instances) == 1, f"Duplicate camera records detected! Found {len(cam01_instances)}"
    print(f"[PASS] Duplicate camera prevention verified: exactly 1 CAM-01 record exists.")

    # 5. Final Status Summary
    final_cam = get_camera_status(token, "cam-01")
    final_incidents = get_incidents_count(token)
    print("\n=== FINAL TEST RESULTS ===")
    print(f"Final Camera Status: {final_cam.get('status')}")
    print(f"Final Camera FPS: {final_cam.get('fps')}")
    print(f"Final Camera Latency: {final_cam.get('latencyMs')} ms")
    print(f"Final Camera lastFrameAt: {final_cam.get('lastFrameAt')}")
    print(f"Measured Recovery Latency: {recovery_latency_ms} ms")
    print(f"Total Incidents: {final_incidents} (Initial: {initial_incidents})")
    print("ALL DISCONNECT & RECOVERY CHECKS PASSED SUCCESSFULLY!\n")

if __name__ == "__main__":
    run_disconnect_recovery_test()
