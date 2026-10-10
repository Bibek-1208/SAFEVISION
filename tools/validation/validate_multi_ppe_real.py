"""
SafeVision AI — Real Multi-PPE Validation Suite
Evaluates genuine model outputs across available real video footage without synthetic data.
Strictly adheres to semantic distinction: PRESENT, MISSING, UNKNOWN.
"""

import os
import sys
import time
import json
import cv2
from collections import Counter

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT_DIR, "ai"))

from inference.detector import IndustrialSafetyDetector
from inference.ppe_association import PPEAssociationEngine
from inference.temporal_validator import TemporalValidationEngine, TemporalValidationConfig

def run_multi_ppe_validation():
    print("======================================================================")
    print("       SAFEVISION AI — REAL MULTI-PPE VALIDATION RUNNER               ")
    print("======================================================================")

    detector = IndustrialSafetyDetector()
    print(f"[OK] Detector initialized on: {detector.device} ({detector.gpu_name or 'CPU'})")
    print(f"[OK] Model: {detector.model_name} (Status: {detector.model_status})")

    results = []

    # TEST 1: Warehouse Real Video (stock footage bare-headed worker with glasses)
    warehouse_video = os.path.join(ROOT_DIR, "ai", "datasets", "stock-footage-vertical-video-warehouse-employee-checks-construction-tools-near-heavy-metal-equipment-managing.webm")
    if os.path.exists(warehouse_video):
        print(f"\n--- [TEST 1] Analyzing: {warehouse_video} ---")
        cap = cv2.VideoCapture(warehouse_video)
        source_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        frames_to_test = min(total_frames, 120)
        track_ppe_counts = {"helmet": Counter(), "vest": Counter(), "glasses": Counter(), "gloves": Counter()}
        detections_count = Counter()

        for idx in range(frames_to_test):
            ret, frame = cap.read()
            if not ret: break
            h, w = frame.shape[:2]
            res = detector.model.predict(frame, conf=0.25, verbose=False, device=detector.device)
            raw_dets = []
            persons = []
            for b in res[0].boxes:
                cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
                conf = float(b.conf[0])
                xyxy = b.xyxy[0].cpu().numpy()
                detections_count[cls_name] += 1
                bbox_pct = [round((xyxy[1]/h)*100, 2), round((xyxy[0]/w)*100, 2), round((xyxy[3]/h)*100, 2), round((xyxy[2]/w)*100, 2)]
                raw_dets.append({"class_name": cls_name, "bbox": bbox_pct, "confidence": conf})
                if cls_name == "person":
                    persons.append({"bbox": bbox_pct, "score": conf})

            tracks = detector.tracker.update(persons)
            for trk in tracks:
                eval_ppe = detector.ppe_engine.evaluate_track_ppe(
                    track_id=trk.track_label,
                    person_bbox=trk.bbox,
                    person_confidence=trk.score,
                    frame_detections=raw_dets,
                    required_ppe=["helmet", "safety-vest", "glasses"]
                )
                track_ppe_counts["helmet"][eval_ppe.helmet.status] += 1
                track_ppe_counts["vest"][eval_ppe.vest.status] += 1
                track_ppe_counts["glasses"][eval_ppe.additional_ppe.get("glasses", eval_ppe.helmet).status] += 1
                track_ppe_counts["gloves"][eval_ppe.gloves.status] += 1

        cap.release()
        results.append({
            "test_name": "Warehouse Worker (Bare head, safety glasses)",
            "video": warehouse_video,
            "resolution": f"{width}x{height}",
            "fps": round(source_fps, 2),
            "frames_analyzed": frames_to_test,
            "helmet_state": dict(track_ppe_counts["helmet"]),
            "glasses_state": dict(track_ppe_counts["glasses"]),
            "vest_state": dict(track_ppe_counts["vest"]),
            "gloves_state": dict(track_ppe_counts["gloves"]),
            "top_detections": dict(detections_count.most_common(6))
        })
        print(f"      Analyzed {frames_to_test} frames:")
        print(f"      Helmet Status:  {dict(track_ppe_counts['helmet'])}")
        print(f"      Glasses Status: {dict(track_ppe_counts['glasses'])}")
        print(f"      Vest Status:    {dict(track_ppe_counts['vest'])}")

    # TEST 2: Real 1080p Industrial Video (Worker with helmet & vest, bare hands)
    upload_577 = os.path.join("server", "uploads", "upload-1790575202797-930871458.mp4")
    if os.path.exists(upload_577):
        print(f"\n--- [TEST 2] Analyzing: {upload_577} ---")
        cap = cv2.VideoCapture(upload_577)
        source_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        frames_to_test = min(total_frames, 120)
        track_ppe_counts = {"helmet": Counter(), "vest": Counter(), "gloves": Counter()}
        detections_count = Counter()

        for idx in range(frames_to_test):
            ret, frame = cap.read()
            if not ret: break
            h, w = frame.shape[:2]
            res = detector.model.predict(frame, conf=0.25, verbose=False, device=detector.device)
            raw_dets = []
            persons = []
            for b in res[0].boxes:
                cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
                conf = float(b.conf[0])
                xyxy = b.xyxy[0].cpu().numpy()
                detections_count[cls_name] += 1
                bbox_pct = [round((xyxy[1]/h)*100, 2), round((xyxy[0]/w)*100, 2), round((xyxy[3]/h)*100, 2), round((xyxy[2]/w)*100, 2)]
                raw_dets.append({"class_name": cls_name, "bbox": bbox_pct, "confidence": conf})
                if cls_name == "person":
                    persons.append({"bbox": bbox_pct, "score": conf})

            tracks = detector.tracker.update(persons)
            for trk in tracks:
                eval_ppe = detector.ppe_engine.evaluate_track_ppe(
                    track_id=trk.track_label,
                    person_bbox=trk.bbox,
                    person_confidence=trk.score,
                    frame_detections=raw_dets,
                    required_ppe=["helmet", "safety-vest", "gloves"]
                )
                track_ppe_counts["helmet"][eval_ppe.helmet.status] += 1
                track_ppe_counts["vest"][eval_ppe.vest.status] += 1
                track_ppe_counts["gloves"][eval_ppe.gloves.status] += 1

        cap.release()
        results.append({
            "test_name": "Industrial 1080p Worker (Helmet & Vest, Bare hands)",
            "video": upload_577,
            "resolution": f"{width}x{height}",
            "fps": round(source_fps, 2),
            "frames_analyzed": frames_to_test,
            "helmet_state": dict(track_ppe_counts["helmet"]),
            "vest_state": dict(track_ppe_counts["vest"]),
            "gloves_state": dict(track_ppe_counts["gloves"]),
            "top_detections": dict(detections_count.most_common(6))
        })
        print(f"      Analyzed {frames_to_test} frames:")
        print(f"      Helmet Status: {dict(track_ppe_counts['helmet'])}")
        print(f"      Vest Status:   {dict(track_ppe_counts['vest'])}")
        print(f"      Gloves Status: {dict(track_ppe_counts['gloves'])}")

    # TEST 3: Real 1080p Industrial Video (Compliant worker with helmet, vest, shoes)
    upload_299 = os.path.join("server", "uploads", "upload-1790575261766-911108119.mp4")
    if os.path.exists(upload_299):
        print(f"\n--- [TEST 3] Analyzing: {upload_299} ---")
        cap = cv2.VideoCapture(upload_299)
        source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        frames_to_test = min(total_frames, 120)
        track_ppe_counts = {"helmet": Counter(), "vest": Counter(), "shoes": Counter()}
        detections_count = Counter()

        for idx in range(frames_to_test):
            ret, frame = cap.read()
            if not ret: break
            h, w = frame.shape[:2]
            res = detector.model.predict(frame, conf=0.25, verbose=False, device=detector.device)
            raw_dets = []
            persons = []
            for b in res[0].boxes:
                cls_name = detector.model.names[int(b.cls[0])].lower().replace('_', '-')
                conf = float(b.conf[0])
                xyxy = b.xyxy[0].cpu().numpy()
                detections_count[cls_name] += 1
                bbox_pct = [round((xyxy[1]/h)*100, 2), round((xyxy[0]/w)*100, 2), round((xyxy[3]/h)*100, 2), round((xyxy[2]/w)*100, 2)]
                raw_dets.append({"class_name": cls_name, "bbox": bbox_pct, "confidence": conf})
                if cls_name == "person":
                    persons.append({"bbox": bbox_pct, "score": conf})

            tracks = detector.tracker.update(persons)
            for trk in tracks:
                eval_ppe = detector.ppe_engine.evaluate_track_ppe(
                    track_id=trk.track_label,
                    person_bbox=trk.bbox,
                    person_confidence=trk.score,
                    frame_detections=raw_dets,
                    required_ppe=["helmet", "safety-vest", "shoes"]
                )
                track_ppe_counts["helmet"][eval_ppe.helmet.status] += 1
                track_ppe_counts["vest"][eval_ppe.vest.status] += 1
                track_ppe_counts["shoes"][eval_ppe.shoes.status] += 1

        cap.release()
        results.append({
            "test_name": "Industrial 1080p Worker (High PPE Compliance)",
            "video": upload_299,
            "resolution": f"{width}x{height}",
            "fps": round(source_fps, 2),
            "frames_analyzed": frames_to_test,
            "helmet_state": dict(track_ppe_counts["helmet"]),
            "vest_state": dict(track_ppe_counts["vest"]),
            "shoes_state": dict(track_ppe_counts["shoes"]),
            "top_detections": dict(detections_count.most_common(6))
        })
        print(f"      Analyzed {frames_to_test} frames:")
        print(f"      Helmet Status: {dict(track_ppe_counts['helmet'])}")
        print(f"      Vest Status:   {dict(track_ppe_counts['vest'])}")
        print(f"      Shoes Status:  {dict(track_ppe_counts['shoes'])}")

    out_file = os.path.join(ROOT_DIR, "docs", "reports", "multi_ppe_validation_report.json")
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n[OK] Multi-PPE validation complete. Report saved to {out_file}")

if __name__ == "__main__":
    run_multi_ppe_validation()
