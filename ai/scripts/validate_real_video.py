"""
SafeVision AI - Real Video Validation Script
Executes full real-time computer vision pipeline on actual industrial video:
1. Video decoding via OpenCV
2. Real SH17 PPE model inference (GPU/CUDA accelerated)
3. ByteTrack multi-object tracking (TRACK-XXXX temporary identity)
4. Safe PPE Association (PRESENT, MISSING, UNKNOWN)
5. Temporal Validation Engine (FPS-driven multi-frame windowing)
6. Annotated MP4 generation
7. Machine-readable JSON analytics output
"""

import os
import sys
import time
import json
import argparse
import cv2
import numpy as np
from typing import Dict, Any, List

# Ensure ai directory is on path
current_dir = os.path.dirname(os.path.abspath(__file__))
ai_root = os.path.dirname(current_dir)
if ai_root not in sys.path:
    sys.path.insert(0, ai_root)

from inference.detector import IndustrialSafetyDetector
from inference.tracker import ByteTracker
from inference.ppe_association import PPEAssociationEngine
from inference.temporal_validator import TemporalValidationEngine, TemporalValidationConfig
from inference.provenance import ModelRegistry

def validate_video(
    source_video: str,
    weights_path: str = os.path.join(ai_root, "models", "industrial_yolov8.pt"),
    output_video_path: str = "annotated_real_video.mp4",
    output_json_path: str = "video_validation_analytics.json",
    max_frames: int = 150,
    conf_thresh: float = 0.25
):
    print("==================================================")
    print("       SAFEVISION AI — REAL VIDEO VALIDATION      ")
    print("==================================================")
    print(f"Source Video:   {source_video}")
    print(f"Model Weights:  {weights_path}")
    print(f"Output Video:   {output_video_path}")
    print(f"Output JSON:    {output_json_path}")
    print("--------------------------------------------------")

    # 1. Source Video Check
    if not source_video or not os.path.exists(source_video):
        print(f"[BLOCKED] REAL VIDEO TEST BLOCKED — REAL VIDEO REQUIRED.")
        print(f"File not found: '{source_video}'")
        sys.exit(1)

    cap = cv2.VideoCapture(source_video)
    if not cap.isOpened():
        print(f"[BLOCKED] REAL VIDEO TEST BLOCKED — Unable to open video file: {source_video}")
        sys.exit(1)

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_sec = total_video_frames / source_fps if source_fps > 0 else 0.0

    print(f"[OK] Video Stream Opened:")
    print(f"     Resolution:   {video_width}x{video_height}")
    print(f"     Source FPS:   {source_fps:.2f}")
    print(f"     Total Frames: {total_video_frames}")
    print(f"     Duration:     {duration_sec:.2f}s")
    print("--------------------------------------------------")

    # 2. Check Model Weights & Checksum
    if not os.path.exists(weights_path):
        print(f"[FAIL] Model file missing: {weights_path}")
        sys.exit(1)

    reg = ModelRegistry()
    actual_checksum = reg.compute_file_checksum(weights_path)
    rec = reg.get_model("MODEL-PPE-SH17-001")
    expected_checksum = rec.weightsChecksum if rec else None

    if not expected_checksum or actual_checksum.lower() != expected_checksum.lower():
        print(f"[FAIL] CHECKSUM_MISMATCH: Actual={actual_checksum}, Expected={expected_checksum}")
        sys.exit(1)

    print(f"[OK] Model Checksum Verified: {actual_checksum}")

    # 3. Initialize Detector & Subsystems
    detector = IndustrialSafetyDetector(models_dir=os.path.dirname(weights_path))
    if detector.runtime_state != "READY":
        print(f"[FAIL] Detector failed to reach READY state: {detector.runtime_state}")
        sys.exit(1)

    print(f"[OK] AI Inference Engine initialized on device: {detector.device}")
    print(f"     Hardware: {detector.gpu_name or 'CPU'}")

    # Initialize VideoWriter
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out_writer = cv2.VideoWriter(output_video_path, fourcc, min(source_fps, 30.0), (video_width, video_height))

    # Analytics accumulators
    frame_latencies_ms: List[float] = []
    unique_tracks = set()
    track_frame_counts: Dict[str, int] = {}
    total_detections_count = 0
    ppe_counts = {
        "helmet": {"PRESENT": 0, "MISSING": 0, "UNKNOWN": 0},
        "safety-vest": {"PRESENT": 0, "MISSING": 0, "UNKNOWN": 0},
        "gloves": {"PRESENT": 0, "MISSING": 0, "UNKNOWN": 0},
        "shoes": {"PRESENT": 0, "MISSING": 0, "UNKNOWN": 0}
    }
    temporally_confirmed_violations: List[Dict[str, Any]] = []
    incident_candidates: List[Dict[str, Any]] = []

    frames_to_process = min(total_video_frames, max_frames) if max_frames > 0 else total_video_frames
    print(f"[SafeVision AI] Processing {frames_to_process} frames...")

    start_wall_time = time.perf_counter()
    processed_count = 0

    while processed_count < frames_to_process:
        ret, frame = cap.read()
        if not ret:
            break

        current_frame_time_sec = processed_count / source_fps

        t0 = time.perf_counter()
        # 1. Raw Model Inference
        results = detector.model.predict(frame, conf=conf_thresh, verbose=False, device=detector.device)
        t_infer = (time.perf_counter() - t0) * 1000.0
        frame_latencies_ms.append(t_infer)

        raw_detections = []
        person_detections = []
        boxes = results[0].boxes
        h, w = frame.shape[:2]

        for box in boxes:
            xyxy = box.xyxy[0].cpu().numpy()
            cls_id = int(box.cls[0].cpu().numpy())
            confidence = float(box.conf[0].cpu().numpy())
            cls_name = detector.model.names.get(cls_id, f"class_{cls_id}").lower().replace('_', '-')

            ymin = float((xyxy[1] / h) * 100)
            xmin = float((xyxy[0] / w) * 100)
            ymax = float((xyxy[3] / h) * 100)
            xmax = float((xyxy[2] / w) * 100)
            bbox_pct = [round(ymin, 2), round(xmin, 2), round(ymax, 2), round(xmax, 2)]

            det_item = {
                "class_name": cls_name,
                "confidence": confidence,
                "bbox": bbox_pct,
                "pixel_box": [int(xyxy[1]), int(xyxy[0]), int(xyxy[3]), int(xyxy[2])]
            }
            raw_detections.append(det_item)
            total_detections_count += 1

            if cls_name == "person":
                person_detections.append({
                    "bbox": bbox_pct,
                    "score": confidence,
                    "pixel_box": det_item["pixel_box"]
                })

        # 2. ByteTrack Multi-Object Tracking
        active_tracks = detector.tracker.update(person_detections)

        # 3. PPE Association & Temporal Validation per track
        annotated_frame = frame.copy()

        for track in active_tracks:
            track_id = track.track_label
            unique_tracks.add(track_id)
            track_frame_counts[track_id] = track_frame_counts.get(track_id, 0) + 1

            # Safe PPE Association
            ppe_eval = detector.ppe_engine.evaluate_track_ppe(
                track_id=track_id,
                person_bbox=track.bbox,
                person_confidence=track.score,
                frame_detections=raw_detections,
                required_ppe=["helmet", "safety-vest"]
            )

            # Record PPE stats
            h_stat = ppe_eval.helmet.status
            v_stat = ppe_eval.vest.status
            g_stat = ppe_eval.gloves.status
            s_stat = ppe_eval.shoes.status

            ppe_counts["helmet"][h_stat] = ppe_counts["helmet"].get(h_stat, 0) + 1
            ppe_counts["safety-vest"][v_stat] = ppe_counts["safety-vest"].get(v_stat, 0) + 1
            ppe_counts["gloves"][g_stat] = ppe_counts["gloves"].get(g_stat, 0) + 1
            ppe_counts["shoes"][s_stat] = ppe_counts["shoes"].get(s_stat, 0) + 1

            # Temporal validation for violations (e.g. MISSING helmet or MISSING vest)
            track_violations = []
            for ppe_item, ppe_state in [("NO_HELMET", h_stat), ("NO_VEST", v_stat)]:
                is_violating = (ppe_state == "MISSING")
                # CRITICAL: UNKNOWN never converts to violation
                is_confirmed, create_inc, t_state, diag = detector.temporal_engine.process_observation(
                    track_id=track_id,
                    camera_id="CAM-VIDEO-EVAL",
                    violation_type=ppe_item,
                    is_violation=is_violating,
                    confidence=track.score,
                    timestamp=current_frame_time_sec
                )
                if is_confirmed:
                    track_violations.append(f"{ppe_item} ({t_state})")
                    temporally_confirmed_violations.append({
                        "frame": processed_count,
                        "timestamp_sec": round(current_frame_time_sec, 2),
                        "track_id": track_id,
                        "violation": ppe_item,
                        "temporal_state": t_state,
                        "diagnostics": diag
                    })
                if create_inc:
                    incident_candidates.append({
                        "track_id": track_id,
                        "violation_type": ppe_item,
                        "frame": processed_count,
                        "timestamp_sec": round(current_frame_time_sec, 2),
                        "confidence": track.score,
                        "rule_id": f"RULE-{ppe_item}-FACTORY"
                    })

            # Draw track on video
            y1 = int((track.bbox[0] / 100.0) * h)
            x1 = int((track.bbox[1] / 100.0) * w)
            y2 = int((track.bbox[2] / 100.0) * h)
            x2 = int((track.bbox[3] / 100.0) * w)

            box_color = (0, 0, 255) if track_violations else (0, 255, 0)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), box_color, 2)

            # Explicitly label trackId as temporary video identity
            label = f"{track_id} (TrackID)"
            cv2.putText(annotated_frame, label, (x1, max(20, y1 - 25)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            ppe_text = f"H:{h_stat[0]} V:{v_stat[0]} (G:{g_stat[0]} S:{s_stat[0]})"
            cv2.putText(annotated_frame, ppe_text, (x1, max(38, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

        # Draw frame HUD (FPS, latency, frame number)
        hud_text = f"Frame {processed_count+1}/{frames_to_process} | Infer: {t_infer:.1f}ms | Tracks: {len(active_tracks)}"
        cv2.putText(annotated_frame, hud_text, (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)

        out_writer.write(annotated_frame)
        processed_count += 1

        if processed_count % 30 == 0 or processed_count == frames_to_process:
            print(f" -> Processed {processed_count}/{frames_to_process} frames | Last Latency: {t_infer:.1f}ms")

    cap.release()
    out_writer.release()

    total_processing_wall_time = time.perf_counter() - start_wall_time
    avg_latency = float(np.mean(frame_latencies_ms)) if frame_latencies_ms else 0.0
    p95_latency = float(np.percentile(frame_latencies_ms, 95)) if frame_latencies_ms else 0.0
    processing_fps = float(processed_count / total_processing_wall_time) if total_processing_wall_time > 0 else 0.0

    # ByteTrack stability metrics
    stable_tracks = [t for t, cnt in track_frame_counts.items() if cnt >= 5]

    analytics = {
        "status": "COMPLETED",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source_video": source_video,
        "source_fps": round(source_fps, 2),
        "video_resolution": f"{video_width}x{video_height}",
        "processed_frames": processed_count,
        "processing_wall_time_sec": round(total_processing_wall_time, 2),
        "processing_fps": round(processing_fps, 2),
        "average_inference_latency_ms": round(avg_latency, 2),
        "p95_inference_latency_ms": round(p95_latency, 2),
        "total_video_duration_sec": round(duration_sec, 2),
        "device": detector.device,
        "gpu_name": detector.gpu_name,
        "total_raw_detections": total_detections_count,
        "number_of_unique_tracks": len(unique_tracks),
        "stable_tracks_count": len(stable_tracks),
        "track_frame_counts": track_frame_counts,
        "ppe_states_summary": ppe_counts,
        "temporally_confirmed_violations_count": len(temporally_confirmed_violations),
        "incident_candidates_count": len(incident_candidates),
        "incident_candidates": incident_candidates,
        "output_video": output_video_path
    }

    with open(output_json_path, "w") as f:
        json.dump(analytics, f, indent=2)

    print("==================================================")
    print("REAL VIDEO VALIDATION RESULTS:")
    print(f" Source FPS:            {source_fps:.2f}")
    print(f" Processed Frames:      {processed_count}")
    print(f" Processing FPS:        {processing_fps:.2f}")
    print(f" Avg Inference Latency: {avg_latency:.2f} ms")
    print(f" P95 Inference Latency: {p95_latency:.2f} ms")
    print(f" Total Unique Tracks:   {len(unique_tracks)} (Stable tracks >=5 frames: {len(stable_tracks)})")
    print(f" Raw Detections:        {total_detections_count}")
    print(f" Incident Candidates:   {len(incident_candidates)}")
    print(f" Annotated Video:       {output_video_path}")
    print(f" Analytics JSON:        {output_json_path}")
    print("==================================================")
    print(">> REAL VIDEO TEST PASSED <<")
    print("==================================================")
    return analytics

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate SafeVision AI on Real Video")
    parser.add_argument("--source", type=str, required=True, help="Path to input video file")
    parser.add_argument("--weights", type=str, default=os.path.join(ai_root, "models", "industrial_yolov8.pt"), help="Model weights path")
    parser.add_argument("--output_video", type=str, default="annotated_real_video.mp4", help="Path to save annotated video")
    parser.add_argument("--output_json", type=str, default="video_validation_analytics.json", help="Path to save JSON analytics")
    parser.add_argument("--max_frames", type=int, default=150, help="Maximum number of frames to process")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()

    validate_video(
        source_video=args.source,
        weights_path=args.weights,
        output_video_path=args.output_video,
        output_json_path=args.output_json,
        max_frames=args.max_frames,
        conf_thresh=args.conf
    )
