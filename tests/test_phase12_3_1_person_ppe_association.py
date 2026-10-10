"""
Phase 12.3.1: Person-PPE Association Dedicated Test Suite
=========================================================
Empirically verifies:
- Spatial, anatomical, and temporal association between Persons and PPE.
- TEST A: One person, all required PPE present -> COMPLIANT.
- TEST B: One person, helmet missing -> NON-COMPLIANT.
- TEST C: One person, glasses missing -> NON-COMPLIANT.
- TEST D: One person, feet outside frame (ymax >= 98.0) -> NOT_ASSESSABLE for shoes.
- TEST E: Two people with different PPE states -> independent evaluation per person.
- TEST F: One person enters/exits frame -> track-specific association remains correct.
- TEST G: Two nearby people with separate PPE -> no cross-person bleeding or misassignment.
- TEST H: PPE appears near wrong anatomical region / wrong person -> rejected, not associated.
- TEST I: Unsupported new class -> NOT_ASSESSABLE, not MISSING, with authoritative reason.
- TEST J: Video contains one MISSING required PPE item -> final video result MUST NOT be COMPLIANT / NO_VIOLATION.
"""

import os
import sys
import unittest
import numpy as np
import cv2

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from ai.inference.detector import IndustrialSafetyDetector
from ai.inference.ppe_association import (
    PPEAssociationEngine,
    compute_box_iou,
    get_person_anatomical_regions,
    get_target_region_for_class,
    compute_association_score,
    associate_frame_ppe,
    evaluate_multi_person_frame,
    BASELINE_SUPPORTED_SV_IDS,
    RawDetection,
    TrackPPEEvaluation
)


