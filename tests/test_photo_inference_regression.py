#!/usr/bin/env python3
"""
=============================================================================
SAFEVISION AI — PHOTO INFERENCE DETERMINISTIC REGRESSION TEST SUITE
Phases 12.2 Hardening Verification: Static Image Inference & State Isolation
=============================================================================
Verifies:
 1. One worker + PPE (PRESENT)
 2. One worker + missing PPE (MISSING when anatomical region observed without gear)
 3. Multiple workers (distinct tracking & per-worker PPE evaluation)
 4. PPE belonging to worker A must not be assigned to worker B
 5. Overlapping workers (spatial containment & proper assignment)
 6. Partial occlusion / truncation (UNKNOWN, not forced to MISSING)
 7. PPE outside any worker (unassigned gear does not attach to distant worker)
 8. Empty / no-person image (0 persons, 0 violations, clean response)
 9. Static image does not inherit stale ByteTrack state from a live camera
10. Static image does not inherit temporal state & produces 0 database incidents
=============================================================================
"""

import os
import sys
import json
import unittest
import numpy as np
import cv2
import requests
from pathlib import Path
from pymongo import MongoClient

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "ai"))

from inference.detector import IndustrialSafetyDetector
from inference.ppe_association import PPEAssociationEngine, PPEState

MONGO_URI = "mongodb://127.0.0.1:27017"
AI_API_URL = "http://127.0.0.1:8000"


