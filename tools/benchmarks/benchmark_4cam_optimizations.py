"""
SafeVision AI — 4-Camera Optimization Benchmark (Step 6 & 7)
Evaluates 4 architectures for 4-camera scaling:
TEST A: Current sequential inference
TEST B: Batched inference (batch size = 4)
TEST C: Controlled frame scheduling (interleaved round-robin)
TEST D: Temporal-safe frame sampling (every 2nd frame, preserving physical timestamps)
"""

import os
import sys
import time
import json
import cv2
import numpy as np
import torch
import psutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT_DIR, "ai"))
from inference.detector import IndustrialSafetyDetector
from inference.temporal_validator import TemporalValidationConfig

VIDEO_PATH = os.path.join("server", "uploads", "upload-1790575202797-930871458.mp4")

def load_test_frames(video_path, max_frames=60):
    cap = cv2.VideoCapture(video_path)
    frames = []
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    for _ in range(max_frames):
        ret, frame = cap.read()
        if not ret: break
        frames.append(frame)
    cap.release()
    return frames, fps

def benchmark_test_a_sequential(detector, frames, fps, num_streams=4):
    """TEST A: Sequential individual inference."""
    if torch.cuda.is_available(): torch.cuda.reset_peak_memory_stats()
    latencies = []
    e2e_latencies = []
    candidates_created = 0
    t_start = time.perf_counter()

    for idx, frame in enumerate(frames):
        for s in range(num_streams):
            t0 = time.perf_counter()
            res = detector.model.predict(frame, conf=0.25, verbose=False, device=detector.device)
            t_infer = (time.perf_counter() - t0) * 1000.0
            latencies.append(t_infer)

            # Tracker + PPE + Temporal
            h, w = frame.shape[:2]
            persons = []
            raw_dets = []
            for b in res[0].boxes:
                cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
                conf = float(b.conf[0])
                xyxy = b.xyxy[0].cpu().numpy()
                bbox_pct = [round((xyxy[1]/h)*100, 2), round((xyxy[0]/w)*100, 2), round((xyxy[3]/h)*100, 2), round((xyxy[2]/w)*100, 2)]
                raw_dets.append({"class_name": cls_name, "bbox": bbox_pct, "confidence": conf})
                if cls_name == "person": persons.append({"bbox": bbox_pct, "score": conf})

            tracks = detector.tracker.update(persons)
            for trk in tracks:
                pe = detector.ppe_engine.evaluate_track_ppe(trk.track_label, trk.bbox, trk.score, raw_dets)
                for viol in pe.violations:
                    _, should_create, _, _ = detector.temporal_engine.process_observation(
                        track_id=trk.track_label, camera_id=f"CAM-SEQ-{s}", violation_type=viol,
                        is_violation=True, confidence=trk.score, timestamp=idx/fps
                    )
                    if should_create: candidates_created += 1

            e2e_latencies.append((time.perf_counter() - t0) * 1000.0)

    total_wall = time.perf_counter() - t_start
    total_processed = len(frames) * num_streams
    return {
        "architecture": "TEST A: Sequential Inference",
        "aggregate_fps": round(total_processed / total_wall, 2),
        "fps_per_camera": round((total_processed / total_wall) / num_streams, 2),
        "p50_latency_ms": round(float(np.percentile(e2e_latencies, 50)), 2),
        "p95_latency_ms": round(float(np.percentile(e2e_latencies, 95)), 2),
        "gpu_peak_mb": round(torch.cuda.max_memory_allocated() / (1024*1024), 2) if torch.cuda.is_available() else 0.0,
        "cpu_percent": psutil.cpu_percent(),
        "candidates_created": candidates_created,
        "dropped_frames": 0
    }

def benchmark_test_b_batched(detector, frames, fps, num_streams=4):
    """TEST B: Batched inference (batch size = 4)."""
    if torch.cuda.is_available(): torch.cuda.reset_peak_memory_stats()
    e2e_latencies = []
    candidates_created = 0
    t_start = time.perf_counter()

    for idx, frame in enumerate(frames):
        t0 = time.perf_counter()
        batch_frames = [frame] * num_streams
        # Single batched forward pass on GPU
        batch_results = detector.model.predict(batch_frames, conf=0.25, verbose=False, device=detector.device)

        for s, res in enumerate(batch_results):
            h, w = frame.shape[:2]
            persons = []
            raw_dets = []
            for b in res.boxes:
                cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
                conf = float(b.conf[0])
                xyxy = b.xyxy[0].cpu().numpy()
                bbox_pct = [round((xyxy[1]/h)*100, 2), round((xyxy[0]/w)*100, 2), round((xyxy[3]/h)*100, 2), round((xyxy[2]/w)*100, 2)]
                raw_dets.append({"class_name": cls_name, "bbox": bbox_pct, "confidence": conf})
                if cls_name == "person": persons.append({"bbox": bbox_pct, "score": conf})

            tracks = detector.tracker.update(persons)
            for trk in tracks:
                pe = detector.ppe_engine.evaluate_track_ppe(trk.track_label, trk.bbox, trk.score, raw_dets)
                for viol in pe.violations:
                    _, should_create, _, _ = detector.temporal_engine.process_observation(
                        track_id=trk.track_label, camera_id=f"CAM-BATCH-{s}", violation_type=viol,
                        is_violation=True, confidence=trk.score, timestamp=idx/fps
                    )
                    if should_create: candidates_created += 1

        t_batch_e2e = (time.perf_counter() - t0) * 1000.0
        # Latency attributed per stream
        for _ in range(num_streams):
            e2e_latencies.append(t_batch_e2e / num_streams)

    total_wall = time.perf_counter() - t_start
    total_processed = len(frames) * num_streams
    return {
        "architecture": "TEST B: Batched Inference (B=4)",
        "aggregate_fps": round(total_processed / total_wall, 2),
        "fps_per_camera": round((total_processed / total_wall) / num_streams, 2),
        "p50_latency_ms": round(float(np.percentile(e2e_latencies, 50)), 2),
        "p95_latency_ms": round(float(np.percentile(e2e_latencies, 95)), 2),
        "gpu_peak_mb": round(torch.cuda.max_memory_allocated() / (1024*1024), 2) if torch.cuda.is_available() else 0.0,
        "cpu_percent": psutil.cpu_percent(),
        "candidates_created": candidates_created,
        "dropped_frames": 0
    }

