"""
SafeVision AI — Real Pipeline Performance Benchmark
Measures actual stage-by-stage latencies and end-to-end processing across 720p, 1080p, and 4K.
Measures:
1. Video decode
2. YOLO inference
3. ByteTrack
4. PPE association
5. Temporal validation
6. Incident processing
7. MongoDB persistence
8. Pure YOLO Inference FPS vs End-to-End Pipeline FPS
"""

import os
import sys
import time
import json
import cv2
import numpy as np
import torch
import psutil
from pymongo import MongoClient

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT_DIR, "ai"))
from inference.detector import IndustrialSafetyDetector

MONGO_URI = "mongodb://127.0.0.1:27017/safevision?replicaSet=rs0&directConnection=true"

def benchmark_resolution(detector, video_path, target_resolution, num_frames=100):
    res_w, res_h = target_resolution
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0

    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
    db = mongo_client["safevision"]
    incidents_col = db["incidents"]

    decode_times = []
    yolo_times = []
    track_times = []
    ppe_times = []
    temporal_times = []
    incident_db_times = []
    e2e_times = []

    unique_tracks = set()
    frames_processed = 0
    dropped_frames = 0

    # Reset CUDA memory stats
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()

    cpu_samples = []

    for i in range(num_frames):
        t_start_e2e = time.perf_counter()

        # 1. Video Decode
        t0 = time.perf_counter()
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                dropped_frames += 1
                continue

        # Resize if not matching target resolution
        orig_h, orig_w = frame.shape[:2]
        if (orig_w, orig_h) != (res_w, res_h):
            frame = cv2.resize(frame, (res_w, res_h), interpolation=cv2.INTER_LINEAR)
        t_decode = (time.perf_counter() - t0) * 1000.0
        decode_times.append(t_decode)

        # 2. YOLO Neural Inference
        t0 = time.perf_counter()
        results = detector.model.predict(frame, conf=0.25, verbose=False, device=detector.device)
        t_yolo = (time.perf_counter() - t0) * 1000.0
        yolo_times.append(t_yolo)

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

        # 3. ByteTrack
        t0 = time.perf_counter()
        active_tracks = detector.tracker.update(persons)
        t_track = (time.perf_counter() - t0) * 1000.0
        track_times.append(t_track)

        # 4. PPE Association
        t0 = time.perf_counter()
        ppe_evals = []
        for trk in active_tracks:
            unique_tracks.add(trk.track_label)
            pe = detector.ppe_engine.evaluate_track_ppe(
                track_id=trk.track_label,
                person_bbox=trk.bbox,
                person_confidence=trk.score,
                frame_detections=raw_dets,
                required_ppe=["helmet", "safety-vest"]
            )
            ppe_evals.append((trk, pe))
        t_ppe = (time.perf_counter() - t0) * 1000.0
        ppe_times.append(t_ppe)

        # 5. Temporal Validation
        t0 = time.perf_counter()
        confirmed_candidates = []
        current_time_sec = i / source_fps
        for trk, pe in ppe_evals:
            for viol in pe.violations:
                is_conf, should_create, state, diag = detector.temporal_engine.process_observation(
                    track_id=trk.track_label,
                    camera_id="CAM-BENCHMARK",
                    violation_type=viol,
                    is_violation=True,
                    confidence=trk.score,
                    timestamp=current_time_sec
                )
                if should_create:
                    confirmed_candidates.append((trk, viol, diag))
        t_temporal = (time.perf_counter() - t0) * 1000.0
        temporal_times.append(t_temporal)

        # 6 & 7. Incident Processing & MongoDB Persistence
        t0 = time.perf_counter()
        for trk, viol, diag in confirmed_candidates:
            doc = {
                "incidentId": f"BENCH-{int(time.time()*1000)}-{trk.track_label}",
                "source": "AI_BENCHMARK",
                "trackId": trk.track_label,
                "violationType": viol,
                "severity": "high",
                "confidence": round(trk.score, 3),
                "cameraId": "CAM-BENCHMARK",
                "zone": "Benchmark Zone",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "DETECTED",
                "diagnostics": diag
            }
            incidents_col.insert_one(doc)
        t_db = (time.perf_counter() - t0) * 1000.0
        incident_db_times.append(t_db)

        t_e2e = (time.perf_counter() - t_start_e2e) * 1000.0
        e2e_times.append(t_e2e)
        frames_processed += 1

        if i % 10 == 0:
            cpu_samples.append(psutil.cpu_percent())

    cap.release()
    mongo_client.close()

    gpu_mem_mb = torch.cuda.memory_allocated() / (1024 * 1024) if torch.cuda.is_available() else 0.0
    gpu_peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024) if torch.cuda.is_available() else 0.0
    avg_cpu = float(np.mean(cpu_samples)) if cpu_samples else 0.0

    avg_yolo = float(np.mean(yolo_times))
    avg_e2e = float(np.mean(e2e_times))
    inference_fps = round(1000.0 / avg_yolo, 2) if avg_yolo > 0 else 0.0
    pipeline_fps = round(1000.0 / avg_e2e, 2) if avg_e2e > 0 else 0.0

    return {
        "resolution": f"{res_w}x{res_h}",
        "input_fps": round(source_fps, 2),
        "inference_fps": inference_fps,
        "pipeline_fps": pipeline_fps,
        "frames_processed": frames_processed,
        "dropped_frames": dropped_frames,
        "number_of_tracks": len(unique_tracks),
        "stage_latencies_ms": {
            "decode": {"avg": round(float(np.mean(decode_times)), 2), "p50": round(float(np.percentile(decode_times, 50)), 2), "p95": round(float(np.percentile(decode_times, 95)), 2)},
            "yolo_inference": {"avg": round(avg_yolo, 2), "p50": round(float(np.percentile(yolo_times, 50)), 2), "p95": round(float(np.percentile(yolo_times, 95)), 2)},
            "bytetrack": {"avg": round(float(np.mean(track_times)), 2), "p50": round(float(np.percentile(track_times, 50)), 2), "p95": round(float(np.percentile(track_times, 95)), 2)},
            "ppe_association": {"avg": round(float(np.mean(ppe_times)), 2), "p50": round(float(np.percentile(ppe_times, 50)), 2), "p95": round(float(np.percentile(ppe_times, 95)), 2)},
            "temporal_validation": {"avg": round(float(np.mean(temporal_times)), 2), "p50": round(float(np.percentile(temporal_times, 50)), 2), "p95": round(float(np.percentile(temporal_times, 95)), 2)},
            "incident_mongodb": {"avg": round(float(np.mean(incident_db_times)), 2), "p50": round(float(np.percentile(incident_db_times, 50)), 2), "p95": round(float(np.percentile(incident_db_times, 95)), 2)},
            "total_end_to_end": {"avg": round(avg_e2e, 2), "p50": round(float(np.percentile(e2e_times, 50)), 2), "p95": round(float(np.percentile(e2e_times, 95)), 2)}
        },
        "gpu_memory_allocated_mb": round(gpu_mem_mb, 2),
        "gpu_peak_memory_mb": round(gpu_peak_mb, 2),
        "avg_cpu_percent": round(avg_cpu, 1)
    }

