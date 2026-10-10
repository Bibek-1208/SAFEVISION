import os
import sys
import time
import cv2
import json
import numpy as np

# Ensure ai directory in sys.path
sys.path.insert(0, os.path.abspath("ai"))

from inference.detector import IndustrialSafetyDetector

# Load credentials from server/.env
env_path = r"c:\Users\bibek\Desktop\SAFEVISION\server\.env"
config = {}
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            config[k.strip()] = v.strip().strip("'\"")

raw_url = config.get("CAM_01_RTSP_URL", "rtsp://192.168.137.82:4447/h264.sdp")
user = config.get("CCTV_RTSP_USER", "")
pwd = config.get("CCTV_RTSP_PASS", "")

if user and "@" not in raw_url:
    pass_part = f":{pwd}" if pwd else ""
    target_url = raw_url.replace("://", f"://{user}{pass_part}@")
else:
    target_url = raw_url

print("=== SAFEVISION AI — REAL CCTV FRAME INFERENCE INSPECTION ===")

# 1. Initialize Production Detector
detector = IndustrialSafetyDetector(models_dir="ai/models")
print(f"Model ID: {detector.model_id}")
print(f"Model Weights: {detector.model_path}")
print(f"Model Checksum: {detector.actual_checksum}")
print(f"Inference Device: {detector.device}")
print(f"Classes: {detector.class_names if hasattr(detector, 'class_names') else 'SH17'}")

# 2. Capture Real Frames from Physical Stream
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;3000000|fflags;nobuffer|flags;low_delay"
cap = cv2.VideoCapture(target_url, cv2.CAP_FFMPEG)
if not cap.isOpened():
    print("[ERROR] Could not open physical CCTV stream")
    sys.exit(1)

w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
source_fps = cap.get(cv2.CAP_PROP_FPS)
print(f"Stream Opened: {w}x{h} @ {source_fps:.1f} source FPS")

latencies = []
all_detections = []
all_tracks = []
annotated_frame = None

test_frames_target = 60
print(f"Running inference on {test_frames_target} live frames from physical CCTV...")

for i in range(test_frames_target):
    ret, frame = cap.read()
    if not ret or frame is None:
        continue
    
    t0 = time.perf_counter()
    resp = detector.infer_frame_direct(
        img=frame,
        camera_id="CAM-01",
        zone="Loading Dock & Logistics",
        required_ppe=["helmet", "safety-vest"],
        conf_thresh=0.35
    )
    t1 = time.perf_counter()
    latency_ms = (t1 - t0) * 1000
    latencies.append(latency_ms)
    
    if resp.detections:
        all_detections.extend(resp.detections)
    if resp.tracked_workers:
        all_tracks.extend(resp.tracked_workers)
    
    # Save last annotated frame
    if i == test_frames_target - 1 or resp.detections:
        annotated_frame = frame.copy()
        # Draw detections
        for d in resp.detections:
            box = d.bounding_box
            ymin, xmin, ymax, xmax = int(box.ymin/100*h), int(box.xmin/100*w), int(box.ymax/100*h), int(box.xmax/100*w)
            cv2.rectangle(annotated_frame, (xmin, ymin), (xmax, ymax), (0, 255, 0), 2)
            cv2.putText(annotated_frame, f"{d.class_name} {d.confidence:.2f}", (xmin, max(20, ymin - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

cap.release()

avg_latency = float(np.mean(latencies)) if latencies else 0.0
p50_latency = float(np.percentile(latencies, 50)) if latencies else 0.0
p95_latency = float(np.percentile(latencies, 95)) if latencies else 0.0
inference_fps = round(1000.0 / avg_latency, 2) if avg_latency > 0 else 0.0

print(f"\n=== INFERENCE PERFORMANCE ON REAL CCTV FRAMES ===")
print(f"Frames Evaluated: {len(latencies)}")
print(f"Inference Latency: avg={avg_latency:.2f}ms, p50={p50_latency:.2f}ms, p95={p95_latency:.2f}ms")
print(f"Pure Inference Speed: {inference_fps:.2f} FPS")

print(f"\n=== DETECTION EVIDENCE ===")
if len(all_detections) == 0:
    print("NO TARGET DETECTED DURING TEST WINDOW")
else:
    print(f"Total Detections Observed: {len(all_detections)}")
    for d in all_detections[:10]:
        print(f"  Class: {d.class_name}, Confidence: {d.confidence:.3f}, BBox: ymin={d.bounding_box.ymin:.1f} xmin={d.bounding_box.xmin:.1f} ymax={d.bounding_box.ymax:.1f} xmax={d.bounding_box.xmax:.1f}")

print(f"\n=== BYTETRACK TRACKING EVIDENCE ===")
if len(all_tracks) == 0:
    print("NO WORKER TRACKS DETECTED DURING TEST WINDOW")
else:
    print(f"Total Worker Tracks Observed: {len(all_tracks)}")
    for t in all_tracks[:5]:
        print(f"  TrackID: {t.track_id}, Identity: {t.identity_status} (Emp: {t.employee_id}), State: {t.temporal_state}")
        print(f"    PPE Status: Helmet={t.helmet_status}, Vest={t.vest_status}, Gloves={t.gloves_status}, Shoes={t.shoes_status}")

# Save snapshot
out_path = r"c:\Users\bibek\Desktop\SAFEVISION\scratch\real_cctv_ai_annotated.jpg"
if annotated_frame is not None:
    cv2.imwrite(out_path, annotated_frame)
    print(f"\nSaved annotated evidence image to {out_path} ({os.path.getsize(out_path)} bytes)")

print("\n=== AI PIPELINE REALITY VERIFICATION COMPLETE ===")