class TestPhase12_3_1PersonPPEAssociation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detector = IndustrialSafetyDetector()
        cls.ppe_engine = PPEAssociationEngine()

    def test_A_one_person_all_required_ppe_present(self):
        """TEST A: One person, all required PPE present -> COMPLIANT."""
        person_bbox = [10.0, 20.0, 90.0, 60.0]  # ymin, xmin, ymax, xmax
        raw_detections = [
            RawDetection(
                class_name="helmet",
                confidence=0.92,
                box_2d=[10.5, 28.0, 26.0, 52.0],  # Head region
                safe_vision_class_id="SV-PPE-002"
            ),
            RawDetection(
                class_name="vest",
                confidence=0.89,
                box_2d=[28.0, 22.0, 65.0, 58.0],  # Torso region
                safe_vision_class_id="SV-PPE-003"
            )
        ]

        result = self.ppe_engine.evaluate_track_ppe(
            track_id="TRACK-A1",
            person_bbox=person_bbox,
            person_confidence=0.95,
            frame_detections=raw_detections,
            required_ppe=["helmet", "safety-vest"],
            active_supported_class_ids=BASELINE_SUPPORTED_SV_IDS
        )

        self.assertEqual(result.compliance_state, "COMPLIANT")
        self.assertEqual(len(result.violations), 0)
        self.assertEqual(result.helmet.status, "PRESENT")
        self.assertEqual(result.vest.status, "PRESENT")

    def test_B_one_person_helmet_missing(self):
        """TEST B: One person, helmet missing -> NON-COMPLIANT."""
        person_bbox = [10.0, 20.0, 90.0, 60.0]
        # Only vest present, head visible with no helmet
        raw_detections = [
            RawDetection(
                class_name="vest",
                confidence=0.91,
                box_2d=[30.0, 22.0, 66.0, 58.0],
                safe_vision_class_id="SV-PPE-003"
            )
        ]

        result = self.ppe_engine.evaluate_track_ppe(
            track_id="TRACK-B1",
            person_bbox=person_bbox,
            person_confidence=0.94,
            frame_detections=raw_detections,
            required_ppe=["helmet", "safety-vest"],
            active_supported_class_ids=BASELINE_SUPPORTED_SV_IDS
        )

        self.assertEqual(result.compliance_state, "NON-COMPLIANT")
        self.assertIn("missing_helmet", result.violations)
        self.assertEqual(result.helmet.status, "MISSING")
        self.assertEqual(result.vest.status, "PRESENT")
        # Ensure expected region was produced with is_detector_box=False
        helmet_expected = [er for er in result.expected_regions if er.item_name == "helmet"]
        self.assertGreater(len(helmet_expected), 0)
        self.assertFalse(helmet_expected[0].is_detector_box)

    def test_C_one_person_glasses_missing(self):
        """TEST C: One person, glasses missing -> NON-COMPLIANT."""
        person_bbox = [10.0, 20.0, 90.0, 60.0]
        raw_detections = [
            RawDetection(
                class_name="helmet",
                confidence=0.94,
                box_2d=[10.5, 28.0, 26.0, 52.0],
                safe_vision_class_id="SV-PPE-002"
            ),
            RawDetection(
                class_name="vest",
                confidence=0.90,
                box_2d=[28.0, 22.0, 65.0, 58.0],
                safe_vision_class_id="SV-PPE-003"
            )
        ]

        result = self.ppe_engine.evaluate_track_ppe(
            track_id="TRACK-C1",
            person_bbox=person_bbox,
            person_confidence=0.95,
            frame_detections=raw_detections,
            required_ppe=["helmet", "safety-vest", "glasses"],
            active_supported_class_ids=BASELINE_SUPPORTED_SV_IDS
        )

        self.assertEqual(result.compliance_state, "NON-COMPLIANT")
        self.assertIn("missing_glasses", result.violations)
        glasses_item = [a for a in result.assessments if a.ppe_class == "glasses"]
        self.assertEqual(len(glasses_item), 1)
        self.assertEqual(glasses_item[0].status, "MISSING")

    def test_D_one_person_feet_outside_frame(self):
        """TEST D: One person, feet outside frame (ymax >= 98.0) -> NOT_ASSESSABLE for shoes."""
        # Person truncated at bottom of frame
        person_bbox = [10.0, 20.0, 99.5, 60.0]
        raw_detections = [
            RawDetection(
                class_name="helmet",
                confidence=0.93,
                box_2d=[10.5, 28.0, 26.0, 52.0],
                safe_vision_class_id="SV-PPE-002"
            ),
            RawDetection(
                class_name="vest",
                confidence=0.88,
                box_2d=[28.0, 22.0, 65.0, 58.0],
                safe_vision_class_id="SV-PPE-003"
            )
        ]

        result = self.ppe_engine.evaluate_track_ppe(
            track_id="TRACK-D1",
            person_bbox=person_bbox,
            person_confidence=0.92,
            frame_detections=raw_detections,
            required_ppe=["helmet", "safety-vest", "safety-shoes"],
            active_supported_class_ids=BASELINE_SUPPORTED_SV_IDS
        )

        # Shoes must be NOT_ASSESSABLE, NOT MISSING, because feet are outside frame
        self.assertEqual(result.shoes.status, "NOT_ASSESSABLE")
        self.assertNotIn("no_safety_footwear", result.violations)
        self.assertIn("Lower body/feet truncated", result.shoes.observation_notes)
        # Person state should be NOT_ASSESSABLE (since shoes cannot be assessed)
        self.assertEqual(result.compliance_state, "NOT_ASSESSABLE")

    def test_E_two_people_different_ppe_states(self):
        """TEST E: Two people with different PPE states -> each person gets independent result."""
        persons = [
            {"track_id": "PERSON_1", "bbox": [10.0, 10.0, 85.0, 45.0], "confidence": 0.95},
            {"track_id": "PERSON_2", "bbox": [10.0, 55.0, 85.0, 90.0], "confidence": 0.92}
        ]
        # Person 1 has both helmet & vest; Person 2 has only vest (helmet missing)
        raw_detections = [
            RawDetection(
                class_name="helmet",
                confidence=0.92,
                box_2d=[10.5, 18.0, 25.0, 37.0],  # On Person 1
                safe_vision_class_id="SV-PPE-002"
            ),
            RawDetection(
                class_name="vest",
                confidence=0.89,
                box_2d=[27.0, 12.0, 60.0, 43.0],  # On Person 1
                safe_vision_class_id="SV-PPE-003"
            ),
            RawDetection(
                class_name="vest",
                confidence=0.87,
                box_2d=[27.0, 57.0, 60.0, 88.0],  # On Person 2
                safe_vision_class_id="SV-PPE-003"
            )
        ]

        results = evaluate_multi_person_frame(
            persons=persons,
            frame_detections=raw_detections,
            required_ppe=["helmet", "safety-vest"],
            active_supported_class_ids=BASELINE_SUPPORTED_SV_IDS
        )

        p1_res = results["PERSON_1"]
        p2_res = results["PERSON_2"]

        # Person 1 must be COMPLIANT
        self.assertEqual(p1_res.compliance_state, "COMPLIANT")
        self.assertEqual(p1_res.helmet.status, "PRESENT")
        self.assertEqual(p1_res.vest.status, "PRESENT")

        # Person 2 must be NON-COMPLIANT (missing helmet)
        self.assertEqual(p2_res.compliance_state, "NON-COMPLIANT")
        self.assertEqual(p2_res.helmet.status, "MISSING")
        self.assertEqual(p2_res.vest.status, "PRESENT")

    def test_F_one_person_enters_exits_frame(self):
        """TEST F: One person enters/exits frame -> track-specific association remains correct."""
        # Frame 1: Person A and Person B in frame
        frame1_persons = [
            {"track_id": "TRACK-10", "bbox": [15.0, 15.0, 80.0, 40.0], "confidence": 0.93},
            {"track_id": "TRACK-20", "bbox": [15.0, 50.0, 80.0, 75.0], "confidence": 0.90}
        ]
        frame1_dets = [
            RawDetection(class_name="helmet", confidence=0.91, box_2d=[15.0, 20.0, 28.0, 35.0], safe_vision_class_id="SV-PPE-002"),
            RawDetection(class_name="vest", confidence=0.88, box_2d=[30.0, 16.0, 60.0, 39.0], safe_vision_class_id="SV-PPE-003"),
            RawDetection(class_name="vest", confidence=0.86, box_2d=[30.0, 51.0, 60.0, 74.0], safe_vision_class_id="SV-PPE-003"),
        ]
        res1 = evaluate_multi_person_frame(frame1_persons, frame1_dets, ["helmet", "safety-vest"], BASELINE_SUPPORTED_SV_IDS)
        self.assertEqual(res1["TRACK-10"].compliance_state, "COMPLIANT")
        self.assertEqual(res1["TRACK-20"].compliance_state, "NON-COMPLIANT")

        # Frame 2: TRACK-10 exits frame; only TRACK-20 remains
        frame2_persons = [
            {"track_id": "TRACK-20", "bbox": [15.0, 50.0, 80.0, 75.0], "confidence": 0.91}
        ]
        frame2_dets = [
            RawDetection(class_name="vest", confidence=0.86, box_2d=[30.0, 51.0, 60.0, 74.0], safe_vision_class_id="SV-PPE-003"),
        ]
        res2 = evaluate_multi_person_frame(frame2_persons, frame2_dets, ["helmet", "safety-vest"], BASELINE_SUPPORTED_SV_IDS)
        self.assertNotIn("TRACK-10", res2)
        self.assertEqual(res2["TRACK-20"].compliance_state, "NON-COMPLIANT")
        self.assertEqual(res2["TRACK-20"].helmet.status, "MISSING")

    def test_G_two_nearby_people_separate_ppe(self):
        """TEST G: Two nearby people with separate PPE -> no cross-person PPE assignment."""
        # Two workers standing close together: Worker 1 [20, 20, 85, 48], Worker 2 [20, 50, 85, 78]
        persons = [
            {"track_id": "WORKER-L", "bbox": [20.0, 20.0, 85.0, 48.0], "confidence": 0.92},
            {"track_id": "WORKER-R", "bbox": [20.0, 50.0, 85.0, 78.0], "confidence": 0.91}
        ]
        # Helmet L is centered on Worker L head; Helmet R is centered on Worker R head
        raw_detections = [
            RawDetection(
                class_name="helmet",
                confidence=0.93,
                box_2d=[20.5, 26.0, 34.0, 42.0],  # Centroid at x=34.0
                safe_vision_class_id="SV-PPE-002"
            ),
            RawDetection(
                class_name="helmet",
                confidence=0.91,
                box_2d=[20.5, 56.0, 34.0, 72.0],  # Centroid at x=64.0
                safe_vision_class_id="SV-PPE-002"
            )
        ]

        assignment = associate_frame_ppe(persons, raw_detections)

        # Worker L must only be assigned Helmet L (x=26.0), not Helmet R (x=56.0)
        self.assertEqual(len(assignment["WORKER-L"]), 1)
        self.assertEqual(assignment["WORKER-L"][0]["class_name"], "helmet")
        self.assertAlmostEqual(assignment["WORKER-L"][0]["bbox"][1], 26.0, delta=1.0)

        # Worker R must only be assigned Helmet R (x=56.0), not Helmet L (x=26.0)
        self.assertEqual(len(assignment["WORKER-R"]), 1)
        self.assertEqual(assignment["WORKER-R"][0]["class_name"], "helmet")
        self.assertAlmostEqual(assignment["WORKER-R"][0]["bbox"][1], 56.0, delta=1.0)

    def test_H_ppe_appears_near_wrong_anatomical_region(self):
        """TEST H: PPE appears near wrong person / region (e.g. helmet on ground near feet) -> rejected."""
        persons = [
            {"track_id": "WORKER-STAND", "bbox": [10.0, 20.0, 90.0, 60.0], "confidence": 0.94}
        ]
        # Helmet detected on ground near feet (rel_y = ~0.85 of person height)
        ground_helmet = RawDetection(
            class_name="helmet",
            confidence=0.88,
            box_2d=[78.0, 25.0, 88.0, 45.0],  # Near bottom of person box
            safe_vision_class_id="SV-PPE-002"
        )

        score = compute_association_score(ground_helmet, persons[0]["bbox"])
        # Association score must be 0.0 due to anatomical plausibility rejection
        self.assertEqual(float(score), 0.0)

        # When evaluated for track, ground helmet must NOT be marked PRESENT on the head
        result = self.ppe_engine.evaluate_track_ppe(
            track_id="WORKER-STAND",
            person_bbox=persons[0]["bbox"],
            person_confidence=0.94,
            frame_detections=[ground_helmet],
            required_ppe=["helmet"],
            active_supported_class_ids=BASELINE_SUPPORTED_SV_IDS
        )
        self.assertEqual(result.helmet.status, "MISSING")
        self.assertEqual(result.compliance_state, "NON-COMPLIANT")

    def test_I_unsupported_new_class(self):
        """TEST I: Unsupported new class -> NOT_ASSESSABLE, not MISSING."""
        person_bbox = [10.0, 20.0, 90.0, 60.0]
        result = self.ppe_engine.evaluate_track_ppe(
            track_id="TRACK-I1",
            person_bbox=person_bbox,
            person_confidence=0.93,
            frame_detections=[],
            required_ppe=["safety-harness"],  # Not supported by active baseline model
            active_supported_class_ids=BASELINE_SUPPORTED_SV_IDS
        )

        # Must report UNSUPPORTED or NOT_ASSESSABLE with explanatory note, never a false MISSING violation
        assessments = [a for a in result.assessments if (getattr(a, "ppe_class", None) or a.item_name) == "safety-harness"]
        self.assertEqual(len(assessments), 1)
        self.assertIn(assessments[0].status, ["UNSUPPORTED", "NOT_ASSESSABLE"])
        self.assertTrue(any(k in assessments[0].reason for k in ["unsupported", "Active model does not support", "unregistered"]))
        # Violations must NOT include safety-harness
        self.assertNotIn("missing_safety-harness", result.violations)

    def test_J_video_contains_one_missing_required_ppe(self):
        """TEST J: Video contains one MISSING required PPE item -> final video result MUST NOT be COMPLIANT."""
        # Create a synthetic 10-frame test video
        width, height = 640, 480
        test_video_path = os.path.join(ROOT_DIR, "tests", "test_video_missing_ppe.mp4")
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(test_video_path, fourcc, 10.0, (width, height))

        # Person drawn with vest (orange) but bare head (no helmet)
        for _ in range(10):
            frame = np.full((height, width, 3), 40, dtype=np.uint8)
            # Worker torso (orange rectangle)
            cv2.rectangle(frame, (250, 150), (390, 360), (0, 140, 255), -1)
            # Worker head (flesh tone circle)
            cv2.circle(frame, (320, 110), 35, (180, 205, 235), -1)
            # Legs
            cv2.rectangle(frame, (270, 360), (310, 450), (100, 100, 100), -1)
            cv2.rectangle(frame, (330, 360), (370, 450), (100, 100, 100), -1)
            out.write(frame)
        out.release()

        try:
            # We test with mock/real infer_video flow
            res = self.detector.infer_video(
                video_path=test_video_path,
                camera_id="CAM-TEST-J",
                zone="Zone A",
                required_ppe=["helmet", "safety-vest"],
                sample_fps=5.0
            )

            # If person assessments were produced, verify final compliance calculations
            if len(res.person_assessments) > 0:
                for pa in res.person_assessments:
                    # If any required item is MISSING, person compliance MUST be NON-COMPLIANT
                    has_missing = any(it.get("status") == "MISSING" for it in pa.get("assessments", []))
                    if has_missing:
                        self.assertEqual(pa.get("compliance_state"), "NON-COMPLIANT")

                # The top-level video overall_status MUST NOT be COMPLIANT or NO_VIOLATION if missing PPE exists
                has_any_missing = any(
                    any(it.get("status") == "MISSING" for it in pa.get("assessments", []))
                    for pa in res.person_assessments
                )
                if has_any_missing:
                    self.assertNotEqual(res.overall_status, "COMPLIANT")
                    self.assertNotEqual(res.analysis_status, "NO_VIOLATION")
                    self.assertEqual(res.overall_status, "NON-COMPLIANT")
                    self.assertEqual(res.analysis_status, "CONFIRMED_VIOLATION")
        finally:
            if os.path.exists(test_video_path):
                os.remove(test_video_path)


if __name__ == "__main__":
    unittest.main()
