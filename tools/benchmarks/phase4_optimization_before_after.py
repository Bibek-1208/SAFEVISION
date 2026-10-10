"""
SafeVision Phase 4 — Section 13: Bottleneck Optimization (BEFORE vs AFTER)
Measures the effect of:
1. Decoupled Asynchronous RTSP Grabber (Queue depth = 1 / ring buffer)
2. HTTP Connection Pooling / Session Reuse (keep-alive)
3. Stale-frame dropping for real-time edge processing
4. Pre-flight GPU warm-up
"""

import os
import sys
import time
import json
import base64
import subprocess
import threading
import numpy as np
import cv2
import requests

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VIDEO_PATH = os.path.join(ROOT_DIR, "ai", "datasets", "stock-footage-vertical-video-warehouse-employee-checks-construction-tools-near-heavy-metal-equipment-managing.webm")
RTSP_URL = "rtsp://127.0.0.1:8554/cam-01"
BACKEND_URL = "http://localhost:5005"

def start_publisher():
    cmd = [
        "ffmpeg", "-re", "-stream_loop", "-1",
        "-i", VIDEO_PATH,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
        "-pix_fmt", "yuv420p", "-g", "15",
        "-f", "rtsp", RTSP_URL
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2.0)
    return proc

def stop_publisher(proc):
    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()

# ======================================================================
# 1. BEFORE OPTIMIZATION (Legacy Synchronous Blocked Pipeline)
# ======================================================================
def benchmark_before(num_frames=30):
    print("\n[BEFORE] Running Legacy Synchronous Pipeline (Phase 3 Baseline)...", flush=True)
    pub = start_publisher()

    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    latencies = []
    frame_ages = []
    t_start = time.perf_counter()
    processed = 0

    for i in range(num_frames):
        t0 = time.perf_counter()
        ret, frame = cap.read()
        wall = time.perf_counter() - t_start
        expected_live_frame = wall * 24.0
        frame_age = max(0.0, (expected_live_frame - i) / 24.0)
        frame_ages.append(frame_age)

        if not ret or frame is None:
            continue

        _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        b64 = base64.b64encode(buf).decode('utf-8')

        # Raw requests.post without persistent session
        resp = requests.post(
            f"{BACKEND_URL}/api/detection/frame",
            json={"cameraId": "CAM-01", "zone": "Loading Dock", "frameBase64": f"data:image/jpeg;base64,{b64}"},
            timeout=5
        )
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000.0)
        if resp.status_code == 200:
            processed += 1

    t_end = time.perf_counter()
    cap.release()
    stop_publisher(pub)

    total_time = t_end - t_start
    fps = round(processed / total_time, 2) if total_time > 0 else 0
    avg_lat = round(float(np.mean(latencies)), 2) if latencies else 0
    p50_lat = round(float(np.percentile(latencies, 50)), 2) if latencies else 0
    p95_lat = round(float(np.percentile(latencies, 95)), 2) if latencies else 0
    final_age = round(float(frame_ages[-1]), 2) if frame_ages else 0

    return {
        "pipeline": "Legacy Synchronous (Before)",
        "throughput_fps": fps,
        "latency_avg_ms": avg_lat,
        "latency_p50_ms": p50_lat,
        "latency_p95_ms": p95_lat,
        "final_frame_age_sec": final_age,
        "stale_frames_dropped": 0,
        "operating_mode": "HIGH LATENCY / BUFFERED" if final_age > 1.0 else "LOW LATENCY"
    }

# ======================================================================
# 2. AFTER OPTIMIZATION (Asynchronous Decoupled Grabber + Session Pooling)
# ======================================================================
class LowLatencyRTSPReader:
    def __init__(self, rtsp_url):
        self.cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.lock = threading.Lock()
        self.latest_frame = None
        self.latest_time = 0
        self.running = True
        self.dropped_stale = 0
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        while self.running:
            ret, frame = self.cap.read()
            if not ret or frame is None:
                time.sleep(0.005)
                continue
            with self.lock:
                if self.latest_frame is not None:
                    self.dropped_stale += 1
                self.latest_frame = frame
                self.latest_time = time.perf_counter()

    def get_latest(self):
        with self.lock:
            f = self.latest_frame
            t = self.latest_time
            self.latest_frame = None
            return f, t

    def release(self):
        self.running = False
        if self.thread.is_alive():
            self.thread.join(timeout=1.0)
        self.cap.release()

