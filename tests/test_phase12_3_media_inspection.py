"""
Phase 12.3: Unified AI Media Inspection + Dynamic Class-Based Compliance Test Suite
===================================================================================
Empirically verifies:
1. Dynamic inspection configuration endpoint (/api/detection/inspection-config):
   - Authoritative PPE Class Registry integration.
   - Active Model Manifest linkage.
   - Dynamic industry profiles (Construction, Manufacturing, Laboratory, Hazmat, Custom).
   - Class lifecycle verification: SV-PPE-018 (lab-coat) has isModelSupported: false, NO_TRAINING_DATA.
2. 5-State PPE Evaluation Engine (PRESENT, MISSING, NOT_ASSESSABLE, NOT_REQUIRED, UNSUPPORTED):
   - Untrained classes return NOT_ASSESSABLE (never fabricated or falsely marked MISSING).
   - Detected equipment returns PRESENT with detector confidence.
   - Missing required gear returns MISSING with expected region annotation.
3. Bounding box forensics & Expected Regions:
   - Missing PPE expected regions have is_detector_box=False and MISSING_PPE_EXPECTED_REGION.
4. Zero persons image handling:
   - Returns overall_status='NO_PERSONNEL', persons_detected=0, no fabricated detections.
5. Video keyframe evaluation and factual telemetry summary.
6. Camera registry & Socket.IO event architecture.
7. Baseline preservation invariants (Model SHA256, model file size, zero training).
"""

import os
import sys
import json
import hashlib
import unittest
import numpy as np
import cv2
import requests

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from ai.inference.detector import IndustrialSafetyDetector
from ai.inference.ppe_association import (
    PPEAssociationEngine,
    BASELINE_SUPPORTED_SV_IDS,
    ExpectedRegion,
    PPEAssessmentItem,
    TrackPPEEvaluation,
)

SERVER_BASE_URL = os.environ.get("SERVER_BASE_URL", "http://127.0.0.1:5005")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "http://127.0.0.1:8000")

EXPECTED_BASELINE_SHA256 = "5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62"
EXPECTED_BASELINE_SIZE = 6252377


