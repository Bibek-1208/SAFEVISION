"""
SafeVision Phase 4 — Section 14: Complete 10-Point Regression Suite
Verifies all safety semantics and operational behaviors remain completely intact
after bottleneck analysis and optimization.

1. Missing helmet still detected
2. Helmet-present worker remains compliant
3. UNKNOWN remains UNKNOWN
4. Temporal validation still requires persistence (>= 3.0s)
5. Duplicate prevention works (cooldown 60s)
6. MongoDB incident is persisted
7. Change Stream fires
8. Socket.IO fires
9. RTSP disconnect works
10. RTSP reconnect works
"""

import os
import sys
import time
import json
import base64
import subprocess
import queue
import cv2
import requests
import socketio

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT_DIR, "ai"))

from inference.detector import IndustrialSafetyDetector
from inference.ppe_association import PPEAssociationEngine
from inference.temporal_validator import TemporalValidationEngine, TemporalValidationConfig

BACKEND_URL = "http://localhost:5005"
RTSP_URL = "rtsp://127.0.0.1:8554/cam-01"
VIDEO_MISSING = os.path.join(ROOT_DIR, "ai", "datasets", "stock-footage-vertical-video-warehouse-employee-checks-construction-tools-near-heavy-metal-equipment-managing.webm")
VIDEO_HELMET = os.path.join(ROOT_DIR, "server", "uploads", "upload-1790575202797-930871458.mp4")

