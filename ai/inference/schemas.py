from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class BoundingBox(BaseModel):
    ymin: float = Field(..., description="Top coordinate normalized 0-100 percentage")
    xmin: float = Field(..., description="Left coordinate normalized 0-100 percentage")
    ymax: float = Field(..., description="Bottom coordinate normalized 0-100 percentage")
    xmax: float = Field(..., description="Right coordinate normalized 0-100 percentage")
    label: Optional[str] = None
    color: Optional[str] = None

class TrackPPEStateItem(BaseModel):
    track_id: str = Field(..., description="ByteTrack temporary tracking ID (e.g. TRACK-001024)")
    employee_id: Optional[str] = Field(None, description="Registered employee ID if confirmed (e.g. EMP-1024)")
    employee_name: Optional[str] = Field(None, description="Employee name if confirmed")
    identity_status: str = Field("UNCONFIRMED", description="CONFIRMED, UNCONFIRMED, UNAVAILABLE")
    identity_confidence: float = 0.0
    helmet_status: str = Field("UNKNOWN", description="PRESENT, MISSING, UNKNOWN")
    helmet_confidence: float = 0.0
    vest_status: str = Field("UNKNOWN", description="PRESENT, MISSING, UNKNOWN")
    vest_confidence: float = 0.0
    gloves_status: str = Field("UNKNOWN", description="PRESENT, MISSING, UNKNOWN")
    gloves_confidence: float = 0.0
    shoes_status: str = Field("UNKNOWN", description="PRESENT, MISSING, UNKNOWN")
    shoes_confidence: float = 0.0
    glasses_status: str = Field("UNKNOWN", description="PRESENT, MISSING, UNKNOWN, NOT_SUPPORTED")
    glasses_confidence: float = 0.0
    mask_status: str = Field("UNKNOWN", description="PRESENT, MISSING, UNKNOWN, NOT_SUPPORTED")
    mask_confidence: float = 0.0
    overall_compliance: str = Field("UNKNOWN", description="COMPLIANT, NON-COMPLIANT, UNKNOWN")
    compliance_duration_sec: float = 0.0
    ppe_details: Dict[str, Any] = Field(default_factory=dict)
    temporal_state: str = Field("OBSERVING", description="DETECTED, OBSERVING, POSSIBLE_VIOLATION, TEMPORALLY_CONFIRMED, INCIDENT_CREATED, COOLING_DOWN")
    violations: List[str] = Field(default_factory=list)
    bounding_box: BoundingBox
    person_confidence: float = 0.0
    status: Optional[str] = Field("SAFE", description="SAFE, VIOLATION")

class DetectionItem(BaseModel):
    worker_tracking_id: str = Field(..., description="ByteTrack ID, e.g. TRACK-001024")
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    identity_status: str = "UNCONFIRMED"
    class_name: str
    confidence: float
    bounding_box: BoundingBox
    zone: Optional[str] = "Default Zone"
    camera_id: Optional[str] = "CAM-01"
    timestamp: str
    severity: str  # low, medium, high, critical
    persisted_duration_sec: float = 0.0
    violation: bool = False
    is_authoritative: bool = True
    helmet_status: Optional[str] = "UNKNOWN"
    helmet_confidence: float = 0.0
    vest_status: Optional[str] = "UNKNOWN"
    vest_confidence: float = 0.0
    gloves_status: Optional[str] = "UNKNOWN"
    gloves_confidence: float = 0.0
    shoes_status: Optional[str] = "UNKNOWN"
    shoes_confidence: float = 0.0
    glasses_status: Optional[str] = "UNKNOWN"
    glasses_confidence: float = 0.0
    mask_status: Optional[str] = "UNKNOWN"
    mask_confidence: float = 0.0
    overall_compliance: Optional[str] = "UNKNOWN"
    ppe_details: Dict[str, Any] = Field(default_factory=dict)
    safe_vision_class_id: Optional[str] = None
    model_version: Optional[str] = None
    temporal_state: Optional[str] = "OBSERVING"
    status: Optional[str] = None

class IncidentCreationCandidate(BaseModel):
    track_id: str
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    identity_status: str = "UNCONFIRMED"
    violation_type: str
    severity: str
    confidence: float
    camera_id: str
    zone: str
    timestamp: str
    bounding_box: BoundingBox
    rule_id: str
    model_id: str
    model_version: Optional[str] = "8.0.0-custom"
    safe_vision_class_id: Optional[str] = None
    why_flagged: List[str]
    temporal_config_used: Dict[str, Any]
    helmet_status: Optional[str] = None
    vest_status: Optional[str] = None
    source: Optional[str] = "AI"