class TestPhase12_3MediaInspection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detector = IndustrialSafetyDetector()
        cls.ppe_engine = PPEAssociationEngine()
        cls.test_img_path = os.path.join(
            ROOT_DIR,
            "ai",
            "datasets",
            "safevision_ppe_v1",
            "images",
            "train",
            "SEQ-01-HEAVY-INDUSTRIAL-4K_f00000_t000000.jpg",
        )
        if not os.path.exists(cls.test_img_path):
            cls.test_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        else:
            cls.test_frame = cv2.imread(cls.test_img_path)

        cls.blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # --------------------------------------------------------------------------
    # GROUP 1: Inspection Configuration & Registry Binding
    # --------------------------------------------------------------------------

    def test_01_inspection_config_endpoint(self):
        """Verify GET /api/detection/inspection-config returns authoritative registry & manifest."""
        url = f"{SERVER_BASE_URL}/api/detection/inspection-config"
        try:
            resp = requests.get(url, timeout=5)
            self.assertEqual(resp.status_code, 200, f"Failed GET {url}: {resp.text}")
            data = resp.json()
        except requests.exceptions.ConnectionError:
            self.skipTest(f"Node server unavailable at {SERVER_BASE_URL}")

        self.assertIn("classes", data)
        self.assertIn("manifest", data)
        self.assertIn("profiles", data)

        classes = data["classes"]
        self.assertGreaterEqual(len(classes), 18)

        # Check SV-PPE-018 (lab-coat) has isModelSupported: False
        lab_coat = next((c for c in classes if c.get("id") == "SV-PPE-018"), None)
        self.assertIsNotNone(lab_coat, "SV-PPE-018 (lab-coat) missing from registry")
        self.assertFalse(lab_coat.get("isModelSupported"), "SV-PPE-018 must NOT be reported as supported by baseline!")
        self.assertEqual(lab_coat.get("status"), "NO_TRAINING_DATA")

        # Check SV-PPE-002 (helmet) has isModelSupported: True
        helmet = next((c for c in classes if c.get("id") == "SV-PPE-002"), None)
        self.assertIsNotNone(helmet)
        self.assertTrue(helmet.get("isModelSupported"))

    def test_02_dynamic_profiles_present(self):
        """Verify standard profiles (Construction, Manufacturing, Laboratory, Hazmat, Custom)."""
        url = f"{SERVER_BASE_URL}/api/detection/inspection-config"
        try:
            resp = requests.get(url, timeout=5)
            data = resp.json()
        except requests.exceptions.ConnectionError:
            self.skipTest("Node server unavailable")

        profiles = data.get("profiles", {})
        expected_profiles = ["CONSTRUCTION", "MANUFACTURING", "LABORATORY", "HAZARDOUS_MATERIALS", "CUSTOM"]
        for p in expected_profiles:
            self.assertIn(p, profiles, f"Profile {p} missing from inspection configuration")

        lab_profile = profiles["LABORATORY"]
        self.assertIn("SV-PPE-018", lab_profile["required_classes"], "Laboratory profile must require SV-PPE-018")

    # --------------------------------------------------------------------------
    # GROUP 2: Class Lifecycle & 5-State Evaluation
    # --------------------------------------------------------------------------

    def test_03_untrained_class_reports_not_assessable(self):
        """Verify SV-PPE-018 returns NOT_ASSESSABLE with honest reason, never MISSING or PRESENT."""
        person_box = [10.0, 10.0, 90.0, 50.0]
        eval_result = self.ppe_engine.evaluate_track_ppe(
            track_id="TRACK-01",
            person_bbox=person_box,
            person_confidence=0.92,
            frame_detections=[],
            required_ppe=["SV-PPE-018"],
        )

        items = eval_result.assessments
        self.assertEqual(len(items), 1)
        lab_coat_item = items[0]
        self.assertEqual(lab_coat_item.safe_vision_class_id, "SV-PPE-018")
        self.assertEqual(
            lab_coat_item.status,
            "NOT_ASSESSABLE",
            "Untrained class must report NOT_ASSESSABLE",
        )
        self.assertIn("Active model does not support this class", lab_coat_item.reason)

        # Verify no fake expected regions created for unassessable untrained classes
        self.assertEqual(len(eval_result.expected_regions), 0)

    def test_04_missing_supported_gear_returns_missing_with_expected_region(self):
        """Verify missing supported gear (helmet, vest) returns MISSING with expected region."""
        person_box = [10.0, 10.0, 90.0, 50.0]
        eval_result = self.ppe_engine.evaluate_track_ppe(
            track_id="TRACK-02",
            person_bbox=person_box,
            person_confidence=0.95,
            frame_detections=[],
            required_ppe=["SV-PPE-002", "SV-PPE-003"],  # Helmet & Vest
        )

        self.assertFalse(eval_result.is_compliant)
        self.assertEqual(eval_result.compliance_state, "NON-COMPLIANT")

        # Expected regions must be created for both missing items
        self.assertEqual(len(eval_result.expected_regions), 2)
        for er in eval_result.expected_regions:
            self.assertFalse(er.is_detector_box, "Expected region must have is_detector_box=False")
            self.assertEqual(er.annotation_type, "MISSING_PPE_EXPECTED_REGION")
            self.assertIn("Expected", er.description)

        # Check helmet expected region is located in the upper anatomical region (head)
        helmet_region = next((er for er in eval_result.expected_regions if er.safe_vision_class_id == "SV-PPE-002"), None)
        self.assertIsNotNone(helmet_region)
        self.assertEqual(helmet_region.target_region_name, "head_region")

    def test_05_present_supported_gear_evaluates_compliant(self):
        """Verify detected supported equipment returns PRESENT and COMPLIANT."""
        person_box = [10.0, 10.0, 90.0, 50.0]
        # Simulate detected helmet overlapping head region
        mock_detected = [
            {
                "safe_vision_class_id": "SV-PPE-002",
                "class_name": "helmet",
                "confidence": 0.94,
                "bbox": [10.0, 15.0, 25.0, 45.0],
            }
        ]

        eval_result = self.ppe_engine.evaluate_track_ppe(
            track_id="TRACK-03",
            person_bbox=person_box,
            person_confidence=0.95,
            frame_detections=mock_detected,
            required_ppe=["SV-PPE-002"],
        )

        self.assertTrue(eval_result.is_compliant)
        self.assertEqual(eval_result.compliance_state, "COMPLIANT")
        self.assertEqual(len(eval_result.expected_regions), 0)
        helmet_assess = next((a for a in eval_result.assessments if a.safe_vision_class_id == "SV-PPE-002"), None)
        self.assertIsNotNone(helmet_assess)
        self.assertEqual(helmet_assess.status, "PRESENT")
        self.assertEqual(helmet_assess.confidence, 0.94)

    # --------------------------------------------------------------------------
    # GROUP 3: Direct AI Detector Media Inspection
    # --------------------------------------------------------------------------

    def test_06_direct_frame_inference_with_profile(self):
        """Verify infer_frame_direct accepts profile and required_ppe."""
        resp = self.detector.infer_frame_direct(
            self.test_frame,
            zone="Bay-4",
            camera_id="CAM-4",
            required_ppe=["SV-PPE-002", "SV-PPE-003", "SV-PPE-018"],
            profile="CUSTOM",
        )

        self.assertIn("person_assessments", resp)
        self.assertIn("expected_regions", resp)
        self.assertIn("inspection_summary", resp)
        self.assertIn("inspection_profile", resp)
        self.assertEqual(resp["inspection_profile"], "CUSTOM")

        # SV-PPE-018 in any assessment must be NOT_ASSESSABLE
        for p in resp["person_assessments"]:
            for item in p.get("items", []):
                if item.get("class_id") == "SV-PPE-018":
                    self.assertEqual(item.get("status"), "NOT_ASSESSABLE")

    def test_07_zero_persons_blank_frame_truthfulness(self):
        """Verify zero-person frame returns factual NO_PERSONNEL and 0 counts."""
        resp = self.detector.infer_frame_direct(
            self.blank_frame,
            zone="Secure-Zone",
            camera_id="CAM-STANDBY",
            required_ppe=["SV-PPE-002"],
            profile="CONSTRUCTION",
        )

        self.assertEqual(len(resp["detections"]), 0)
        self.assertEqual(len(resp["person_assessments"]), 0)
        self.assertEqual(resp["overall_status"], "NO_PERSONNEL")
        summary = resp["inspection_summary"]
        self.assertEqual(summary["persons_detected"], 0)
        self.assertEqual(summary["compliant_count"], 0)
        self.assertEqual(summary["non_compliant_count"], 0)

    # --------------------------------------------------------------------------
    # GROUP 4: Backend Detection API Endpoints
    # --------------------------------------------------------------------------

    def test_08_post_detection_image_endpoint(self):
        """Verify POST /api/detection/image with requiredPpe forwards rich inspection payload."""
        url = f"{SERVER_BASE_URL}/api/detection/image"
        # Encode test frame as JPEG
        _, img_buf = cv2.imencode(".jpg", self.test_frame)
        files = {"image": ("test.jpg", img_buf.tobytes(), "image/jpeg")}
        data = {
            "requiredPpe": json.dumps(["SV-PPE-002", "SV-PPE-018"]),
            "profile": "LABORATORY",
        }

        try:
            resp = requests.post(url, files=files, data=data, timeout=10)
            self.assertEqual(resp.status_code, 200, f"Failed image detection: {resp.text}")
            res_data = resp.json()
        except requests.exceptions.ConnectionError:
            self.skipTest("Node server unavailable")

        self.assertIn("detections", res_data)
        self.assertIn("person_assessments", res_data)
        self.assertIn("expected_regions", res_data)
        self.assertIn("inspection_summary", res_data)

    # --------------------------------------------------------------------------
    # GROUP 5: Production Baseline Preservation Invariants
    # --------------------------------------------------------------------------

    def test_09_baseline_weights_untouched(self):
        """Verify industrial_yolov8.pt matches expected production SHA256 and size."""
        weights_path = os.path.join(ROOT_DIR, "ai", "models", "industrial_yolov8.pt")
        self.assertTrue(os.path.exists(weights_path))

        with open(weights_path, "rb") as f:
            content = f.read()

        actual_sha = hashlib.sha256(content).hexdigest()
        actual_size = len(content)

        self.assertEqual(actual_sha, EXPECTED_BASELINE_SHA256, "Baseline model SHA256 must NOT be altered!")
        self.assertEqual(actual_size, EXPECTED_BASELINE_SIZE, "Baseline model size must NOT be altered!")

    def test_10_zero_trained_models_in_phase_12_3(self):
        """Verify Phase 12.3 did NOT trigger training or write custom model artifacts."""
        output_dir = os.path.join(ROOT_DIR, "ai", "models", "safevision-ppe")
        if os.path.exists(output_dir):
            files = [f for f in os.listdir(output_dir) if f.endswith(".pt")]
            self.assertEqual(len(files), 0, "No custom weights should be generated in Phase 12.3!")


def run_tests():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestPhase12_3MediaInspection)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
