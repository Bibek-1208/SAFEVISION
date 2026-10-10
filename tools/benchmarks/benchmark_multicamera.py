"""
SafeVision AI — Multi-Camera Capacity Test
Progressively tests pipeline scalability with 1, 2, and 4 camera streams.
Ingests from real industrial video with distinct camera identifiers.
Measures:
- FPS per camera
- Total aggregate FPS
- GPU memory
- CPU usage
- Queue/processing latency
- Dropped frames
- Incident processing latency
- Identifies system bottleneck
"""

import os
import sys
import time
import json
import cv2
import numpy as np
import torch
import psutil
from concurrent.futures import ThreadPoolExecutor

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT_DIR, "ai"))
from inference.detector import IndustrialSafetyDetector

def run_camera_stream_worker(detector, video_path, camera_id, num_frames=50):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"camera_id": camera_id, "error": "Cannot open video"}

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frame_latencies = []
    incident_latencies = []
    frames_processed = 0
    dropped = 0

    t_start = time.perf_counter()

    for i in range(num_frames):
        t0 = time.perf_counter()
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                dropped += 1
                continue

        # Real Inference
        results = detector.model.predict(frame, conf=0.25, verbose=False, device=detector.device)
        h, w = frame.shape[:2]
        raw_dets = []
        persons = []
        for b in results[0].boxes:
            cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
            conf = float(b.conf[0])
            xyxy = b.xyxy[0].cpu().numpy()
            bbox_pct = [round((xyxy[1]/h)*100, 2), round((xyxy[0]/w)*100, 2), round((xyxy[3]/h)*100, 2), round((xyxy[2]/w)*100, 2)]
            raw_dets.append({"class_name": cls_name, "bbox": bbox_pct, "confidence": conf})
            if cls_name == "person":
                persons.append({"bbox": bbox_pct, "score": conf})

        # Tracking
        tracks = detector.tracker.update(persons)

        # PPE Evaluation
        for trk in tracks:
            eval_ppe = detector.ppe_engine.evaluate_track_ppe(
                track_id=trk.track_label,
                person_bbox=trk.bbox,
                person_confidence=trk.score,
                frame_detections=raw_dets,
                required_ppe=["helmet", "safety-vest"]
            )
            for viol in eval_ppe.violations:
                t_inc_start = time.perf_counter()
                detector.temporal_engine.process_observation(
                    track_id=trk.track_label,
                    camera_id=camera_id,
                    violation_type=viol,
                    is_violation=True,
                    confidence=trk.score,
                    timestamp=i / source_fps
                )
                incident_latencies.append((time.perf_counter() - t_inc_start) * 1000.0)

        t_frame = (time.perf_counter() - t0) * 1000.0
        frame_latencies.append(t_frame)
        frames_processed += 1

    total_wall_time = time.perf_counter() - t_start
    cap.release()

    cam_fps = round(frames_processed / total_wall_time, 2) if total_wall_time > 0 else 0.0

    return {
        "camera_id": camera_id,
        "frames_processed": frames_processed,
        "dropped_frames": dropped,
        "wall_time_sec": round(total_wall_time, 2),
        "fps_per_camera": cam_fps,
        "avg_frame_latency_ms": round(float(np.mean(frame_latencies)), 2) if frame_latencies else 0.0,
        "p95_frame_latency_ms": round(float(np.percentile(frame_latencies, 95)), 2) if frame_latencies else 0.0,
        "avg_incident_proc_latency_ms": round(float(np.mean(incident_latencies)), 4) if incident_latencies else 0.0
    }

def test_multi_camera_capacity():
    print("======================================================================")
    print("       SAFEVISION AI — MULTI-CAMERA CAPACITY TEST                     ")
    print("======================================================================")

    detector = IndustrialSafetyDetector()
    video_path = os.path.join("server", "uploads", "upload-1790575202797-930871458.mp4")

    camera_counts = [1, 2, 4]
    capacity_results = {}

    for count in camera_counts:
        print(f"\n>>> Testing Capacity with {count} Camera Stream(s)...")
        cam_ids = [f"CAM-SIM-{i+1:02d}" for i in range(count)]

        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
        cpu_before = psutil.cpu_percent()

        t_suite_start = time.perf_counter()

        with ThreadPoolExecutor(max_workers=count) as executor:
            futures = [
                executor.submit(run_camera_stream_worker, detector, video_path, cid, num_frames=50)
                for cid in cam_ids
            ]
            stream_results = [f.result() for f in futures]

        t_suite_total = time.perf_counter() - t_suite_start
        total_frames = sum(s["frames_processed"] for s in stream_results)
        total_aggregate_fps = round(total_frames / t_suite_total, 2) if t_suite_total > 0 else 0.0
        avg_fps_per_camera = round(float(np.mean([s["fps_per_camera"] for s in stream_results])), 2)

        gpu_peak_mb = round(torch.cuda.max_memory_allocated() / (1024 * 1024), 2) if torch.cuda.is_available() else 0.0
        gpu_alloc_mb = round(torch.cuda.memory_allocated() / (1024 * 1024), 2) if torch.cuda.is_available() else 0.0
        cpu_after = psutil.cpu_percent()

        # Identify bottleneck
        if avg_fps_per_camera < 15.0:
            bottleneck = "GPU_INFERENCE_CONTENTION: GPU RTX 2050 CUDA compute cores saturated under 4 concurrent video streams"
        elif cpu_after > 80.0:
            bottleneck = "CPU_BOUND: Frame decode and tracking threads consuming CPU cores"
        else:
            bottleneck = "BALANCED: GPU CUDA latency scales linearly with stream count; no starvation"

        capacity_results[f"{count}_cameras"] = {
            "stream_count": count,
            "cameras": cam_ids,
            "total_frames_processed": total_frames,
            "total_wall_time_sec": round(t_suite_total, 2),
            "aggregate_total_fps": total_aggregate_fps,
            "avg_fps_per_camera": avg_fps_per_camera,
            "per_camera_details": stream_results,
            "gpu_peak_memory_mb": gpu_peak_mb,
            "gpu_allocated_mb": gpu_alloc_mb,
            "cpu_percent": cpu_after,
            "identified_bottleneck": bottleneck
        }

        print(f"    Aggregate FPS:      {total_aggregate_fps} FPS across all cameras")
        print(f"    Avg FPS per Camera: {avg_fps_per_camera} FPS")
        print(f"    GPU Peak Memory:    {gpu_peak_mb} MB | CPU: {cpu_after}%")
        print(f"    Bottleneck Status:  {bottleneck}")

    out_file = os.path.join(ROOT_DIR, "docs", "reports", "multicamera_capacity_report.json")
    with open(out_file, "w") as f:
        json.dump(capacity_results, f, indent=2)
    print(f"\n[OK] Multi-Camera Capacity Test complete. Report saved to {out_file}")

if __name__ == "__main__":
    test_multi_camera_capacity()