class InferenceResponse(BaseModel):
    success: bool
    model_name: str
    model_id: str = "MODEL-PPE-SH17-001"
    model_status: str  # configured, unconfigured
    inference_time_ms: float
    total_persons_detected: int
    total_violations_detected: int
    detections: List[DetectionItem]
    tracked_workers: List[TrackPPEStateItem] = Field(default_factory=list)
    incident_candidates: List[IncidentCreationCandidate] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    person_assessments: List[Dict[str, Any]] = Field(default_factory=list)
    expected_regions: List[Dict[str, Any]] = Field(default_factory=list)
    inspection_summary: Optional[Dict[str, Any]] = None
    overall_status: Optional[str] = None
    inspection_profile: Optional[str] = None

    def __getitem__(self, item: str) -> Any:
        if hasattr(self, item):
            return getattr(self, item)
        raise KeyError(item)

    def __contains__(self, item: str) -> bool:
        return hasattr(self, item)

class CapabilitiesResponse(BaseModel):
    model_name: str
    model_id: str = "MODEL-PPE-SH17-001"
    model_status: str
    ppe_inference: str = "DISABLED"
    supported_classes: List[str]
    max_input_resolution: str
    target_inference_fps: int
    device: str
    temporal_verification_supported: bool
    biometric_identification_enabled: bool = False

class HealthResponse(BaseModel):
    serviceStatus: str = "AI ONLINE"
    modelStatus: str = "MODEL NOT CONFIGURED"
    runtimeState: str = "REGISTERED"
    modelName: Optional[str] = "None (Approved Model Not Configured)"
    modelVersion: Optional[str] = "1.0.0"
    modelId: Optional[str] = "MODEL-PPE-SH17-001"
    weights: Optional[str] = None
    registeredChecksum: Optional[str] = None
    actualChecksum: Optional[str] = None
    checksumMatched: bool = False
    device: str = "cpu"
    ai_device: str = "cpu"
    gpu_available: bool = False
    gpu_name: Optional[str] = None
    cuda_available: bool = False
    cuda_version: Optional[str] = None
    pytorch_version: Optional[str] = None
    python_version: Optional[str] = None
    ultralytics_version: Optional[str] = None
    latency: Optional[float] = None
    framesProcessed: int = 0
    lastInference: Optional[str] = None
    status: str = "healthy"
    service: str = "safevision-ai"
    ai_engine: str = "MODEL NOT CONFIGURED"
    model_loaded: bool = False
    model_name: Optional[str] = None
    model_version: Optional[str] = "1.0.0"
    model_status: Optional[str] = "unconfigured"
    ppe_inference: str = "DISABLED"
    weights_path: Optional[str] = None
    inference_latency_ms: Optional[float] = None
    fps: Optional[float] = None
    frames_processed: int = 0
    last_inference_time: Optional[str] = None
    biometric_identification_status: str = "NOT CONFIGURED / OFF"
    classCount: int = 17
    classes: List[str] = Field(default_factory=list)

class HardwareStatusResponse(BaseModel):
    GPU_AVAILABLE: bool
    GPU_NAME: Optional[str] = None
    CUDA_AVAILABLE: bool
    CUDA_VERSION: Optional[str] = None
    PYTORCH_VERSION: str
    PYTHON_VERSION: str
    ULTRALYTICS_VERSION: Optional[str] = None
    AI_DEVICE: str

class VideoKeyframeResult(BaseModel):
    timestamp_sec: float
    frame_index: int
    detections: List[DetectionItem]
    tracked_workers: List[TrackPPEStateItem] = Field(default_factory=list)
    snapshot_base64: Optional[str] = None
    width: Optional[int] = 1920
    height: Optional[int] = 1080
    person_assessments: List[Dict[str, Any]] = Field(default_factory=list)
    expected_regions: List[Dict[str, Any]] = Field(default_factory=list)

class VideoInferenceResponse(BaseModel):
    success: bool
    model_name: str
    model_id: str = "MODEL-PPE-SH17-001"
    video_duration_sec: float
    total_frames: int
    fps: float
    frames_analyzed: int
    processing_time_sec: float
    effective_fps: float = 0.0
    total_persons_detected: int = 0
    total_tracks: int = 0
    total_violations_detected: int = 0
    analysis_status: str = "NO_VIOLATION"
    analysis_summary: str = ""
    keyframes: List[VideoKeyframeResult] = Field(default_factory=list)
    incident_candidates: List[IncidentCreationCandidate] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    person_assessments: List[Dict[str, Any]] = Field(default_factory=list)
    expected_regions: List[Dict[str, Any]] = Field(default_factory=list)
    inspection_summary: Optional[Dict[str, Any]] = None
    overall_status: Optional[str] = None
    inspection_profile: Optional[str] = None