def main():
    print("======================================================================")
    print("       SAFEVISION AI — REAL PIPELINE PERFORMANCE BENCHMARK            ")
    print("======================================================================")

    detector = IndustrialSafetyDetector()
    video_path = os.path.join("server", "uploads", "upload-1790575202797-930871458.mp4")
    if not os.path.exists(video_path):
        video_path = os.path.join("ai", "datasets", "stock-footage-vertical-video-warehouse-employee-checks-construction-tools-near-heavy-metal-equipment-managing.webm")

    resolutions = [
        ("720p", (1280, 720)),
        ("1080p", (1920, 1080)),
        ("4K", (3840, 2160))
    ]

    all_benchmarks = {}

    for label, res in resolutions:
        print(f"\n>>> Running Benchmark for {label} ({res[0]}x{res[1]})...")
        res_data = benchmark_resolution(detector, video_path, res, num_frames=80)
        all_benchmarks[label] = res_data
        print(f"    Inference FPS:   {res_data['inference_fps']} fps (Avg: {res_data['stage_latencies_ms']['yolo_inference']['avg']} ms)")
        print(f"    Pipeline FPS:    {res_data['pipeline_fps']} fps (Avg: {res_data['stage_latencies_ms']['total_end_to_end']['avg']} ms)")
        print(f"    P95 E2E Latency: {res_data['stage_latencies_ms']['total_end_to_end']['p95']} ms")
        print(f"    GPU Peak Memory: {res_data['gpu_peak_memory_mb']} MB | CPU: {res_data['avg_cpu_percent']}%")

    out_file = os.path.join(ROOT_DIR, "docs", "reports", "performance_benchmark_report.json")
    with open(out_file, "w") as f:
        json.dump(all_benchmarks, f, indent=2)
    print(f"\n[OK] Benchmark Complete. Results saved to {out_file}")

if __name__ == "__main__":
    main()
