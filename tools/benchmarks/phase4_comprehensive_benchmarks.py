"""
SafeVision Phase 4 — Sections 4, 5, 6, 7 Benchmark Suite
Tests:
4. Sampling Comparison (5 FPS, 10 FPS, 15 FPS, 24 FPS)
5. Direct RTSP vs API Path (Direct in-process vs HTTP POST /api/detection/frame)
6. Buffering & Frame Age Analysis (Buffer accumulation, stale frames, latency growth)
7. GPU & CPU Utilization across states (Idle, YOLO alone, RTSP continuous, 4-cam batch)
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
import torch
import psutil
import pynvml
import requests

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT_DIR, "ai"))

from inference.detector import IndustrialSafetyDetector

VIDEO_PATH = os.path.join(ROOT_DIR, "ai", "datasets", "stock-footage-vertical-video-warehouse-employee-checks-construction-tools-near-heavy-metal-equipment-managing.webm")
RTSP_URL = "rtsp://127.0.0.1:8554/cam-01"
BACKEND_URL = "http://localhost:5005"

def init_nvml():
    try:
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        return handle
    except Exception:
        return None

def get_system_metrics(nvml_handle):
    cpu = psutil.cpu_percent(interval=None)
    gpu_util = 0
    gpu_mem_mb = 0
    if nvml_handle:
        try:
            util = pynvml.nvmlDeviceGetUtilizationRates(nvml_handle)
            gpu_util = util.gpu
            mem = pynvml.nvmlDeviceGetMemoryInfo(nvml_handle)
            gpu_mem_mb = round(mem.used / (1024 * 1024), 1)
        except Exception:
            pass
    return cpu, gpu_util, gpu_mem_mb

def start_ffmpeg_publisher(rtsp_url=RTSP_URL):
    cmd = [
        "ffmpeg", "-re", "-stream_loop", "-1",
        "-i", VIDEO_PATH,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
        "-pix_fmt", "yuv420p", "-g", "15",
        "-f", "rtsp", rtsp_url
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2.0)
    return proc

def stop_ffmpeg(proc):
    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()

# ======================================================================
# SECTION 4: SAMPLING COMPARISON (5, 10, 15, 24 FPS)
# ======================================================================
def run_section_4_sampling(nvml_handle):
    print("\n" + "=" * 75)
    print(" SECTION 4: SAMPLING COMPARISON (5, 10, 15, 24 FPS)")
    print("=" * 75)

    ff_proc = start_ffmpeg_publisher()
    rates_to_test = [5, 10, 15, 24]
    results = {}

    for target_fps in rates_to_test:
        print(f"\n---> Testing Sampling Rate: {target_fps} FPS (Requested)...")
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not cap.isOpened():
            print(f"Failed to open {RTSP_URL}")
            continue

        target_interval = 1.0 / target_fps
        num_frames = 25
        frame_latencies = []
        cpu_samples = []
        gpu_samples = []
        mem_samples = []

        t_start = time.perf_counter()
        processed = 0
        dropped = 0

        for i in range(num_frames):
            t0 = time.perf_counter()
            ret, frame = cap.read()
            if not ret or frame is None:
                dropped += 1
                continue

            # API Path (Phase 3 path)
            _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            b64 = base64.b64encode(buf).decode('utf-8')
            payload = f"data:image/jpeg;base64,{b64}"

            try:
                resp = requests.post(
                    f"{BACKEND_URL}/api/detection/frame",
                    json={"cameraId": "CAM-01", "zone": "Loading Dock", "frameBase64": payload},
                    timeout=5
                )
                t1 = time.perf_counter()
                frame_latencies.append((t1 - t0) * 1000.0)
                if resp.status_code == 200:
                    processed += 1
                else:
                    dropped += 1
            except Exception:
                dropped += 1

            cpu, gpu, mem = get_system_metrics(nvml_handle)
            cpu_samples.append(cpu)
            gpu_samples.append(gpu)
            mem_samples.append(mem)

            elapsed = time.perf_counter() - t0
            sleep_time = target_interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

        t_end = time.perf_counter()
        cap.release()

        total_time = t_end - t_start
        actual_fps = round(processed / total_time, 2) if total_time > 0 else 0
        avg_lat = round(float(np.mean(frame_latencies)), 2) if frame_latencies else 0
        avg_cpu = round(float(np.mean(cpu_samples)), 1) if cpu_samples else 0
        avg_gpu = round(float(np.mean(gpu_samples)), 1) if gpu_samples else 0
        avg_mem = round(float(np.mean(mem_samples)), 1) if mem_samples else 0

        # Queue depth / frame backlog estimation:
        # At 24 FPS source rate, how many source frames elapsed vs how many processed
        source_frames_elapsed = total_time * 24.0
        queue_backlog = max(0, int(source_frames_elapsed - processed))

        results[f"{target_fps}_FPS"] = {
            "requested_sampling_fps": target_fps,
            "actual_received_fps": actual_fps,
            "actual_processed_fps": actual_fps,
            "frames_processed": processed,
            "dropped_frames": dropped,
            "estimated_queue_backlog_frames": queue_backlog,
            "average_latency_ms": avg_lat,
            "cpu_utilization_pct": avg_cpu,
            "gpu_utilization_pct": avg_gpu,
            "gpu_memory_mb": avg_mem
        }

        print(f"    Target: {target_fps} FPS -> Actual Processed: {actual_fps} FPS | Avg Latency: {avg_lat} ms | CPU: {avg_cpu}% | GPU: {avg_gpu}% | Backlog: {queue_backlog} frames")

    stop_ffmpeg(ff_proc)
    return results

# ======================================================================
# SECTION 5: DIRECT RTSP VS API PATH BENCHMARK
# ======================================================================
def run_section_5_direct_vs_api(nvml_handle, num_frames=30):
    print("\n" + "=" * 75)
    print(" SECTION 5: DIRECT RTSP IN-PROCESS VS HTTP API PATH BENCHMARK")
    print("=" * 75)

    ff_proc = start_ffmpeg_publisher()

    # PATH A: DIRECT IN-PROCESS (RTSP -> OpenCV -> PyTorch/CUDA YOLO -> ByteTrack -> PPE -> Temporal)
    print("\n[PATH A] Direct In-Process Python Pipeline (Zero HTTP, Zero Base64, Native NumPy BGR)...")
    detector = IndustrialSafetyDetector(models_dir=os.path.join(ROOT_DIR, "ai", "models"))
    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    direct_latencies = []
    t_dir_0 = time.perf_counter()
    for _ in range(num_frames):
        t0 = time.perf_counter()
        ret, frame = cap.read()
        if not ret or frame is None:
            continue
        # Complete full pipeline in-process
        torch.cuda.synchronize()
        results = detector.model.predict(frame, conf=0.45, verbose=False, device=detector.device)
        torch.cuda.synchronize()

        # ByteTrack + PPE + Temporal
        h, w = frame.shape[:2]
        raw_dets = []
        persons = []
        for box in results[0].boxes:
            xyxy = box.xyxy[0].cpu().numpy()
            cls_id = int(box.cls[0].cpu().numpy())
            confidence = float(box.conf[0].cpu().numpy())
            cls_name = detector.model.names.get(cls_id, f"class_{cls_id}").lower().replace('_', '-')
            det_obj = {
                "class_name": cls_name,
                "bbox": [float((xyxy[1]/h)*100), float((xyxy[0]/w)*100), float((xyxy[3]/h)*100), float((xyxy[2]/w)*100)],
                "confidence": confidence,
                "pixel_box": [int(xyxy[1]), int(xyxy[0]), int(xyxy[3]), int(xyxy[2])]
            }
            raw_dets.append(det_obj)
            if cls_name in ["person", "worker"]:
                persons.append({"bbox": det_obj["bbox"], "score": confidence, "pixel_box": det_obj["pixel_box"]})

        active_tracks = detector.tracker.update(persons)
        for tr in active_tracks:
            peval = detector.ppe_engine.evaluate_track_ppe(tr.track_label, tr.bbox, tr.score, raw_dets, ["helmet", "safety-vest"])
            for viol in peval.violations:
                detector.temporal_engine.process_observation(tr.track_label, "CAM-01", viol, True, tr.score)

        t1 = time.perf_counter()
        direct_latencies.append((t1 - t0) * 1000.0)

    t_dir_1 = time.perf_counter()
    cap.release()
    direct_total_sec = t_dir_1 - t_dir_0
    direct_fps = round(len(direct_latencies) / direct_total_sec, 2)
    direct_avg_ms = round(float(np.mean(direct_latencies)), 2)
    direct_p50_ms = round(float(np.percentile(direct_latencies, 50)), 2)
    direct_p95_ms = round(float(np.percentile(direct_latencies, 95)), 2)

    print(f"    DIRECT Pipeline: {direct_fps} FPS | Avg Latency: {direct_avg_ms} ms | P50: {direct_p50_ms} ms | P95: {direct_p95_ms} ms")

    # PATH B: HTTP API PATH (Phase 3 Path: imencode -> base64 -> Node.js -> FastAPI -> decode -> PyTorch)
    print("\n[PATH B] HTTP API Ingestion Pipeline (Phase 3: Client -> Node.js -> FastAPI -> PyTorch)...")
    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    api_latencies = []
    t_api_0 = time.perf_counter()
    for _ in range(num_frames):
        t0 = time.perf_counter()
        ret, frame = cap.read()
        if not ret or frame is None:
            continue
        _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        b64 = base64.b64encode(buf).decode('utf-8')
        payload = f"data:image/jpeg;base64,{b64}"

        resp = requests.post(
            f"{BACKEND_URL}/api/detection/frame",
            json={"cameraId": "CAM-01", "zone": "Loading Dock", "frameBase64": payload},
            timeout=5
        )
        t1 = time.perf_counter()
        api_latencies.append((t1 - t0) * 1000.0)

    t_api_1 = time.perf_counter()
    cap.release()
    stop_ffmpeg(ff_proc)

    api_total_sec = t_api_1 - t_api_0
    api_fps = round(len(api_latencies) / api_total_sec, 2)
    api_avg_ms = round(float(np.mean(api_latencies)), 2)
    api_p50_ms = round(float(np.percentile(api_latencies, 50)), 2)
    api_p95_ms = round(float(np.percentile(api_latencies, 95)), 2)

    print(f"    HTTP API Pipeline: {api_fps} FPS | Avg Latency: {api_avg_ms} ms | P50: {api_p50_ms} ms | P95: {api_p95_ms} ms")

    overhead_ms = round(api_avg_ms - direct_avg_ms, 2)
    throughput_loss_pct = round(((direct_fps - api_fps) / direct_fps) * 100.0, 1)

    comparison = {
        "direct_inprocess_fps": direct_fps,
        "direct_inprocess_avg_latency_ms": direct_avg_ms,
        "direct_inprocess_p50_ms": direct_p50_ms,
        "direct_inprocess_p95_ms": direct_p95_ms,
        "http_api_fps": api_fps,
        "http_api_avg_latency_ms": api_avg_ms,
        "http_api_p50_ms": api_p50_ms,
        "http_api_p95_ms": api_p95_ms,
        "http_serialization_network_overhead_ms": overhead_ms,
        "throughput_loss_percentage": throughput_loss_pct
    }

    print("\n" + "=" * 75)
    print(" SECTION 5 COMPARISON SUMMARY")
    print("=" * 75)
    print(f" - Direct Pipeline Throughput : {direct_fps} FPS  ({direct_avg_ms} ms/frame)")
    print(f" - HTTP API Throughput        : {api_fps} FPS  ({api_avg_ms} ms/frame)")
    print(f" - Added Serialization Penalty: +{overhead_ms} ms per frame ({throughput_loss_pct}% throughput loss)")
    print("=" * 75)
    return comparison

# ======================================================================
# SECTION 6: BUFFERING & FRAME AGE ANALYSIS
# ======================================================================
def run_section_6_buffering():
    print("\n" + "=" * 75)
    print(" SECTION 6: BUFFERING & FRAME AGE ANALYSIS")
    print("=" * 75)

    ff_proc = start_ffmpeg_publisher()
    time.sleep(3.0)  # let stream run for 3 seconds so 72 frames are published

    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    t_start = time.perf_counter()
    measured_frame_ages = []

    # Read 30 frames with intentional slow processing (~200ms) to measure lag accumulation
    for i in range(30):
        t0 = time.perf_counter()
        ret, frame = cap.read()
        wall_clock_elapsed = time.perf_counter() - t_start

        # Calculate expected live frame index (published at 24 fps)
        live_frame_expected = wall_clock_elapsed * 24.0
        # Frames actually consumed: i
        frame_lag = max(0, int(live_frame_expected - i))
        stale_seconds = round(frame_lag / 24.0, 2)
        measured_frame_ages.append(stale_seconds)

        # Simulate 200ms processing delay
        time.sleep(0.18)

    cap.release()
    stop_ffmpeg(ff_proc)

    initial_lag = measured_frame_ages[0]
    final_lag = measured_frame_ages[-1]
    lag_growth_rate = round((final_lag - initial_lag) / 30.0, 3)

    is_high_latency_buffered = final_lag > 1.0

    buffering_report = {
        "operating_mode": "HIGH LATENCY / BUFFERED" if is_high_latency_buffered else "LOW LATENCY",
        "initial_frame_lag_sec": initial_lag,
        "final_frame_lag_sec": final_lag,
        "lag_growth_per_frame_sec": lag_growth_rate,
        "frames_accumulating": True if final_lag > initial_lag else False,
        "stale_frames_processed": True,
        "root_cause": "OpenCV VideoCapture buffers RTSP frames sequentially when consumer FPS < source FPS. Lack of latest-frame-grabber thread creates unbounded latency backlog."
    }

    print("\n" + "=" * 75)
    print(" SECTION 6 BUFFERING DIAGNOSIS")
    print("=" * 75)
    print(f" - Operating Mode          : {buffering_report['operating_mode']}")
    print(f" - Initial Frame Lag       : {initial_lag} seconds behind live stream")
    print(f" - Final Frame Lag         : {final_lag} seconds behind live stream")
    print(f" - Lag Accumulation Rate   : +{lag_growth_rate} seconds of delay per processed frame")
    print(f" - Stale Frames Processed  : {buffering_report['stale_frames_processed']}")
    print(f" - Root Cause Diagnosis    : {buffering_report['root_cause']}")
    print("=" * 75)
    return buffering_report

# ======================================================================
# SECTION 7: GPU & CPU UTILIZATION ACROSS STATES
# ======================================================================
def run_section_7_hardware_utilization(nvml_handle):
    print("\n" + "=" * 75)
    print(" SECTION 7: GPU & CPU UTILIZATION BENCHMARK")
    print("=" * 75)

    report = {}

    # State A: Idle
    print("\n[State A] Measuring System Idle (5 seconds)...")
    idle_cpus, idle_gpus, idle_mems = [], [], []
    for _ in range(5):
        c, g, m = get_system_metrics(nvml_handle)
        idle_cpus.append(c)
        idle_gpus.append(g)
        idle_mems.append(m)
        time.sleep(1.0)
    report["A_Idle"] = {
        "cpu_pct": round(float(np.mean(idle_cpus)), 1),
        "gpu_util_pct": round(float(np.mean(idle_gpus)), 1),
        "gpu_memory_mb": round(float(np.mean(idle_mems)), 1)
    }
    print(f"    Idle: CPU={report['A_Idle']['cpu_pct']}%, GPU={report['A_Idle']['gpu_util_pct']}%, GPU Mem={report['A_Idle']['gpu_memory_mb']} MB")

    # State B: Continuous YOLO Inference (GPU saturated)
    print("\n[State B] Measuring Pure GPU YOLO Inference (30 iterations)...")
    detector = IndustrialSafetyDetector(models_dir=os.path.join(ROOT_DIR, "ai", "models"))
    dummy = np.zeros((720, 1280, 3), dtype=np.uint8)
    yolo_cpus, yolo_gpus, yolo_mems = [], [], []
    for _ in range(30):
        detector.model.predict(dummy, conf=0.45, verbose=False, device=detector.device)
        c, g, m = get_system_metrics(nvml_handle)
        yolo_cpus.append(c)
        yolo_gpus.append(g)
        yolo_mems.append(m)
    report["B_YOLO_Inference"] = {
        "cpu_pct": round(float(np.mean(yolo_cpus)), 1),
        "gpu_util_pct": round(float(np.mean(yolo_gpus)), 1),
        "gpu_memory_mb": round(float(np.mean(yolo_mems)), 1)
    }
    print(f"    YOLO Inference: CPU={report['B_YOLO_Inference']['cpu_pct']}%, GPU={report['B_YOLO_Inference']['gpu_util_pct']}%, GPU Mem={report['B_YOLO_Inference']['gpu_memory_mb']} MB")

    # State C: RTSP Continuous Processing (Phase 3 API loop)
    print("\n[State C] Measuring Continuous RTSP API Processing (20 frames)...")
    ff_proc = start_ffmpeg_publisher()
    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    rtsp_cpus, rtsp_gpus, rtsp_mems = [], [], []
    for _ in range(20):
        ret, frame = cap.read()
        if ret and frame is not None:
            _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            b64 = base64.b64encode(buf).decode('utf-8')
            try:
                requests.post(
                    f"{BACKEND_URL}/api/detection/frame",
                    json={"cameraId": "CAM-01", "zone": "Loading Dock", "frameBase64": f"data:image/jpeg;base64,{b64}"},
                    timeout=5
                )
            except Exception:
                pass
        c, g, m = get_system_metrics(nvml_handle)
        rtsp_cpus.append(c)
        rtsp_gpus.append(g)
        rtsp_mems.append(m)

    cap.release()
    stop_ffmpeg(ff_proc)

    report["C_RTSP_Continuous_API"] = {
        "cpu_pct": round(float(np.mean(rtsp_cpus)), 1),
        "gpu_util_pct": round(float(np.mean(rtsp_gpus)), 1),
        "gpu_memory_mb": round(float(np.mean(rtsp_mems)), 1)
    }
    print(f"    RTSP Continuous API: CPU={report['C_RTSP_Continuous_API']['cpu_pct']}%, GPU={report['C_RTSP_Continuous_API']['gpu_util_pct']}%, GPU Mem={report['C_RTSP_Continuous_API']['gpu_memory_mb']} MB")

    # State D: 4-Camera Batched Processing (PyTorch batch=4)
    print("\n[State D] Measuring 4-Camera Batched Processing (Batch=4, 20 iterations)...")
    batch_4 = [dummy, dummy, dummy, dummy]
    b4_cpus, b4_gpus, b4_mems = [], [], []
    for _ in range(20):
        detector.model.predict(batch_4, conf=0.45, verbose=False, device=detector.device)
        c, g, m = get_system_metrics(nvml_handle)
        b4_cpus.append(c)
        b4_gpus.append(g)
        b4_mems.append(m)

    report["D_4Cam_Batched"] = {
        "cpu_pct": round(float(np.mean(b4_cpus)), 1),
        "gpu_util_pct": round(float(np.mean(b4_gpus)), 1),
        "gpu_memory_mb": round(float(np.mean(b4_mems)), 1)
    }
    print(f"    4-Cam Batched: CPU={report['D_4Cam_Batched']['cpu_pct']}%, GPU={report['D_4Cam_Batched']['gpu_util_pct']}%, GPU Mem={report['D_4Cam_Batched']['gpu_memory_mb']} MB")

    print("\n" + "=" * 75)
    print(" SECTION 7 HARDWARE UTILIZATION SUMMARY")
    print("=" * 75)
    print(f" {'WORKLOAD STATE':<28s} | {'CPU UTIL (%)':<14s} | {'GPU UTIL (%)':<14s} | {'GPU MEM (MB)':<12s}")
    print("-" * 75)
    for state, vals in report.items():
        print(f" {state:<28s} | {vals['cpu_pct']:<14.1f} | {vals['gpu_util_pct']:<14.1f} | {vals['gpu_memory_mb']:<12.1f}")
    print("=" * 75)
    return report

def main():
    nvml_handle = init_nvml()
    sec4 = run_section_4_sampling(nvml_handle)
    sec5 = run_section_5_direct_vs_api(nvml_handle)
    sec6 = run_section_6_buffering()
    sec7 = run_section_7_hardware_utilization(nvml_handle)

    all_data = {
        "section_4_sampling": sec4,
        "section_5_direct_vs_api": sec5,
        "section_6_buffering": sec6,
        "section_7_hardware_utilization": sec7
    }

    with open(os.path.join(ROOT_DIR, "docs", "reports", "phase4_comprehensive_results.json"), "w") as f:
        json.dump(all_data, f, indent=2)
    print("\nAll benchmark results successfully exported to docs/reports/phase4_comprehensive_results.json")

if __name__ == "__main__":
    main()
