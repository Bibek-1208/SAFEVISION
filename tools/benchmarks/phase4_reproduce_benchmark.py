"""
SafeVision Phase 4 — Reproduce Phase 3 RTSP Benchmark
Runs the exact Phase 3 RTSP ingestion path:
Real Video (warehouse.webm) -> FFmpeg -> MediaMTX (:8554/cam-01) -> OpenCV VideoCapture -> HTTP POST /api/detection/frame
Captures:
- RTSP source FPS
- RTSP received FPS
- frames decoded
- frames sampled
- frames processed
- frames dropped
- YOLO calls
- successful detections
- ByteTrack calls
- PPE association calls
- temporal validator calls
- total elapsed time
"""

import os
import sys
import time
import json
import base64
import subprocess
import cv2
import requests

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VIDEO_PATH = os.path.join(ROOT_DIR, "ai", "datasets", "stock-footage-vertical-video-warehouse-employee-checks-construction-tools-near-heavy-metal-equipment-managing.webm")
RTSP_URL = "rtsp://127.0.0.1:8554/cam-01"
BACKEND_URL = "http://localhost:5005"

def run_reproduce(num_frames=30, target_fps=10):
    print("=" * 70)
    print(" SAFEVISION PHASE 4 — SECTION 1: REPRODUCE PHASE 3 RTSP BENCHMARK")
    print("=" * 70)

    # 1. Start FFmpeg publisher
    print(f"\n[1] Starting FFmpeg RTSP publisher to {RTSP_URL}...")
    ffmpeg_cmd = [
        "ffmpeg", "-re", "-stream_loop", "-1",
        "-i", VIDEO_PATH,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
        "-pix_fmt", "yuv420p", "-g", "15",
        "-f", "rtsp", RTSP_URL
    ]
    ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"    FFmpeg started (PID: {ffmpeg_proc.pid})")
    time.sleep(2.0)  # allow stream to establish

    # 2. Open VideoCapture
    print(f"\n[2] Connecting OpenCV to RTSP stream: {RTSP_URL}...")
    t_open_0 = time.perf_counter()
    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    t_open_1 = time.perf_counter()

    if not cap.isOpened():
        print("ERROR: Failed to open RTSP stream!")
        ffmpeg_proc.terminate()
        return None

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"    Connected in {round((t_open_1 - t_open_0)*1000, 2)} ms. Resolution: {width}x{height}, Source FPS: {source_fps}")

    # 3. Stream frames exactly as Phase 3 did
    print(f"\n[3] Ingesting {num_frames} frames through SafeVision /api/detection/frame (target rate: {target_fps} FPS)...")
    
    frames_decoded = 0
    frames_sampled = 0
    frames_processed = 0
    frames_dropped = 0
    yolo_calls = 0
    successful_detections = 0
    bytetrack_calls = 0
    ppe_association_calls = 0
    temporal_validator_calls = 0
    
    frame_latencies = []
    rtsp_ingest_latencies = []
    created_incidents = []

    inter_frame_sleep = 1.0 / target_fps if target_fps > 0 else 0
    t_bench_start = time.perf_counter()

    for i in range(num_frames):
        t_grab_0 = time.perf_counter()
        ret, frame = cap.read()
        t_grab_1 = time.perf_counter()
        rtsp_ingest_ms = (t_grab_1 - t_grab_0) * 1000.0
        rtsp_ingest_latencies.append(rtsp_ingest_ms)

        if not ret or frame is None:
            frames_dropped += 1
            time.sleep(0.05)
            continue

        frames_decoded += 1
        frames_sampled += 1

        # Encode to JPEG base64 (Phase 3 path)
        _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        b64 = base64.b64encode(buf).decode('utf-8')
        payload = f"data:image/jpeg;base64,{b64}"

        t_post_0 = time.perf_counter()
        try:
            resp = requests.post(
                f"{BACKEND_URL}/api/detection/frame",
                json={
                    "cameraId": "CAM-01",
                    "zone": "Loading Dock & Logistics",
                    "frameBase64": payload
                },
                timeout=5
            )
            t_post_1 = time.perf_counter()
            frame_lat_ms = (t_post_1 - t_post_0) * 1000.0
            frame_latencies.append(frame_lat_ms)

            if resp.status_code == 200:
                data = resp.json()
                frames_processed += 1
                yolo_calls += 1
                dets = data.get("detections", [])
                if len(dets) > 0:
                    successful_detections += len(dets)
                
                workers = data.get("trackedWorkers", [])
                bytetrack_calls += 1
                ppe_association_calls += len(workers)
                
                # In SafeVision pipeline, temporal validator is called for each violation found on track
                for w in workers:
                    ppe = w.get("ppeState", {})
                    # Count temporal calls for violations evaluated
                    if ppe.get("helmet") == "MISSING":
                        temporal_validator_calls += 1
                    if ppe.get("vest") == "MISSING":
                        temporal_validator_calls += 1

                cands = data.get("createdIncidents", [])
                if cands:
                    created_incidents.extend(cands)
                    print(f"    >>> Frame {i+1}: Incident Created: {cands[0].get('incidentId')} ({cands[0].get('violationType')})")
                elif (i + 1) % 5 == 0:
                    print(f"    Frame {i+1}/{num_frames}: Ingest={round(rtsp_ingest_ms, 1)}ms, API={round(frame_lat_ms, 1)}ms, Track={workers[0].get('trackId') if workers else 'none'}, Helmet={workers[0].get('helmetStatus') if workers else 'UNKNOWN'}")
            else:
                frames_dropped += 1
                print(f"    Frame {i+1}: HTTP {resp.status_code}")
        except Exception as e:
            frames_dropped += 1
            print(f"    Frame {i+1} Exception: {e}")

        # Target pacing
        elapsed = time.perf_counter() - t_grab_0
        delay = inter_frame_sleep - elapsed
        if delay > 0:
            time.sleep(delay)

    t_bench_end = time.perf_counter()
    total_elapsed = t_bench_end - t_bench_start

    cap.release()
    ffmpeg_proc.terminate()
    try:
        ffmpeg_proc.wait(timeout=2)
    except Exception:
        ffmpeg_proc.kill()

    # Calculations
    actual_received_fps = round(frames_decoded / total_elapsed, 2) if total_elapsed > 0 else 0
    actual_processed_fps = round(frames_processed / total_elapsed, 2) if total_elapsed > 0 else 0
    avg_api_lat = round(sum(frame_latencies) / len(frame_latencies), 2) if frame_latencies else 0
    avg_ingest_lat = round(sum(rtsp_ingest_latencies) / len(rtsp_ingest_latencies), 2) if rtsp_ingest_latencies else 0

    results = {
        "rtsp_source_fps": source_fps,
        "rtsp_received_fps": actual_received_fps,
        "frames_decoded": frames_decoded,
        "frames_sampled": frames_sampled,
        "frames_processed": frames_processed,
        "frames_dropped": frames_dropped,
        "yolo_calls": yolo_calls,
        "successful_detections": successful_detections,
        "bytetrack_calls": bytetrack_calls,
        "ppe_association_calls": ppe_association_calls,
        "temporal_validator_calls": temporal_validator_calls,
        "total_elapsed_time_sec": round(total_elapsed, 2),
        "actual_processed_fps": actual_processed_fps,
        "avg_rtsp_ingest_ms": avg_ingest_lat,
        "avg_api_latency_ms": avg_api_lat,
        "incidents_created": len(created_incidents)
    }

    print("\n" + "=" * 70)
    print(" SECTION 1 RESULTS: REPRODUCED PHASE 3 BENCHMARK")
    print("=" * 70)
    for k, v in results.items():
        print(f" - {k:30s}: {v}")
    print("=" * 70)

    is_reproducible = (4.0 <= actual_processed_fps <= 6.0)
    print(f"\nCONFIRMATION: Approximately 4.91 FPS is {'REPRODUCIBLE' if is_reproducible else 'DIFFERENT'}: {actual_processed_fps} FPS measured.")
    return results

if __name__ == "__main__":
    run_reproduce()
