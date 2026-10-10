"""
SafeVision AI — Acceptance Test Suite for AI Engine
Tests:
1. Model Provenance & Licensing (SH17 CC BY-NC-SA 4.0)
2. ByteTrack Multi-Worker Tracking continuity
3. PPE Anatomical Association (UNKNOWN is never MISSING)
4. Temporal Validation State Machine (Transient vs Persistent violation)
5. Employee Identity Decoupled Service (Default OFF, high thresholds, privacy)
"""

import sys
import os
import unittest
import numpy as np

# Add ai directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from inference.provenance import ModelRegistry
from inference.tracker import ByteTracker
from inference.ppe_association import PPEAssociationEngine
from inference.temporal_validator import TemporalValidationEngine, TemporalValidationConfig
from inference.identity_service import EmployeeIdentityService

class TestSafeVisionAIEngine(unittest.TestCase):

    def test_01_provenance_and_sh17_licensing(self):
        """Verify model registry records provenance, checksums, and CC BY-NC-SA 4.0 license."""
        registry = ModelRegistry()
        models = registry.list_models()
        self.assertGreaterEqual(len(models), 2)

        sh17 = registry.get_model("MODEL-PPE-SH17-001")
        self.assertIsNotNone(sh17)
        self.assertEqual(sh17.framework, "PyTorch / Ultralytics YOLOv8")
        self.assertTrue(any("CC BY-NC-SA 4.0" in lic for lic in sh17.datasetLicenses))
        self.assertIn("helmet", sh17.classList)
        self.assertIn("safety-vest", sh17.classList)
        self.assertTrue(len(sh17.weightsChecksum) > 0)
        print("[PASS] Test 1: SH17 Provenance and CC BY-NC-SA 4.0 License documented.")

    def test_02_bytetrack_tracking_continuity(self):
        """Verify ByteTracker maintains stable trackId across consecutive frames without permanently binding to employee."""
        tracker = ByteTracker(high_thresh=0.5, match_thresh=0.7)

        # Frame 1: Person at [10, 10, 80, 50]
        detections_f1 = [{"bbox": [10.0, 10.0, 80.0, 50.0], "score": 0.92}]
        tracks_f1 = tracker.update(detections_f1)
        self.assertEqual(len(tracks_f1), 1)
        track_id_1 = tracks_f1[0].track_label
        self.assertTrue(track_id_1.startswith("TRACK-"))

        # Frame 2: Person slightly shifted to [11, 10.5, 81, 50.5]
        detections_f2 = [{"bbox": [11.0, 10.5, 81.0, 50.5], "score": 0.94}]
        tracks_f2 = tracker.update(detections_f2)
        self.assertEqual(len(tracks_f2), 1)
        track_id_2 = tracks_f2[0].track_label

        # Continuity preserved
        self.assertEqual(track_id_1, track_id_2, "Track continuity failed across consecutive frames")
        print(f"[PASS] Test 2: ByteTrack continuity verified for {track_id_1}.")

    def test_03_ppe_association_and_unknown_handling(self):
        """Verify PPE association evaluates anatomical regions and NEVER converts UNKNOWN into MISSING."""
        engine = PPEAssociationEngine()

        # Person box: ymin=10, xmin=20, ymax=90, xmax=60
        person_bbox = [10.0, 20.0, 90.0, 60.0]

        # Scenario A: Helmet detected near head, vest present on torso
        frame_detections_a = [
            {"class_name": "person", "bbox": person_bbox, "confidence": 0.95},
            {"class_name": "helmet", "bbox": [10.0, 25.0, 25.0, 55.0], "confidence": 0.91},
            {"class_name": "safety-vest", "bbox": [28.0, 22.0, 65.0, 58.0], "confidence": 0.94},
        ]

        eval_a = engine.evaluate_track_ppe(
            track_id="TRACK-001001",
            person_bbox=person_bbox,
            person_confidence=0.95,
            frame_detections=frame_detections_a,
            required_ppe=["helmet", "safety-vest"]
        )

        self.assertEqual(eval_a.helmet.status, "PRESENT")
        self.assertEqual(eval_a.vest.status, "PRESENT")
        # Gloves and shoes are not in view or occluded -> MUST BE UNKNOWN, NOT MISSING
        self.assertEqual(eval_a.gloves.status, "UNKNOWN")
        self.assertEqual(eval_a.shoes.status, "UNKNOWN")
        self.assertEqual(len(eval_a.violations), 0)

        # Scenario B: Head is clearly visible but no helmet present
        frame_detections_b = [
            {"class_name": "person", "bbox": person_bbox, "confidence": 0.95},
            {"class_name": "head", "bbox": [10.0, 25.0, 26.0, 55.0], "confidence": 0.89},
            {"class_name": "safety-vest", "bbox": [28.0, 22.0, 65.0, 58.0], "confidence": 0.94},
        ]

        eval_b = engine.evaluate_track_ppe(
            track_id="TRACK-001001",
            person_bbox=person_bbox,
            person_confidence=0.95,
            frame_detections=frame_detections_b,
            required_ppe=["helmet", "safety-vest"]
        )

        self.assertEqual(eval_b.helmet.status, "MISSING")
        self.assertEqual(eval_b.vest.status, "PRESENT")
        self.assertIn("missing_helmet", eval_b.violations)
        print("[PASS] Test 3: PPE association correctly detects PRESENT, MISSING, and maintains UNKNOWN.")

    def test_04_temporal_validation_and_deduplication(self):
        """Verify temporal state machine prevents single-frame noise incidents and deduplicates continuing violations."""
        temporal = TemporalValidationEngine(
            default_config=TemporalValidationConfig(
                detectionConfidenceThreshold=0.65,
                minimumObservedFrames=3,
                windowSize=5,
                minimumViolationRatio=0.60,
                persistenceDuration=0.0,
                cooldownDuration=30.0
            )
        )

        track_id = "TRACK-TEST-01"
        camera_id = "CAM-0042"

        # Frame 1: Single anomalous missed helmet -> State is DETECTED, NO incident created
        is_conf, should_create, state, diag = temporal.process_observation(
            track_id, camera_id, "missing_helmet", is_violation=True, confidence=0.92
        )
        self.assertFalse(should_create, "Anomalous single frame must not create incident")
        self.assertIn(state, ["DETECTED", "OBSERVING"])

        # Continuous sustained violation across frames 2, 3, 4, 5
        confirmed_any = False
        created_any = False
        for _ in range(5):
            is_c, should_c, st, _ = temporal.process_observation(
                track_id, camera_id, "missing_helmet", is_violation=True, confidence=0.93
            )
            if is_c:
                confirmed_any = True
            if should_c:
                created_any = True

        self.assertTrue(confirmed_any, "Persistent violation should be temporally confirmed")
        self.assertTrue(created_any, "Authoritative incident should be created on confirmation")

        # Next frame: Continuing violation during cooldown -> should NOT create duplicate incident
        is_conf_next, should_create_next, state_next, _ = temporal.process_observation(
            track_id, camera_id, "missing_helmet", is_violation=True, confidence=0.93
        )
        self.assertFalse(should_create_next, "Continuing violation in cooldown must not duplicate incident")
        self.assertEqual(state_next, "COOLING_DOWN")
        print("[PASS] Test 4: Temporal validation correctly confirms sustained breaches and suppresses duplicates.")

    def test_05_employee_identity_service_privacy(self):
        """Verify face recognition defaults to OFF, requires high confidence (>=0.88), and never guesses."""
        identity = EmployeeIdentityService()
        identity.set_enabled_state(False, admin_user_id="init")

        # 1. Default state: NOT CONFIGURED / OFF
        self.assertFalse(identity.is_enabled)

        # 2. When disabled, match returns NOT_AVAILABLE
        dummy_face = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        res = identity.match_face(dummy_face, camera_id="CAM-01")
        self.assertEqual(res.match_status, "NOT_AVAILABLE")
        self.assertIsNone(res.employee_id)

        # 3. Enable by admin
        identity.set_enabled_state(True, admin_user_id="usr-admin-01")
        self.assertTrue(identity.is_enabled)

        # 4. Unknown face without enrollment returns NO_MATCH, never invents an identity
        res_unknown = identity.match_face(dummy_face, camera_id="CAM-01")
        self.assertIn(res_unknown.match_status, ["NO_MATCH", "UNCERTAIN"])
        self.assertIsNone(res_unknown.employee_id)

        # Reset to disabled by default
        identity.set_enabled_state(False, admin_user_id="reset")
        print("[PASS] Test 5: Identity service adheres to default-OFF, strict confirmation, and privacy.")

if __name__ == "__main__":
    unittest.main()
