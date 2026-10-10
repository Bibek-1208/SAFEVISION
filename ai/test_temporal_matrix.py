"""
SafeVision AI — Controlled Temporal Validation Matrix
Tests the exact 6 temporal validation scenarios mandated by Phase 2:
A. Sustained violation
B. Brief violation
C. PPE temporarily disappears because of occlusion (UNKNOWN)
D. PPE restored after violation
E. Duplicate frames after incident
F. Cooldown behavior
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inference.temporal_validator import TemporalValidationEngine, TemporalValidationConfig

class TestTemporalValidationMatrix(unittest.TestCase):
    def setUp(self):
        self.config = TemporalValidationConfig(
            detectionConfidenceThreshold=0.65,
            minimumObservedFrames=10,
            windowSize=20,
            minimumViolationRatio=0.60,
            persistenceDuration=3.0,
            cooldownDuration=60.0,
            recoveryDuration=5.0
        )
        self.engine = TemporalValidationEngine(self.config)

    def test_A_sustained_violation(self):
        """A. Sustained violation: confirms violation and creates an incident after >= 3.0s."""
        track_id = "TRACK-SUSTAINED"
        incident_created = False
        incident_frame = None

        # 35 frames spaced at 0.1s = 3.5s total duration
        for f in range(36):
            t = f * 0.1
            is_conf, should_create, state, diag = self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_helmet",
                is_violation=True,
                confidence=0.92,
                timestamp=t
            )
            if should_create:
                incident_created = True
                incident_frame = f

        self.assertTrue(incident_created, "Sustained violation must trigger an incident candidate")
        self.assertGreaterEqual(incident_frame, 30, "Incident must only trigger after >= 3.0 seconds")
        self.assertIn(state, ["INCIDENT_CREATED", "COOLING_DOWN"])

    def test_B_brief_violation(self):
        """B. Brief violation: 5 frames (0.5s) of violation does NOT trigger an incident."""
        track_id = "TRACK-BRIEF"
        incident_created = False

        # 5 frames of violation
        for f in range(5):
            t = f * 0.1
            _, should_create, _, _ = self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_helmet",
                is_violation=True,
                confidence=0.92,
                timestamp=t
            )
            if should_create: incident_created = True

        # Followed by 15 frames of compliance
        for f in range(5, 20):
            t = f * 0.1
            is_conf, should_create, state, _ = self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_helmet",
                is_violation=False,
                confidence=0.92,
                timestamp=t
            )
            if should_create: incident_created = True

        self.assertFalse(incident_created, "Brief 0.5s violation must NOT create an incident")
        self.assertFalse(is_conf, "Brief violation must not be confirmed")

    def test_C_occlusion_unknown_state(self):
        """C. Occlusion / UNKNOWN state: UNKNOWN must NOT become MISSING or trigger violation."""
        track_id = "TRACK-OCCLUDED"
        incident_created = False

        # 25 frames where body region is occluded (is_violation = False because UNKNOWN != MISSING)
        for f in range(25):
            t = f * 0.1
            is_conf, should_create, state, diag = self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_vest",
                is_violation=False,  # UNKNOWN evaluated as non-violation
                confidence=0.0,
                timestamp=t
            )
            if should_create: incident_created = True

        self.assertFalse(incident_created, "Occlusion/UNKNOWN must NOT create an incident")
        self.assertFalse(is_conf, "Occlusion/UNKNOWN must NOT confirm a violation")

    def test_D_recovery_restoration(self):
        """D. PPE restored after violation: 5.0s continuous compliance resets violation state."""
        track_id = "TRACK-RECOVERY"

        # 1. Trigger violation (35 frames @ 0.1s = 3.5s)
        for f in range(35):
            t = f * 0.1
            self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_helmet",
                is_violation=True,
                confidence=0.92,
                timestamp=t
            )

        # 2. Worker puts on helmet (compliance for 6.0s > recoveryDuration 5.0s)
        for f in range(35, 95):
            t = f * 0.1
            is_conf, should_create, state, diag = self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_helmet",
                is_violation=False,
                confidence=0.95,
                timestamp=t
            )
            self.assertFalse(should_create, "Compliant frames must never trigger incidents")

        # Check internal state tracker has reset
        state_obj = self.engine.states[(track_id, "CAM-01", "missing_helmet")]
        self.assertIsNone(state_obj.first_violation_time, "first_violation_time must be reset to None after recovery")
        self.assertEqual(state_obj.state, "OBSERVING", "State must reset to OBSERVING after full recovery")

    def test_E_duplicate_frames_after_incident(self):
        """E. Duplicate frames after incident: subsequent frames do NOT fire repeat incidents."""
        track_id = "TRACK-DUP-FRAMES"
        incidents_created_count = 0

        # 45 consecutive violating frames across 4.5 seconds
        for f in range(45):
            t = f * 0.1
            _, should_create, state, _ = self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_helmet",
                is_violation=True,
                confidence=0.90,
                timestamp=t
            )
            if should_create:
                incidents_created_count += 1

        self.assertEqual(incidents_created_count, 1, "Exactly ONE incident candidate must be emitted, not one per frame")

    def test_F_cooldown_behavior(self):
        """F. Cooldown behavior: suppresses repeats during cooldown (60s), re-arms after expiry."""
        track_id = "TRACK-COOLDOWN"

        # Frame 0 to 35: triggers initial incident at t=3.0s
        for f in range(36):
            t = f * 0.1
            self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_helmet",
                is_violation=True,
                confidence=0.90,
                timestamp=t
            )

        # Mid-cooldown at t=30.0s (cooldown is 60s)
        _, should_create_mid, state_mid, diag_mid = self.engine.process_observation(
            track_id=track_id,
            camera_id="CAM-01",
            violation_type="missing_helmet",
            is_violation=True,
            confidence=0.90,
            timestamp=30.0
        )
        self.assertFalse(should_create_mid, "Must NOT create incident during active cooldown")
        self.assertEqual(state_mid, "COOLING_DOWN", "State must be COOLING_DOWN")
        self.assertTrue(diag_mid["in_cooldown"], "in_cooldown flag must be True")

        # Expiry at t=65.0s (>60.0s since incident at t=3.0s)
        # Advance window to re-establish window ratio
        for f in range(20):
            t = 64.0 + (f * 0.1)
            is_conf, should_create_after, state_after, diag_after = self.engine.process_observation(
                track_id=track_id,
                camera_id="CAM-01",
                violation_type="missing_helmet",
                is_violation=True,
                confidence=0.90,
                timestamp=t
            )
            if should_create_after:
                break

        self.assertTrue(should_create_after, "Must re-arm and create incident after cooldown expires if violation persists")

if __name__ == "__main__":
    unittest.main()