def benchmark_after(num_frames=30):
    print("\n[AFTER] Running Optimized Low-Latency Decoupled Pipeline...", flush=True)
    pub = start_publisher()

    reader = LowLatencyRTSPReader(RTSP_URL)
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=10)
    session.mount("http://", adapter)

    # 1. Warm-up pre-flight request
    warmup_img = np.zeros((480, 640, 3), dtype=np.uint8)
    _, wb = cv2.imencode('.jpg', warmup_img, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    session.post(
        f"{BACKEND_URL}/api/detection/frame",
        json={"cameraId": "CAM-01", "zone": "Loading Dock", "frameBase64": f"data:image/jpeg;base64,{base64.b64encode(wb).decode('utf-8')}"},
        timeout=5
    )

    time.sleep(0.5)

    latencies = []
    frame_ages = []
    t_start = time.perf_counter()
    processed = 0

    while processed < num_frames:
        t0 = time.perf_counter()
        frame, frame_captured_t = reader.get_latest()
        if frame is None:
            time.sleep(0.005)
            continue

        frame_age = max(0.0, t0 - frame_captured_t)
        frame_ages.append(frame_age)

        # Encode with fast JPEG quality 75
        _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        b64 = base64.b64encode(buf).decode('utf-8')

        resp = session.post(
            f"{BACKEND_URL}/api/detection/frame",
            json={"cameraId": "CAM-01", "zone": "Loading Dock", "frameBase64": f"data:image/jpeg;base64,{b64}"},
            timeout=5
        )
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000.0)
        if resp.status_code == 200:
            processed += 1

    t_end = time.perf_counter()
    stale_dropped = reader.dropped_stale
    reader.release()
    stop_publisher(pub)

    total_time = t_end - t_start
    fps = round(processed / total_time, 2) if total_time > 0 else 0
    avg_lat = round(float(np.mean(latencies)), 2) if latencies else 0
    p50_lat = round(float(np.percentile(latencies, 50)), 2) if latencies else 0
    p95_lat = round(float(np.percentile(latencies, 95)), 2) if latencies else 0
    avg_age_ms = round(float(np.mean(frame_ages)) * 1000.0, 2) if frame_ages else 0

    return {
        "pipeline": "Decoupled Low-Latency (After)",
        "throughput_fps": fps,
        "latency_avg_ms": avg_lat,
        "latency_p50_ms": p50_lat,
        "latency_p95_ms": p95_lat,
        "average_frame_age_ms": avg_age_ms,
        "stale_frames_dropped": stale_dropped,
        "operating_mode": "LOW LATENCY" if avg_age_ms < 100 else "HIGH LATENCY / BUFFERED"
    }

def main():
    before = benchmark_before(30)
    after = benchmark_after(30)

    fps_gain_pct = round(((after["throughput_fps"] - before["throughput_fps"]) / before["throughput_fps"]) * 100, 1)
    latency_reduction_pct = round(((before["latency_avg_ms"] - after["latency_avg_ms"]) / before["latency_avg_ms"]) * 100, 1)

    print("\n" + "=" * 80)
    print(" SECTION 13: BEFORE VS AFTER OPTIMIZATION COMPARISON")
    print("=" * 80)
    print(f" {'METRIC':<30s} | {'BEFORE (Legacy)':<22s} | {'AFTER (Optimized)':<20s}")
    print("-" * 80)
    print(f" {'Throughput (Processed FPS)':<30s} | {before['throughput_fps']:<22.2f} | {after['throughput_fps']:<20.2f} (+{fps_gain_pct}%)")
    print(f" {'Average Latency (ms)':<30s} | {before['latency_avg_ms']:<22.2f} | {after['latency_avg_ms']:<20.2f} (-{latency_reduction_pct}%)")
    print(f" {'P50 Latency (ms)':<30s} | {before['latency_p50_ms']:<22.2f} | {after['latency_p50_ms']:<20.2f}")
    print(f" {'P95 Latency (ms)':<30s} | {before['latency_p95_ms']:<22.2f} | {after['latency_p95_ms']:<20.2f}")
    print(f" {'Frame Age / Lag':<30s} | {before['final_frame_age_sec']:<22.2f} s | {after['average_frame_age_ms']:<17.2f} ms")
    print(f" {'Operating Mode':<30s} | {before['operating_mode']:<22s} | {after['operating_mode']:<20s}")
    print(f" {'Stale Frames Dropped':<30s} | {before['stale_frames_dropped']:<22d} | {after['stale_frames_dropped']:<20d}")
    print("=" * 80)

    results = {
        "before": before,
        "after": after,
        "delta": {
            "fps_gain_percentage": fps_gain_pct,
            "latency_reduction_percentage": latency_reduction_pct,
            "latency_mode_transition": f"{before['operating_mode']} -> {after['operating_mode']}"
        }
    }

    with open(os.path.join(ROOT_DIR, "docs", "reports", "phase4_optimization_results.json"), "w") as f:
        json.dump(results, f, indent=2)
    print("\nResults exported to docs/reports/phase4_optimization_results.json")

if __name__ == "__main__":
    main()
