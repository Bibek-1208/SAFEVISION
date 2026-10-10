"""
SafeVision AI - Regression Test for Temporal Validation Timestamp Bug
Verifies that current_time=0.0 is handled correctly as a valid timestamp and
does not fall back to epoch time.
"""

import unittest
import sys
import os

ai_root = os.path.dirname(os.path.abspath(__file__))
if ai_root not in sys.path:
    sys.path.insert(0, ai_root)

from inference.temporal_validator import TemporalValidationEngine, TemporalValidationConfig

class TestTemporalValidatorRegression(unittest.TestCase):
    def test_current_time_zero_regression(self):
        engine = TemporalValidationEngine()
        config = TemporalValidationConfig(
            minimumObservedFrames=10,
            windowSize=20,
            minimumViolationRatio=0.60,
            persistenceDuration=3.0,
            detectionConfidenceThreshold=0.65
        )

        # Frame 0: timestamp=0.0 must be preserved, not replaced with time.time()
        is_conf, create, state, diag = engine.process_observation(
            track_id="TRACK-001001",
            camera_id="CAM-01",
            violation_type="NO_HELMET",
            is_violation=True,
            confidence=0.92,
            config=config,
            timestamp=0.0
        )
        self.assertEqual(diag["violation_duration_sec"], 0.0)
        self.assertEqual(state, "DETECTED")
        self.assertFalse(create)

        # Simulate 100 frames at 23.98 FPS (frame 72 is ~3.002 seconds)
        created_incidents = []
        for i in range(1, 100):
            t_sec = i / 23.98
            is_conf, create, state, diag = engine.process_observation(
                track_id="TRACK-001001",
                camera_id="CAM-01",
                violation_type="NO_HELMET",
                is_violation=True,
                confidence=0.92,
                config=config,
                timestamp=t_sec
            )
            if create:
                created_incidents.append((i, round(t_sec, 2), state, diag["violation_duration_sec"]))

        # Must generate exactly 1 candidate once persistence threshold (3.0s) is reached
        self.assertEqual(len(created_incidents), 1)
        frame_idx, timestamp_sec, created_state, duration = created_incidents[0]
        self.assertEqual(frame_idx, 72)
        self.assertEqual(created_state, "INCIDENT_CREATED")
        self.assertGreaterEqual(duration, 3.0)

    def test_single_frame_dropout_rejection(self):
        engine = TemporalValidationEngine()
        config = TemporalValidationConfig(
            minimumObservedFrames=10,
            windowSize=20,
            minimumViolationRatio=0.60,
            persistenceDuration=3.0
        )
        # 1 isolated violation frame surrounded by compliance must NOT trigger an incident
        is_conf, create, state, diag = engine.process_observation(
            "TRACK-001", "CAM-01", "NO_HELMET", True, 0.90, config=config, timestamp=0.0
        )
        self.assertFalse(create)
        self.assertFalse(is_conf)

        for i in range(1, 20):
            is_conf, create, state, diag = engine.process_observation(
                "TRACK-001", "CAM-01", "NO_HELMET", False, 0.90, config=config, timestamp=i * 0.1
            )
            self.assertFalse(create)
            self.assertFalse(is_conf)

if __name__ == "__main__":
    unittest.main()
