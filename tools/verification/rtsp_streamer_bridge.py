"""
SafeVision AI — RTSP Live Stream Ingestion Worker (Optimized)
Reads continuous frames from RTSP (MediaMTX) via OpenCV using a decoupled
asynchronous grabber thread with stale-frame dropping (queue depth = 1),
connection pooling via persistent requests.Session(), and warm-up execution.
Outputs structured JSON progress to stdout.
"""

import os
import sys
import time
import json
import base64
import threading
import cv2
import requests

class LowLatencyRTSPReader:
    """
    Decoupled RTSP reader thread that continuously drains OpenCV/FFmpeg buffer.
    Maintains only the latest live frame (queue depth = 1).
    Discards older buffered frames so consumer never processes stale data.
    """
    def __init__(self, rtsp_url):
        self.rtsp_url = rtsp_url
        self.cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.lock = threading.Lock()
        self.latest_frame = None
        self.latest_frame_time = 0
        self.running = True
        self.is_connected = self.cap.isOpened()
        self.dropped_stale_count = 0
        self.consecutive_failures = 0
        self.thread = threading.Thread(target=self._reader_loop, daemon=True)
        if self.is_connected:
            self.thread.start()

    def _reader_loop(self):
        while self.running:
            ret, frame = self.cap.read()
            if not ret or frame is None:
                self.consecutive_failures += 1
                time.sleep(0.005)
                continue
            self.consecutive_failures = 0
            with self.lock:
                if self.latest_frame is not None:
                    self.dropped_stale_count += 1
                self.latest_frame = frame
                self.latest_frame_time = time.perf_counter()

    def get_latest(self):
        with self.lock:
            f = self.latest_frame
            t = self.latest_frame_time
            self.latest_frame = None  # consumed
            return f, t

    def release(self):
        self.running = False
        if self.thread.is_alive():
            self.thread.join(timeout=1.0)
        self.cap.release()

def run_bridge(rtsp_url, backend_url, camera_id="CAM-01", zone="Loading Dock & Logistics", max_frames=50, target_fps=15):
    print(json.dumps({"type": "INIT", "rtsp_url": rtsp_url, "backend_url": backend_url, "camera_id": camera_id}), flush=True)

    # 1. Connect to RTSP stream with decoupled reader
    t_conn_start = time.perf_counter()
    reader = LowLatencyRTSPReader(rtsp_url)

    if not reader.is_connected:
        print(json.dumps({"type": "RTSP_CONNECT_FAILED", "error": f"Cannot open RTSP stream at {rtsp_url}"}), flush=True)
        return False

    conn_latency_ms = round((time.perf_counter() - t_conn_start) * 1000, 2)
    width = int(reader.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(reader.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = reader.cap.get(cv2.CAP_PROP_FPS)

    print(json.dumps({
        "type": "RTSP_CONNECTED",
        "connection_latency_ms": conn_latency_ms,
        "resolution": f"{width}x{height}",
        "stream_fps": fps,
        "mode": "LOW_LATENCY_DECOUPLED"
    }), flush=True)

    # 2. HTTP Session with connection pooling
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=10)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    # Pre-flight warm-up request
    dummy_b64 = "data:image/jpeg;base64," + base64.b64encode(b"dummy").decode('utf-8')
    try:
        session.get(f"{backend_url}/api/health", timeout=3)
    except Exception:
        pass

    frame_count = 0
    t_start_loop = time.perf_counter()
    inter_frame_sleep = 1.0 / target_fps if target_fps > 0 else 0

    while frame_count < max_frames:
        t_grab_0 = time.perf_counter()
        frame, frame_captured_t = reader.get_latest()

        if frame is None:
            if reader.consecutive_failures >= 30:
                print(json.dumps({"type": "STREAM_DISCONNECTED", "frame_idx": frame_count}), flush=True)
                break
            time.sleep(0.005)
            continue

        t_grab_1 = time.perf_counter()
        rtsp_ingest_ms = round((t_grab_1 - t_grab_0) * 1000, 2)
        frame_age_ms = round((t_grab_0 - frame_captured_t) * 1000, 2)

        frame_count += 1

        # Encode to JPEG (quality 75 for optimal speed/accuracy trade-off)
        _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        b64 = base64.b64encode(buf).decode('utf-8')
        payload_base64 = f"data:image/jpeg;base64,{b64}"

        # POST to SafeVision detection API over persistent HTTP session
        t_post_0 = time.perf_counter()
        try:
            resp = session.post(
                f"{backend_url}/api/detection/frame",
                json={
                    "cameraId": camera_id,
                    "zone": zone,
                    "frameBase64": payload_base64
                },
                timeout=5
            )
            t_post_1 = time.perf_counter()
            api_latency_ms = round((t_post_1 - t_post_0) * 1000, 2)

            if resp.status_code == 200:
                data = resp.json()
                created = data.get("createdIncidents", [])
                workers = data.get("trackedWorkers", [])
                detections = data.get("detections", [])

                print(json.dumps({
                    "type": "FRAME_INGESTED",
                    "frame_idx": frame_count,
                    "rtsp_ingest_ms": rtsp_ingest_ms,
                    "frame_age_ms": frame_age_ms,
                    "api_latency_ms": api_latency_ms,
                    "detections_count": len(detections),
                    "tracked_workers_count": len(workers),
                    "tracked_worker": workers[0] if workers else None,
                    "created_incidents": created,
                    "stale_dropped": reader.dropped_stale_count
                }), flush=True)
            else:
                print(json.dumps({
                    "type": "API_ERROR",
                    "frame_idx": frame_count,
                    "status_code": resp.status_code,
                    "text": resp.text[:200]
                }), flush=True)
        except Exception as e:
            print(json.dumps({"type": "REQUEST_EXCEPTION", "frame_idx": frame_count, "error": str(e)}), flush=True)

        # Pace to target FPS
        elapsed = time.perf_counter() - t_grab_0
        delay = inter_frame_sleep - elapsed
        if delay > 0:
            time.sleep(delay)

    total_stale_dropped = reader.dropped_stale_count
    reader.release()
    total_time = time.perf_counter() - t_start_loop
    effective_fps = round(frame_count / total_time, 2) if total_time > 0 else 0

    print(json.dumps({
        "type": "STREAM_FINISHED",
        "total_frames": frame_count,
        "total_time_sec": round(total_time, 2),
        "effective_fps": effective_fps,
        "stale_frames_dropped": total_stale_dropped,
        "mode": "LOW_LATENCY_DECOUPLED"
    }), flush=True)

if __name__ == "__main__":
    rtsp = sys.argv[1] if len(sys.argv) > 1 else "rtsp://127.0.0.1:8554/cam-01"
    backend = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5005"
    frames = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    fps = int(sys.argv[4]) if len(sys.argv) > 4 else 10
    run_bridge(rtsp, backend, max_frames=frames, target_fps=fps)
