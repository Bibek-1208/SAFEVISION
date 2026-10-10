import time
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel, Field

class TemporalValidationConfig(BaseModel):
    detectionConfidenceThreshold: float = 0.65
    minimumObservedFrames: int = 10
    windowSize: int = 20
    minimumViolationRatio: float = 0.60
    persistenceDuration: float = 3.0  # seconds
    cooldownDuration: float = 60.0    # seconds before triggering another incident for same track & violation
    recoveryDuration: float = 5.0     # seconds of continuous compliance to reset violation state

class TrackTemporalState:
    def __init__(self, track_id: str, camera_id: str, violation_type: str):
        self.track_id = track_id
        self.camera_id = camera_id
        self.violation_type = violation_type

        # State lifecycle: DETECTED -> OBSERVING -> POSSIBLE_VIOLATION -> TEMPORALLY_CONFIRMED -> INCIDENT_CREATED -> COOLING_DOWN
        self.state = "DETECTED"
        self.frame_history: List[Tuple[float, bool, float]] = []  # (timestamp, is_violation, confidence)
        self.first_observed_time = time.time()
        self.first_violation_time: Optional[float] = None
        self.last_incident_time: Optional[float] = None
        self.last_compliant_time: Optional[float] = None
        self.last_updated_time = time.time()
        self.total_frames_observed = 0

    def update(
        self,
        is_violation: bool,
        confidence: float,
        config: TemporalValidationConfig,
        current_time: Optional[float] = None
    ) -> Tuple[bool, bool, str, Dict[str, Any]]:
        """
        Returns:
          (is_confirmed, should_create_incident, current_state, diagnostics_dict)
        """
        now = current_time if current_time is not None else time.time()
        self.last_updated_time = now
        self.total_frames_observed += 1

        # Append observation
        self.frame_history.append((now, is_violation, confidence))
        # Keep window size
        if len(self.frame_history) > config.windowSize:
            self.frame_history.pop(0)

        # Calculate metrics over active window
        window = self.frame_history
        window_count = len(window)
        violation_count = sum(1 for _, v, c in window if v and c >= config.detectionConfidenceThreshold)
        violation_ratio = float(violation_count / window_count) if window_count > 0 else 0.0

        should_create_incident = False

        if is_violation and confidence >= config.detectionConfidenceThreshold:
            if self.first_violation_time is None:
                self.first_violation_time = now
            self.last_compliant_time = None
        else:
            if self.last_compliant_time is None:
                self.last_compliant_time = now
            # If compliant continuously for recoveryDuration, reset violation counter
            if (now - self.last_compliant_time) >= config.recoveryDuration:
                self.first_violation_time = None
                if self.state in ["POSSIBLE_VIOLATION", "COOLING_DOWN"]:
                    self.state = "OBSERVING"

        violation_duration = (now - self.first_violation_time) if self.first_violation_time is not None else 0.0

        # State Machine Transitions
        if self.state == "DETECTED":
            if self.total_frames_observed >= config.minimumObservedFrames:
                self.state = "OBSERVING"

        if self.state == "OBSERVING":
            if is_violation and violation_count >= 2:
                self.state = "POSSIBLE_VIOLATION"

        if self.state == "POSSIBLE_VIOLATION":
            # Condition for temporal confirmation:
            # 1. Total observed frames >= minimumObservedFrames
            # 2. Violation ratio across window >= minimumViolationRatio
            # 3. Violation duration >= persistenceDuration
            if (
                window_count >= config.minimumObservedFrames
                and violation_ratio >= config.minimumViolationRatio
                and violation_duration >= config.persistenceDuration
            ):
                self.state = "TEMPORALLY_CONFIRMED"

        if self.state == "TEMPORALLY_CONFIRMED":
            # Check cooldown against last created incident
            in_cooldown = (
                self.last_incident_time is not None
                and (now - self.last_incident_time) < config.cooldownDuration
            )
            if not in_cooldown:
                self.state = "INCIDENT_CREATED"
                self.last_incident_time = now
                should_create_incident = True
            else:
                self.state = "COOLING_DOWN"

        elif self.state == "INCIDENT_CREATED":
            self.state = "COOLING_DOWN"

        elif self.state == "COOLING_DOWN":
            if self.last_incident_time is not None and (now - self.last_incident_time) >= config.cooldownDuration:
                # Cooldown expired; if violation still persists, allow re-arming
                if violation_ratio >= config.minimumViolationRatio:
                    self.state = "TEMPORALLY_CONFIRMED"
                else:
                    self.state = "OBSERVING"

        diagnostics = {
            "track_id": self.track_id,
            "camera_id": self.camera_id,
            "violation_type": self.violation_type,
            "state": self.state,
            "total_frames": self.total_frames_observed,
            "window_size": window_count,
            "violation_count": violation_count,
            "violation_ratio": round(violation_ratio, 3),
            "violation_duration_sec": round(violation_duration, 2),
            "in_cooldown": self.state == "COOLING_DOWN"
        }

        is_confirmed = self.state in ["TEMPORALLY_CONFIRMED", "INCIDENT_CREATED", "COOLING_DOWN"]
        return is_confirmed, should_create_incident, self.state, diagnostics

class TemporalValidationEngine:
    """
    Manages temporal validation across all active camera streams, tracks, and violation classes.
    Ensures that a single frame drop does NOT trigger an incident, and that persistent violations
    are properly confirmed and deduplicated according to configured cooldown rules.
    """
    def __init__(self, default_config: Optional[TemporalValidationConfig] = None):
        self.default_config = default_config or TemporalValidationConfig()
        # Key: (track_id, camera_id, violation_type) -> TrackTemporalState
        self.states: Dict[Tuple[str, str, str], TrackTemporalState] = {}

    def process_observation(
        self,
        track_id: str,
        camera_id: str,
        violation_type: str,
        is_violation: bool,
        confidence: float,
        config: Optional[TemporalValidationConfig] = None,
        timestamp: Optional[float] = None
    ) -> Tuple[bool, bool, str, Dict[str, Any]]:
        cfg = config or self.default_config
        key = (track_id, camera_id, violation_type)

        if key not in self.states:
            self.states[key] = TrackTemporalState(track_id, camera_id, violation_type)

        state_tracker = self.states[key]
        return state_tracker.update(is_violation, confidence, cfg, timestamp)

    def prune_inactive(self, max_idle_sec: float = 300.0):
        now = time.time()
        to_delete = [
            k for k, tracker in self.states.items()
            if (now - tracker.last_updated_time) > max_idle_sec
        ]
        for k in to_delete:
            del self.states[k]

    def clear_camera(self, camera_id: str):
        """Clears all tracking states for a specific camera (e.g. on new upload inspection)."""
        keys_to_delete = [k for k in self.states if k[1] == camera_id]
        for k in keys_to_delete:
            del self.states[k]