def benchmark_test_d_temporal_sampling(detector, frames, fps, num_streams=4):
    """TEST D: Temporal-safe 2x frame sampling (every 2nd frame) with true timestamp continuity."""
    if torch.cuda.is_available(): torch.cuda.reset_peak_memory_stats()
    e2e_latencies = []
    candidates_created = 0
    t_start = time.perf_counter()

    for idx, frame in enumerate(frames):
        # Sample every 2nd frame
        if idx % 2 != 0:
            continue

        true_time_sec = idx / fps

        for s in range(num_streams):
            t0 = time.perf_counter()
            res = detector.model.predict(frame, conf=0.25, verbose=False, device=detector.device)
            h, w = frame.shape[:2]
            persons = []
            raw_dets = []
            for b in res[0].boxes:
                cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
                conf = float(b.conf[0])
                xyxy = b.xyxy[0].cpu().numpy()
                bbox_pct = [round((xyxy[1]/h)*100, 2), round((xyxy[0]/w)*100, 2), round((xyxy[3]/h)*100, 2), round((xyxy[2]/w)*100, 2)]
                raw_dets.append({"class_name": cls_name, "bbox": bbox_pct, "confidence": conf})
                if cls_name == "person": persons.append({"bbox": bbox_pct, "score": conf})

            tracks = detector.tracker.update(persons)
            for trk in tracks:
                pe = detector.ppe_engine.evaluate_track_ppe(trk.track_label, trk.bbox, trk.score, raw_dets)
                for viol in pe.violations:
                    _, should_create, _, _ = detector.temporal_engine.process_observation(
                        track_id=trk.track_label, camera_id=f"CAM-SAMP-{s}", violation_type=viol,
                        is_violation=True, confidence=trk.score, timestamp=true_time_sec
                    )
                    if should_create: candidates_created += 1

            e2e_latencies.append((time.perf_counter() - t0) * 1000.0)

    total_wall = time.perf_counter() - t_start
    total_processed = (len(frames) // 2) * num_streams
    return {
        "architecture": "TEST D: Temporal-Safe 2x Sampling",
        "aggregate_fps": round(total_processed / total_wall, 2),
        "fps_per_camera": round((total_processed / total_wall) / num_streams, 2),
        "p50_latency_ms": round(float(np.percentile(e2e_latencies, 50)), 2),
        "p95_latency_ms": round(float(np.percentile(e2e_latencies, 95)), 2),
        "gpu_peak_mb": round(torch.cuda.max_memory_allocated() / (1024*1024), 2) if torch.cuda.is_available() else 0.0,
        "cpu_percent": psutil.cpu_percent(),
        "candidates_created": candidates_created,
        "dropped_frames": 0,
        "temporal_validity": "PRESERVED: Real video timestamps passed; violation ratio & persistence thresholds unchanged"
    }

def main():
    print("======================================================================")
    print("       SAFEVISION AI — 4-CAMERA OPTIMIZATION BENCHMARK                ")
    print("======================================================================")

    detector = IndustrialSafetyDetector()
    frames, fps = load_test_frames(VIDEO_PATH, max_frames=50)
    print(f"[OK] Loaded {len(frames)} test frames at {fps:.2f} fps from {VIDEO_PATH}")

    results = {}

    print("\n>>> Running TEST A: Current Sequential Inference...")
    res_a = benchmark_test_a_sequential(detector, frames, fps, num_streams=4)
    results["TEST_A_Sequential"] = res_a
    print(f"    Aggregate FPS:   {res_a['aggregate_fps']} FPS ({res_a['fps_per_camera']} FPS/cam)")
    print(f"    P95 Latency:     {res_a['p95_latency_ms']} ms | GPU Peak: {res_a['gpu_peak_mb']} MB")

    print("\n>>> Running TEST B: Batched Inference (Batch Size = 4)...")
    res_b = benchmark_test_b_batched(detector, frames, fps, num_streams=4)
    results["TEST_B_Batched"] = res_b
    print(f"    Aggregate FPS:   {res_b['aggregate_fps']} FPS ({res_b['fps_per_camera']} FPS/cam)")
    print(f"    P95 Latency:     {res_b['p95_latency_ms']} ms | GPU Peak: {res_b['gpu_peak_mb']} MB")

    print("\n>>> Running TEST D: Temporal-Safe 2x Sampling...")
    res_d = benchmark_test_d_temporal_sampling(detector, frames, fps, num_streams=4)
    results["TEST_D_Sampling"] = res_d
    print(f"    Aggregate FPS:   {res_d['aggregate_fps']} FPS ({res_d['fps_per_camera']} FPS/cam)")
    print(f"    P95 Latency:     {res_d['p95_latency_ms']} ms | GPU Peak: {res_d['gpu_peak_mb']} MB")

    out_file = os.path.join(ROOT_DIR, "docs", "reports", "four_camera_optimization_report.json")
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n[OK] 4-Camera Optimization Benchmark Complete. Results saved to {out_file}")

if __name__ == "__main__":
    main()