class TestPhotoInferenceRegression(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.models_dir = str(ROOT_DIR / "ai" / "models")
        cls.detector = IndustrialSafetyDetector(models_dir=cls.models_dir)
        cls.assoc_engine = PPEAssociationEngine(visibility_threshold=0.40)
        cls.mongo_client = MongoClient(MONGO_URI)
        cls.db = cls.mongo_client["safevision"]

        # Record initial database counts
        cls.initial_incidents = cls.db["incidents"].count_documents({})
        cls.initial_events = cls.db["incidentevents"].count_documents({})

    @classmethod
    def tearDownClass(cls):
        # Verify database was never polluted by static photo inference
        final_incidents = cls.db["incidents"].count_documents({})
        final_events = cls.db["incidentevents"].count_documents({})
        cls.mongo_client.close()
        assert final_incidents == cls.initial_incidents, (
            f"Database pollution: incidents count changed from {cls.initial_incidents} to {final_incidents}"
        )
        assert final_events == cls.initial_events, (
            f"Database pollution: incidentevents count changed from {cls.initial_events} to {final_events}"
        )

    # -------------------------------------------------------------------------
    # 1. One worker + PPE (PRESENT)
    # -------------------------------------------------------------------------
    def test_01_one_worker_with_ppe(self):
        worker_bbox = [10.0, 10.0, 80.0, 40.0]  # [ymin, xmin, ymax, xmax] in pct
        detections = [
            {"class_name": "helmet", "bbox": [10.0, 15.0, 25.0, 35.0], "confidence": 0.92},
            {"class_name": "safety-vest", "bbox": [25.0, 12.0, 60.0, 38.0], "confidence": 0.89},
            {"class_name": "gloves", "bbox": [50.0, 11.0, 62.0, 18.0], "confidence": 0.85},
            {"class_name": "shoes", "bbox": [70.0, 15.0, 80.0, 35.0], "confidence": 0.88}
        ]
        eval_res = self.assoc_engine.evaluate_track_ppe(
            track_id="W1",
            person_bbox=worker_bbox,
            person_confidence=0.95,
            frame_detections=detections,
            required_ppe=["helmet", "safety-vest"]
        )
        self.assertEqual(eval_res.helmet.status, "PRESENT")
        self.assertEqual(eval_res.vest.status, "PRESENT")
        self.assertEqual(eval_res.gloves.status, "PRESENT")
        self.assertEqual(eval_res.shoes.status, "PRESENT")
        self.assertTrue(eval_res.is_compliant)
        self.assertEqual(len(eval_res.violations), 0)

    # -------------------------------------------------------------------------
    # 2. One worker + missing PPE (MISSING when observed without PPE)
    # -------------------------------------------------------------------------
    def test_02_one_worker_missing_ppe(self):
        # Worker with visible bare head and visible bare torso, no helmet/vest
        worker_bbox = [10.0, 10.0, 80.0, 40.0]
        detections = [
            {"class_name": "head", "bbox": [10.0, 15.0, 25.0, 35.0], "confidence": 0.91},
            {"class_name": "face", "bbox": [15.0, 18.0, 24.0, 32.0], "confidence": 0.88}
        ]
        eval_res = self.assoc_engine.evaluate_track_ppe(
            track_id="W1",
            person_bbox=worker_bbox,
            person_confidence=0.92,
            frame_detections=detections,
            required_ppe=["helmet", "safety-vest"]
        )
        # Head observed without helmet => MISSING
        self.assertEqual(eval_res.helmet.status, "MISSING")
        # Torso visible without vest => MISSING
        self.assertEqual(eval_res.vest.status, "MISSING")
        self.assertFalse(eval_res.is_compliant)
        self.assertIn("missing_helmet", eval_res.violations)
        self.assertIn("missing_vest", eval_res.violations)

    # -------------------------------------------------------------------------
    # 3. Multiple workers
    # -------------------------------------------------------------------------
    def test_03_multiple_workers(self):
        worker1_bbox = [10.0, 5.0, 80.0, 35.0]
        worker2_bbox = [10.0, 55.0, 80.0, 85.0]

        detections = [
            # Worker 1 has helmet and vest
            {"class_name": "helmet", "bbox": [10.0, 10.0, 24.0, 30.0], "confidence": 0.90},
            {"class_name": "safety-vest", "bbox": [25.0, 8.0, 60.0, 32.0], "confidence": 0.93},
            # Worker 2 has head visible but no helmet, and no vest
            {"class_name": "head", "bbox": [10.0, 60.0, 24.0, 80.0], "confidence": 0.89}
        ]

        w1_res = self.assoc_engine.evaluate_track_ppe(
            track_id="W1",
            person_bbox=worker1_bbox,
            person_confidence=0.94,
            frame_detections=detections,
            required_ppe=["helmet", "safety-vest"]
        )
        w2_res = self.assoc_engine.evaluate_track_ppe(
            track_id="W2",
            person_bbox=worker2_bbox,
            person_confidence=0.91,
            frame_detections=detections,
            required_ppe=["helmet", "safety-vest"]
        )

        self.assertEqual(w1_res.helmet.status, "PRESENT")
        self.assertEqual(w1_res.vest.status, "PRESENT")
        self.assertTrue(w1_res.is_compliant)

        self.assertEqual(w2_res.helmet.status, "MISSING")
        self.assertEqual(w2_res.vest.status, "MISSING")
        self.assertFalse(w2_res.is_compliant)

    # -------------------------------------------------------------------------
    # 4. PPE belonging to worker A must not be assigned to worker B
    # -------------------------------------------------------------------------
    def test_04_ppe_isolation_between_workers(self):
        # Worker A on far left (x: 5..30)
        worker_a = [10.0, 5.0, 80.0, 30.0]
        # Worker B on far right (x: 65..90)
        worker_b = [10.0, 65.0, 80.0, 90.0]

        # Only Worker A has helmet and vest
        detections = [
            {"class_name": "helmet", "bbox": [11.0, 10.0, 22.0, 25.0], "confidence": 0.94},
            {"class_name": "safety-vest", "bbox": [26.0, 8.0, 55.0, 28.0], "confidence": 0.91},
            {"class_name": "head", "bbox": [11.0, 70.0, 22.0, 85.0], "confidence": 0.89}
        ]

        eval_b = self.assoc_engine.evaluate_track_ppe(
            track_id="Worker_B",
            person_bbox=worker_b,
            person_confidence=0.93,
            frame_detections=detections,
            required_ppe=["helmet", "safety-vest"]
        )

        # Worker B must NOT steal Worker A's helmet or vest
        self.assertNotEqual(eval_b.helmet.status, "PRESENT", "Worker B must not inherit Worker A's helmet")
        self.assertNotEqual(eval_b.vest.status, "PRESENT", "Worker B must not inherit Worker A's vest")
        self.assertEqual(eval_b.helmet.status, "MISSING")
        self.assertEqual(eval_b.vest.status, "MISSING")

    # -------------------------------------------------------------------------
    # 5. Overlapping workers
    # -------------------------------------------------------------------------
    def test_05_overlapping_workers(self):
        # Worker 1 in front (x: 20..50)
        w1 = [10.0, 20.0, 85.0, 50.0]
        # Worker 2 slightly behind & offset (x: 35..65)
        w2 = [15.0, 35.0, 80.0, 65.0]

        # Helmet centered strictly inside W1 (x_center = 28)
        # Helmet centered strictly inside W2 (x_center = 52)
        detections = [
            {"class_name": "helmet", "bbox": [11.0, 22.0, 22.0, 34.0], "confidence": 0.90},  # W1
            {"class_name": "helmet", "bbox": [16.0, 46.0, 27.0, 58.0], "confidence": 0.88},  # W2
            {"class_name": "safety-vest", "bbox": [28.0, 22.0, 60.0, 42.0], "confidence": 0.91},  # W1
            {"class_name": "safety-vest", "bbox": [32.0, 44.0, 62.0, 62.0], "confidence": 0.87}   # W2
        ]

        w1_res = self.assoc_engine.evaluate_track_ppe(
            track_id="W1",
            person_bbox=w1,
            person_confidence=0.94,
            frame_detections=detections,
            required_ppe=["helmet", "safety-vest"]
        )
        w2_res = self.assoc_engine.evaluate_track_ppe(
            track_id="W2",
            person_bbox=w2,
            person_confidence=0.91,
            frame_detections=detections,
            required_ppe=["helmet", "safety-vest"]
        )

        self.assertEqual(w1_res.helmet.status, "PRESENT")
        self.assertEqual(w1_res.vest.status, "PRESENT")
        self.assertEqual(w2_res.helmet.status, "PRESENT")
        self.assertEqual(w2_res.vest.status, "PRESENT")

    # -------------------------------------------------------------------------
    # 6. Partial occlusion: DO NOT FORCE MISSING WHEN EVIDENCE IS INSUFFICIENT
    # -------------------------------------------------------------------------
    def test_06_partial_occlusion_reports_unknown_not_missing(self):
        # Worker partially visible behind machinery (truncated top & small visible area)
        # Top is cut off at the edge of the frame (ymin <= 2.0), or no head detected at all
        truncated_worker = [0.0, 20.0, 60.0, 45.0]
        detections = [
            # Only torso visible with safety vest, head is outside frame/occluded
            {"class_name": "safety-vest", "bbox": [10.0, 22.0, 45.0, 42.0], "confidence": 0.89}
        ]

        eval_res = self.assoc_engine.evaluate_track_ppe(
            track_id="W_OCCLUDED",
            person_bbox=truncated_worker,
            person_confidence=0.75,
            frame_detections=detections,
            required_ppe=["helmet", "safety-vest"]
        )

        # Helmet must be UNKNOWN, NOT MISSING (because head is not resolved or visible)
        self.assertEqual(
            eval_res.helmet.status,
            "UNKNOWN",
            "Occluded/unresolved head must report UNKNOWN, never forced to MISSING"
        )
        self.assertEqual(eval_res.vest.status, "PRESENT")
        # Since helmet is UNKNOWN (not MISSING), it is not a definite violation
        self.assertNotIn("missing_helmet", eval_res.violations)

    # -------------------------------------------------------------------------
    # 7. PPE outside any worker (unassigned / stray gear)
    # -------------------------------------------------------------------------
    def test_07_ppe_outside_any_worker(self):
        # Worker on left
        worker = [10.0, 10.0, 80.0, 35.0]
        # Stray helmet sitting on a workbench on far right
        stray_helmet = [50.0, 70.0, 65.0, 85.0]
        detections = [
            {"class_name": "helmet", "bbox": stray_helmet, "confidence": 0.95},
            {"class_name": "head", "bbox": [10.0, 15.0, 25.0, 30.0], "confidence": 0.90}
        ]

        eval_res = self.assoc_engine.evaluate_track_ppe(
            track_id="W1",
            person_bbox=worker,
            person_confidence=0.92,
            frame_detections=detections,
            required_ppe=["helmet"]
        )

        # Stray helmet on table must not be assigned to worker
        self.assertEqual(eval_res.helmet.status, "MISSING")
        self.assertIn("missing_helmet", eval_res.violations)

    # -------------------------------------------------------------------------
    # 8. Empty / no-person image
    # -------------------------------------------------------------------------
    def test_08_empty_no_person_image(self):
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        resp = self.detector.infer_frame_direct(blank_frame, camera_id="STATIC_TEST_EMPTY")

        self.assertTrue(resp.success)
        self.assertEqual(resp.total_persons_detected, 0)
        self.assertEqual(resp.total_violations_detected, 0)
        self.assertEqual(len(resp.tracked_workers), 0)
        self.assertEqual(len(resp.incident_candidates), 0)

    # -------------------------------------------------------------------------
    # 9. Static image must not inherit stale ByteTrack state from live camera
    # -------------------------------------------------------------------------
    def test_09_static_image_no_bytetrack_leakage(self):
        # Simulate a live camera stream with track history
        live_cam = "CAM-LIVE-TEST"
        # Prime the live camera tracker with an observation
        tracker = self.detector.get_tracker(live_cam)
        live_tracks = tracker.update([{"bbox": [10.0, 10.0, 80.0, 40.0], "score": 0.95, "pixel_box": [10, 10, 80, 40]}])
        self.assertGreater(len(live_tracks), 0, "Live camera tracker has primed track")
        initial_track_id = live_tracks[0].track_label

        # Now infer a static image with camera_id="STATIC_IMAGE"
        blank_img = np.zeros((480, 640, 3), dtype=np.uint8)
        static_resp = self.detector.infer_frame_direct(blank_img, camera_id="STATIC_IMAGE")

        # Static response has 0 tracks and did NOT touch CAM-LIVE-TEST
        self.assertEqual(static_resp.total_persons_detected, 0)
        # Verify live camera tracker still retains its own separate state
        live_tracks_after = self.detector.get_tracker(live_cam).tracked_stracks
        self.assertGreater(len(live_tracks_after), 0)
        self.assertEqual(live_tracks_after[0].track_label, initial_track_id)

    # -------------------------------------------------------------------------
    # 10. Static image must not inherit temporal state & produces 0 incidents
    # -------------------------------------------------------------------------
    def test_10_static_image_no_temporal_state_and_zero_db_incidents(self):
        # Initial DB count
        pre_count = self.db["incidents"].count_documents({})
        self.assertEqual(pre_count, 160)

        # Call /infer/image via HTTP API with a synthetic image
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        _, img_buf = cv2.imencode(".jpg", img)

        resp = requests.post(
            f"{AI_API_URL}/infer/image",
            files={"file": ("test_photo.jpg", img_buf.tobytes(), "image/jpeg")},
            data={"camera_id": "STATIC_PHOTO_AUDIT", "zone": "Audit Zone"},
            timeout=10
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        # Static inference must yield ZERO incident candidates
        self.assertEqual(len(data.get("incident_candidates", [])), 0)

        # Database incident count must remain strictly 160
        post_count = self.db["incidents"].count_documents({})
        self.assertEqual(
            post_count,
            160,
            f"Static photo inference must NEVER create live CCTV incidents! Count changed to {post_count}"
        )


if __name__ == "__main__":
    unittest.main()