def run_regression_suite():
    print("=" * 80)
    print(" SAFEVISION PHASE 4 — 10-POINT REGRESSION SUITE")
    print("=" * 80, flush=True)

    results = {}
    detector = IndustrialSafetyDetector(models_dir=os.path.join(ROOT_DIR, "ai", "models"))
    ppe_engine = PPEAssociationEngine(visibility_threshold=0.40)
    temporal_engine = TemporalValidationEngine(TemporalValidationConfig(persistence_threshold_sec=3.0, cooldown_sec=60.0))

    # ------------------------------------------------------------------
    # 1. Missing Helmet Still Detected
    # ------------------------------------------------------------------
    print("\n[CHECK 1/10] Verifying Missing Helmet Detection...", flush=True)
    cap = cv2.VideoCapture(VIDEO_MISSING)
    missing_detected = False
    for _ in range(15):
        ret, frame = cap.read()
        if not ret: break
        h, w = frame.shape[:2]
        res = detector.model.predict(frame, conf=0.40, verbose=False, device=detector.device)
        raw_dets = []
        persons = []
        for b in res[0].boxes:
            cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
            conf = float(b.conf[0])
            xyxy = b.xyxy[0].cpu().numpy()
            bbox = [float((xyxy[1]/h)*100), float((xyxy[0]/w)*100), float((xyxy[3]/h)*100), float((xyxy[2]/w)*100)]
            raw_dets.append({"class_name": cls_name, "bbox": bbox, "confidence": conf})
            if cls_name == "person":
                persons.append({"bbox": bbox, "score": conf})
        if persons:
            peval = ppe_engine.evaluate_track_ppe("TRACK-0001", persons[0]["bbox"], persons[0]["score"], raw_dets, ["helmet"])
            if peval.helmet.status == "MISSING":
                missing_detected = True
                break
    cap.release()
    results["1_missing_helmet_detected"] = "VERIFIED" if missing_detected else "FAILED"
    print(f" -> Result: {results['1_missing_helmet_detected']}")

    # ------------------------------------------------------------------
    # 2. Helmet-Present Worker Remains Compliant
    # ------------------------------------------------------------------
    print("\n[CHECK 2/10] Verifying Helmet-Present Worker Remains Compliant...", flush=True)
    cap = cv2.VideoCapture(VIDEO_HELMET)
    helmet_present = False
    for _ in range(25):
        ret, frame = cap.read()
        if not ret: break
        h, w = frame.shape[:2]
        res = detector.model.predict(frame, conf=0.35, verbose=False, device=detector.device)
        raw_dets = []
        persons = []
        for b in res[0].boxes:
            cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
            conf = float(b.conf[0])
            xyxy = b.xyxy[0].cpu().numpy()
            bbox = [float((xyxy[1]/h)*100), float((xyxy[0]/w)*100), float((xyxy[3]/h)*100), float((xyxy[2]/w)*100)]
            raw_dets.append({"class_name": cls_name, "bbox": bbox, "confidence": conf})
            if cls_name in ["person", "worker"]:
                persons.append({"bbox": bbox, "score": conf})
        if persons:
            peval = ppe_engine.evaluate_track_ppe("TRACK-0002", persons[0]["bbox"], persons[0]["score"], raw_dets, ["helmet"])
            if peval.helmet.status == "PRESENT":
                helmet_present = True
                break
    cap.release()
    results["2_helmet_present_compliant"] = "VERIFIED" if helmet_present else "FAILED"
    print(f" -> Result: {results['2_helmet_present_compliant']}")

    # ------------------------------------------------------------------
    # 3. UNKNOWN Remains UNKNOWN (Never Converted to MISSING)
    # ------------------------------------------------------------------
    print("\n[CHECK 3/10] Verifying UNKNOWN Remains UNKNOWN...", flush=True)
    # An occluded worker bbox or empty detection list for head region
    dummy_person = [10.0, 10.0, 90.0, 50.0]
    # No head items, but visibility threshold prevents assuming missing
    engine_strict = PPEAssociationEngine(visibility_threshold=0.80)
    peval_unknown = engine_strict.evaluate_track_ppe("TRACK-0003", dummy_person, 0.50, [], ["helmet"])
    state = peval_unknown.helmet.status
    unknown_preserved = (state == "UNKNOWN" and "missing_helmet" not in peval_unknown.violations)
    results["3_unknown_remains_unknown"] = "VERIFIED" if unknown_preserved else "FAILED"
    print(f" -> Result: {results['3_unknown_remains_unknown']} (State={state}, Violations={peval_unknown.violations})")

    # ------------------------------------------------------------------
    # 4. Temporal Validation Requires Persistence (>= 3.0s)
    # ------------------------------------------------------------------
    print("\n[CHECK 4/10] Verifying Temporal Validation Persistence (>= 3.0s)...", flush=True)
    temp = TemporalValidationEngine(TemporalValidationConfig(persistenceDuration=3.0, cooldownDuration=60.0, minimumObservedFrames=5))
    t0 = 100.0

    created_early = False
    for step in range(6):  # 0s to 2.5s
        _, should_create, _, _ = temp.process_observation("TRACK-99", "CAM-01", "missing_helmet", True, 0.90, timestamp=t0 + (step * 0.5))
        if should_create:
            created_early = True

    # At 3.2s, persistence duration >= 3.0s and min frames >= 5 satisfied
    _, should_create_at_3s, state_at_3s, _ = temp.process_observation("TRACK-99", "CAM-01", "missing_helmet", True, 0.90, timestamp=t0 + 3.2)

    temporal_ok = (not created_early) and should_create_at_3s
    results["4_temporal_persistence_enforced"] = "VERIFIED" if temporal_ok else "FAILED"
    print(f" -> Result: {results['4_temporal_persistence_enforced']} (Created early: {created_early}, Created at 3.2s: {should_create_at_3s})")

    # ------------------------------------------------------------------
    # 5. Duplicate Prevention (Cooldown 60s)
    # ------------------------------------------------------------------
    print("\n[CHECK 5/10] Verifying Duplicate Incident Prevention...", flush=True)
    _, should_create_during_cooldown, state_cooldown, _ = temp.process_observation("TRACK-99", "CAM-01", "missing_helmet", True, 0.90, timestamp=t0 + 10.0)
    dup_blocked = (not should_create_during_cooldown)
    results["5_duplicate_prevention_works"] = "VERIFIED" if dup_blocked else "FAILED"
    print(f" -> Result: {results['5_duplicate_prevention_works']} (Candidate generated during cooldown: {should_create_during_cooldown}, State: {state_cooldown})")

    # ------------------------------------------------------------------
    # 6, 7, 8: MongoDB Persistence, Change Stream, and Socket.IO Event
    # ------------------------------------------------------------------
    print("\n[CHECKS 6, 7, 8] Verifying DB Persistence, Change Stream & Socket.IO...", flush=True)
    login_resp = requests.post(
        f"{BACKEND_URL}/api/auth/login",
        json={"email": "admin@safevision.ai", "password": "Password123!"}
    )
    admin_token = login_resp.json().get("token")

    sio = socketio.Client()
    socket_received = queue.Queue()

    @sio.on("incident:new")
    def on_inc(data):
        socket_received.put(("incident:new", data))

    @sio.on("incident.created")
    def on_inc_created(data):
        socket_received.put(("incident.created", data))

    sio.connect(BACKEND_URL, auth={"token": admin_token})

    # Ingest frames over API to trigger an authoritative incident in backend
    cap = cv2.VideoCapture(VIDEO_MISSING)
    incident_id = None
    for _ in range(45):
        ret, frame = cap.read()
        if not ret: break
        _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        b64 = base64.b64encode(buf).decode('utf-8')
        resp = requests.post(
            f"{BACKEND_URL}/api/detection/frame",
            json={"cameraId": "CAM-01", "zone": "Loading Dock", "frameBase64": f"data:image/jpeg;base64,{b64}"},
            timeout=5
        )
        if resp.status_code == 200:
            data = resp.json()
            incs = data.get("createdIncidents", [])
            if incs:
                incident_id = incs[0].get("incidentId") or incs[0].get("id")
                break
        time.sleep(0.08)
    cap.release()

    # Verify MongoDB
    db_verified = False
    if incident_id:
        inc_check = requests.get(
            f"{BACKEND_URL}/api/incidents/{incident_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if inc_check.status_code == 200:
            db_verified = True

    # Verify Socket.IO
    socket_ok = False
    try:
        evt, evt_data = socket_received.get(timeout=3.0)
        socket_ok = True
    except queue.Empty:
        pass

    sio.disconnect()

    results["6_mongodb_persisted"] = "VERIFIED" if db_verified else "FAILED"
    results["7_change_stream_fires"] = "VERIFIED" if (db_verified and socket_ok) else "FAILED"
    results["8_socketio_fires"] = "VERIFIED" if socket_ok else "FAILED"

    print(f" -> 6. MongoDB Persistence : {results['6_mongodb_persisted']} (Incident ID: {incident_id})")
    print(f" -> 7. Change Stream Event : {results['7_change_stream_fires']}")
    print(f" -> 8. Socket.IO Broadcast : {results['8_socketio_fires']}")

    # ------------------------------------------------------------------
    # 9 & 10. RTSP Disconnect and Reconnect Handling
    # ------------------------------------------------------------------
    print("\n[CHECKS 9 & 10] Verifying RTSP Disconnect and Reconnect Graceful Handling...", flush=True)
    # Start ffmpeg
    cmd = [
        "ffmpeg", "-re", "-stream_loop", "-1",
        "-i", VIDEO_MISSING,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
        "-pix_fmt", "yuv420p", "-g", "15",
        "-f", "rtsp", RTSP_URL
    ]
    pub = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2.0)

    cap_rtsp = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    initial_read_ok = cap_rtsp.isOpened()
    ret0, _ = cap_rtsp.read()

    # Disconnect publisher abruptly
    pub.terminate()
    pub.wait(timeout=2.0)
    time.sleep(1.0)

    # Read until buffer drains and disconnect is confirmed
    disconnect_handled = False
    for _ in range(60):
        ret_after_kill, _ = cap_rtsp.read()
        if not ret_after_kill:
            disconnect_handled = True
            break
    cap_rtsp.release()

    # Reconnect
    pub2 = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2.0)

    cap_rtsp2 = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    reconnect_ok = cap_rtsp2.isOpened()
    ret_recon, frame_recon = cap_rtsp2.read()
    cap_rtsp2.release()
    pub2.terminate()
    pub2.wait(timeout=2.0)

    results["9_rtsp_disconnect_handled"] = "VERIFIED" if disconnect_handled else "FAILED"
    results["10_rtsp_reconnect_works"] = "VERIFIED" if (reconnect_ok and ret_recon and frame_recon is not None) else "FAILED"

    print(f" -> 9. RTSP Disconnect Handled : {results['9_rtsp_disconnect_handled']}")
    print(f" -> 10. RTSP Reconnect Works   : {results['10_rtsp_reconnect_works']}")

    print("\n" + "=" * 80)
    print(" REGRESSION SUITE FINAL SUMMARY (10/10 CHECKS)")
    print("=" * 80)
    all_passed = True
    for k, v in results.items():
        print(f" [{v}] {k}")
        if v != "VERIFIED":
            all_passed = False
    print("=" * 80)
    print(f" Overall Regression Status: {'PASS' if all_passed else 'FAIL'}")

    with open(os.path.join(ROOT_DIR, "docs", "reports", "phase4_regression_results.json"), "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    run_regression_suite()
