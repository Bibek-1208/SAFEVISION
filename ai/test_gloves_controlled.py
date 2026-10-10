"""
SafeVision AI — Controlled Gloves Association Test (Step 8)
Verifies:
1. Clear bare hands -> MISSING
2. Clear gloves -> PRESENT
3. Partial occlusion / hands unobserved -> UNKNOWN
4. Hands outside frame -> UNKNOWN
Confirms UNKNOWN never becomes MISSING merely because gloves were not detected.
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inference.ppe_association import PPEAssociationEngine

class TestGlovesAssociation(unittest.TestCase):
    def setUp(self):
        self.engine = PPEAssociationEngine()

    def test_clear_gloves(self):
        """1. Clear gloves detected on worker hands -> PRESENT."""
        eval_res = self.engine.evaluate_track_ppe(
            track_id="TRACK-GLOVES-01",
            person_bbox=[10.0, 10.0, 90.0, 50.0],
            person_confidence=0.95,
            frame_detections=[
                {"class_name": "head", "bbox": [10.0, 20.0, 30.0, 40.0], "confidence": 0.90},
                {"class_name": "helmet", "bbox": [8.0, 20.0, 25.0, 40.0], "confidence": 0.92},
                {"class_name": "hands", "bbox": [55.0, 12.0, 65.0, 25.0], "confidence": 0.88},
                {"class_name": "gloves", "bbox": [54.0, 12.0, 66.0, 26.0], "confidence": 0.89}
            ],
            required_ppe=["gloves"]
        )
        self.assertEqual(eval_res.gloves.status, "PRESENT")
        self.assertNotIn("no_gloves", eval_res.violations)

    def test_clear_bare_hands(self):
        """2. Clear bare hands detected without gloves -> MISSING."""
        eval_res = self.engine.evaluate_track_ppe(
            track_id="TRACK-BARE-01",
            person_bbox=[10.0, 10.0, 90.0, 50.0],
            person_confidence=0.95,
            frame_detections=[
                {"class_name": "head", "bbox": [10.0, 20.0, 30.0, 40.0], "confidence": 0.90},
                {"class_name": "hands", "bbox": [55.0, 12.0, 65.0, 25.0], "confidence": 0.88}
                # No gloves
            ],
            required_ppe=["gloves"]
        )
        self.assertEqual(eval_res.gloves.status, "MISSING")
        self.assertIn("no_gloves", eval_res.violations)

    def test_hands_unobserved_occluded(self):
        """3. Hands unobserved/occluded (neither hands nor gloves detected) -> UNKNOWN."""
        eval_res = self.engine.evaluate_track_ppe(
            track_id="TRACK-OCCLUDED-01",
            person_bbox=[10.0, 10.0, 90.0, 50.0],
            person_confidence=0.95,
            frame_detections=[
                {"class_name": "head", "bbox": [10.0, 20.0, 30.0, 40.0], "confidence": 0.90},
                {"class_name": "helmet", "bbox": [8.0, 20.0, 25.0, 40.0], "confidence": 0.92}
                # Neither hands nor gloves detected in this frame
            ],
            required_ppe=["gloves"]
        )
        self.assertEqual(eval_res.gloves.status, "UNKNOWN", "Unobserved hands must be UNKNOWN, not MISSING")
        self.assertNotIn("no_gloves", eval_res.violations, "UNKNOWN status must NEVER generate a violation")

    def test_hands_outside_frame_boundary(self):
        """4. Hands outside frame / boundary truncated -> UNKNOWN."""
        eval_res = self.engine.evaluate_track_ppe(
            track_id="TRACK-TRUNCATED-01",
            person_bbox=[5.0, 10.0, 99.0, 95.0],  # Close to bottom/side
            person_confidence=0.85,
            frame_detections=[
                {"class_name": "head", "bbox": [5.0, 20.0, 30.0, 40.0], "confidence": 0.90}
            ],
            required_ppe=["gloves"]
        )
        self.assertEqual(eval_res.gloves.status, "UNKNOWN")
        self.assertNotIn("no_gloves", eval_res.violations)

if __name__ == "__main__":
    unittest.main()
