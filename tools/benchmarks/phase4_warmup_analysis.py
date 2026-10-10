"""
SafeVision Phase 4 — Section 3: Cold-Start vs Warm-Up Analysis
Runs two benchmarks:
TEST A: Cold start (first inference includes CUDA context initialization, memory allocation, PyTorch kernel JIT)
TEST B: Warm-up (after 5 warm-up inferences on GPU)
Compares:
- Cold-start latency (Frame 1)
- Steady-state latency (Frames 2..N)
- Cold-start FPS (Overall including cold start)
- Steady-state FPS (Excluding cold start)
"""

import os
import sys
import time
import json
import torch
import cv2
import numpy as np

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT_DIR, "ai"))

from inference.detector import IndustrialSafetyDetector

VIDEO_PATH = os.path.join(ROOT_DIR, "ai", "datasets", "stock-footage-vertical-video-warehouse-employee-checks-construction-tools-near-heavy-metal-equipment-managing.webm")

def run_warmup_analysis(num_frames=30):
    print("=" * 75)
    print(" SAFEVISION PHASE 4 — SECTION 3: WARM-UP ANALYSIS")
    print("=" * 75)

    cap = cv2.VideoCapture(VIDEO_PATH)
    frames = []
    while len(frames) < num_frames:
        ret, f = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, f = cap.read()
        frames.append(f)
    cap.release()

    # ----------------------------------------------------
    # TEST A: COLD START
    # ----------------------------------------------------
    print("\n[TEST A] Executing Cold-Start Benchmark (Fresh detector instantiation)...")
    t_init_0 = time.perf_counter()
    detector_cold = IndustrialSafetyDetector(models_dir=os.path.join(ROOT_DIR, "ai", "models"))
    t_init_1 = time.perf_counter()
    init_overhead_ms = (t_init_1 - t_init_0) * 1000.0

    cold_latencies = []
    t_cold_total_0 = time.perf_counter()
    for idx, frame in enumerate(frames):
        torch.cuda.synchronize()
        t0 = time.perf_counter()
        results = detector_cold.model.predict(frame, conf=0.45, verbose=False, device=detector_cold.device)
        torch.cuda.synchronize()
        t1 = time.perf_counter()
        cold_latencies.append((t1 - t0) * 1000.0)
    t_cold_total_1 = time.perf_counter()
    cold_total_sec = t_cold_total_1 - t_cold_total_0

    frame1_cold_ms = cold_latencies[0]
    steady_state_cold_latencies = cold_latencies[1:]
    avg_steady_cold_ms = float(np.mean(steady_state_cold_latencies))
    cold_start_fps = round(num_frames / cold_total_sec, 2)
    steady_fps_from_cold_run = round((num_frames - 1) / (sum(steady_state_cold_latencies) / 1000.0), 2)

    print(f"    Detector Init Overhead:    {round(init_overhead_ms, 2)} ms")
    print(f"    Frame 1 (Cold-Start):      {round(frame1_cold_ms, 2)} ms")
    print(f"    Frames 2..{num_frames} Average:      {round(avg_steady_cold_ms, 2)} ms")
    print(f"    Total Cold Run Time:       {round(cold_total_sec, 3)} s ({cold_start_fps} FPS)")

    # ----------------------------------------------------
    # TEST B: WARMED-UP GPU
    # ----------------------------------------------------
    print("\n[TEST B] Executing Warm-Up Benchmark (After 5 warm-up iterations)...")
    # Warm up with dummy forward passes
    dummy = np.zeros_like(frames[0])
    for _ in range(5):
        detector_cold.model.predict(dummy, conf=0.45, verbose=False, device=detector_cold.device)
    torch.cuda.synchronize()

    warm_latencies = []
    t_warm_total_0 = time.perf_counter()
    for idx, frame in enumerate(frames):
        torch.cuda.synchronize()
        t0 = time.perf_counter()
        results = detector_cold.model.predict(frame, conf=0.45, verbose=False, device=detector_cold.device)
        torch.cuda.synchronize()
        t1 = time.perf_counter()
        warm_latencies.append((t1 - t0) * 1000.0)
    t_warm_total_1 = time.perf_counter()
    warm_total_sec = t_warm_total_1 - t_warm_total_0

    frame1_warm_ms = warm_latencies[0]
    avg_warm_ms = float(np.mean(warm_latencies))
    p50_warm_ms = float(np.percentile(warm_latencies, 50))
    p95_warm_ms = float(np.percentile(warm_latencies, 95))
    max_warm_ms = float(np.max(warm_latencies))
    warm_fps = round(num_frames / warm_total_sec, 2)

    print(f"    Frame 1 (Warmed):          {round(frame1_warm_ms, 2)} ms")
    print(f"    Average Warmed Latency:    {round(avg_warm_ms, 2)} ms (P50: {round(p50_warm_ms, 2)}ms, P95: {round(p95_warm_ms, 2)}ms, Max: {round(max_warm_ms, 2)}ms)")
    print(f"    Total Warmed Run Time:     {round(warm_total_sec, 3)} s ({warm_fps} FPS)")

    comparison = {
        "cold_start_frame1_latency_ms": round(frame1_cold_ms, 2),
        "cold_start_init_overhead_ms": round(init_overhead_ms, 2),
        "steady_state_latency_ms": round(avg_warm_ms, 2),
        "steady_state_p50_ms": round(p50_warm_ms, 2),
        "steady_state_p95_ms": round(p95_warm_ms, 2),
        "steady_state_max_ms": round(max_warm_ms, 2),
        "cold_start_run_fps": cold_start_fps,
        "steady_state_fps": warm_fps,
        "warmup_speedup_factor": round(frame1_cold_ms / avg_warm_ms, 2)
    }

    print("\n" + "=" * 75)
    print(" SECTION 3 COMPARISON SUMMARY")
    print("=" * 75)
    print(f" - Cold-Start Frame 1 Latency : {comparison['cold_start_frame1_latency_ms']} ms")
    print(f" - Steady-State Average Latency: {comparison['steady_state_latency_ms']} ms")
    print(f" - Steady-State P50 Latency    : {comparison['steady_state_p50_ms']} ms")
    print(f" - Steady-State Max Latency    : {comparison['steady_state_max_ms']} ms")
    print(f" - Cold-Start Aggregate FPS    : {comparison['cold_start_run_fps']} FPS")
    print(f" - Steady-State Sustained FPS  : {comparison['steady_state_fps']} FPS")
    print(f" - First-Frame Distortion      : {comparison['warmup_speedup_factor']}x higher latency on frame 1")
    print("=" * 75)

    with open(os.path.join(ROOT_DIR, "docs", "reports", "warmup_analysis_results.json"), "w") as f:
        json.dump(comparison, f, indent=2)

    return comparison

if __name__ == "__main__":
    run_warmup_analysis()
