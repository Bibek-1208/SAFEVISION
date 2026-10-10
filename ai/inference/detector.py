import os
import time
import datetime
import numpy as np
import cv2
from typing import List, Tuple, Dict, Any, Optional
import base64

from .schemas import (
    BoundingBox,
    DetectionItem,
    InferenceResponse,
    TrackPPEStateItem,
    IncidentCreationCandidate,
    VideoKeyframeResult,
    VideoInferenceResponse
)
from .tracker import ByteTracker
from .ppe_association import PPEAssociationEngine
from .temporal_validator import TemporalValidationEngine, TemporalValidationConfig
from .identity_service import EmployeeIdentityService
from .provenance import ModelRegistry, SH17_CLASSES
from .ppe_registry import PPEClassRegistry, ModelClassManifest

class CustomDetectorModule:
    """
    Incremental Custom PPE Class Detector Module.
    Encapsulates fine-tuned/trained weights for incremental custom PPE classes (e.g. SV-PPE-018 lab-coat).
    Enforces inference isolation: execution errors in custom modules never affect the baseline detector.
    Enforces hardware and VRAM awareness for resource-constrained GPUs (e.g., RTX 2050 4GB).
    """
    def __init__(
        self,
        module_id: str,
        model_path: str,
        safe_vision_class_id: str,
        class_name: str,
        confidence_threshold: float = 0.40,
        device: str = "cpu",
        class_manifest: Optional[List[Dict[str, Any]]] = None
    ):
        self.module_id = module_id
        self.model_path = model_path
        self.safe_vision_class_id = safe_vision_class_id
        self.class_name = class_name
        self.confidence_threshold = confidence_threshold
        self.device = device
        self.status = "INITIALIZING"  # "ACTIVE", "ERROR", "DISABLED", "FILE_MISSING"
        self.error_message: Optional[str] = None
        self.model = None
        self.class_manifest = class_manifest or []
        self.inference_count = 0
        self.last_latency_ms = 0.0
        self.checksum: Optional[str] = None
        self._load()

    def _load(self):
        try:
            if not self.model_path or not os.path.exists(self.model_path):
                self.status = "FILE_MISSING"
                self.error_message = f"Model artifact not found at {self.model_path}"
                return

            # Section 7 & 14 Model Path Security: Prohibit pointing to baseline file
            resolved_p = os.path.abspath(self.model_path)
            baseline_p = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models", "industrial_yolov8.pt"))
            if resolved_p == baseline_p:
                self.status = "ERROR"
                self.error_message = "Security error: Custom module modelPath cannot point to protected baseline model."
                return

            import hashlib
            sha256 = hashlib.sha256()
            with open(self.model_path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    sha256.update(chunk)
            self.checksum = f"sha256:{sha256.hexdigest()}"

            from ultralytics import YOLO
            # Hardware awareness: load on assigned device, fallback to CPU on CUDA OOM
            try:
                self.model = YOLO(self.model_path)
                dummy = np.zeros((640, 640, 3), dtype=np.uint8)
                self.model.predict(dummy, conf=0.25, verbose=False, device=self.device)
                self.status = "ACTIVE"
            except Exception as cuda_err:
                err_str = str(cuda_err).lower()
                if "cuda" in err_str or "out of memory" in err_str:
                    print(f"[SafeVision AI] Hardware pressure on {self.module_id}. Falling back to CPU.")
                    self.device = "cpu"
                    self.model = YOLO(self.model_path)
                    dummy = np.zeros((640, 640, 3), dtype=np.uint8)
                    self.model.predict(dummy, conf=0.25, verbose=False, device="cpu")
                    self.status = "ACTIVE"
                else:
                    raise cuda_err
        except Exception as e:
            self.status = "ERROR"
            self.error_message = str(e)
            self.model = None
            print(f"[SafeVision AI] Custom module '{self.module_id}' initialization error: {e}")

    def predict(self, img: np.ndarray, conf_override: Optional[float] = None, imgsz: Optional[int] = None) -> List[Dict[str, Any]]:
        if self.status != "ACTIVE" or self.model is None:
            return []
        h, w = img.shape[:2]
        conf = conf_override if conf_override is not None else self.confidence_threshold
        target_imgsz = imgsz if imgsz is not None else (1280 if max(h, w) >= 1280 else 640)
        results = self.model.predict(img, conf=conf, verbose=False, device=self.device, imgsz=target_imgsz)
        boxes = results[0].boxes
        detections = []

        for box in boxes:
            xyxy = box.xyxy[0].cpu().numpy()
            confidence = float(box.conf[0].cpu().numpy())
            cls_id = int(box.cls[0].cpu().numpy())

            sv_id = self.safe_vision_class_id
            name = self.class_name
            if self.class_manifest and cls_id < len(self.class_manifest):
                entry = self.class_manifest[cls_id]
                sv_id = entry.get("safeVisionClassId", sv_id)
                name = entry.get("className", name)

            ymin = float((xyxy[1] / h) * 100)
            xmin = float((xyxy[0] / w) * 100)
            ymax = float((xyxy[3] / h) * 100)
            xmax = float((xyxy[2] / w) * 100)
            bbox_pct = [
                round(max(0.0, min(100.0, ymin)), 2),
                round(max(0.0, min(100.0, xmin)), 2),
                round(max(0.0, min(100.0, ymax)), 2),
                round(max(0.0, min(100.0, xmax)), 2)
            ]

            detections.append({
                "class_name": name,
                "safe_vision_class_id": sv_id,
                "bbox": bbox_pct,
                "confidence": confidence,
                "pixel_box": [int(xyxy[1]), int(xyxy[0]), int(xyxy[3]), int(xyxy[2])],
                "source_module": self.module_id
            })

        return detections


class IndustrialSafetyDetector:
    def __init__(self, models_dir: str = "ai/models"):
        self.models_dir = models_dir

        # Configuration variables
        self.ppe_model_path_cfg = os.getenv("PPE_MODEL_PATH", os.path.join(models_dir, "industrial_yolov8.pt"))
        self.ppe_confidence = float(os.getenv("PPE_CONFIDENCE", "0.35"))
        self.person_model_path_cfg = os.getenv("PERSON_MODEL_PATH", "yolov8n.pt")

        self.model_path = self._resolve_path(self.ppe_model_path_cfg, fallback="industrial_yolov8.pt")
        self.person_model_path = self._resolve_path(self.person_model_path_cfg, fallback="yolov8n.pt")

        self.model = None          # Primary YOLO model
        self.ppe_model = None      # Primary PPE model
        self.person_model = None   # Person detector model

        self.model_status = "unconfigured"
        self.runtime_state = "REGISTERED"
        self.model_id = "MODEL-PPE-YOLOV8-SH17"
        self.model_name = "YOLOv8-Industrial-SH17"
        self.pipeline_name = "SafeVision Industrial PPE Neural Pipeline"
        self.model_version = "1.0.0"
        self.frames_processed = 0
        self.last_inference_time = None
        self.last_latency_ms = 0.0

        # Hardware & CUDA detection
        self.device = "cpu"
        self.gpu_name = None
        self.cuda_available = False
        self.cuda_version = None
        self._detect_hardware()

        # Checksum Tracking
        self.actual_checksum = None
        self.registered_checksum = None
        self.checksum_matched = True

        # Subsystems
        self.tracker = ByteTracker(high_thresh=0.45, low_thresh=0.15, match_thresh=0.7)
        self.camera_trackers: Dict[str, ByteTracker] = {}
        self.ppe_engine = PPEAssociationEngine(visibility_threshold=0.40)
        self.temporal_engine = TemporalValidationEngine(TemporalValidationConfig())
        self.identity_service = EmployeeIdentityService()
        self.model_registry = ModelRegistry()
        self.ppe_registry = PPEClassRegistry()

        manifest_file_name = "baseline_class_manifest.json" if "industrial_yolov8" in self.model_path else "ppe_class_manifest.json"
        manifest_path = os.path.join(models_dir, manifest_file_name)
        if not os.path.exists(manifest_path):
            manifest_path = self._resolve_path(f"ai/models/{manifest_file_name}")
        if os.path.exists(manifest_path):
            from pathlib import Path
            self.class_manifest = ModelClassManifest(manifest_file=Path(manifest_path))
        else:
            self.class_manifest = ModelClassManifest()

        self.custom_modules: Dict[str, CustomDetectorModule] = {}
        self.cross_module_iou_threshold: float = 0.65

        self.load_model()

    def _resolve_path(self, path_str: str, fallback: Optional[str] = None) -> str:
        if os.path.exists(path_str):
            return os.path.abspath(path_str)
        # Check relative to ai/
        ai_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        p_ai = os.path.join(ai_dir, path_str)
        if os.path.exists(p_ai):
            return p_ai
        if path_str.startswith("ai/") or path_str.startswith("ai\\"):
            p_sub = os.path.join(ai_dir, path_str[3:])
            if os.path.exists(p_sub):
                return p_sub
        # Check relative to project root
        root_dir = os.path.dirname(ai_dir)
        p_root = os.path.join(root_dir, path_str)
        if os.path.exists(p_root):
            return p_root
        if fallback:
            p_fb = os.path.join(root_dir, fallback)
            if os.path.exists(p_fb):
                return p_fb
            p_fb_ai = os.path.join(ai_dir, "models", fallback)
            if os.path.exists(p_fb_ai):
                return p_fb_ai
            p_fb_ind = os.path.join(ai_dir, "models", "industrial_yolov8.pt")
            if os.path.exists(p_fb_ind):
                return p_fb_ind
        return os.path.abspath(path_str)

    def get_tracker(self, camera_id: str) -> ByteTracker:
        """Returns isolated ByteTracker instance for the given camera."""
        if camera_id not in self.camera_trackers:
            cam_num = 1
            try:
                digits = "".join(filter(str.isdigit, camera_id))
                if digits:
                    cam_num = int(digits)
            except Exception:
                cam_num = len(self.camera_trackers) + 1
            offset = cam_num * 1000
            self.camera_trackers[camera_id] = ByteTracker(
                high_thresh=0.45,
                low_thresh=0.15,
                match_thresh=0.7,
                track_id_offset=offset
            )
        return self.camera_trackers[camera_id]

    def reset_camera_state(self, camera_id: str):
        """Resets tracking and temporal state for a camera upon disconnect/reconnect."""
        if camera_id in self.camera_trackers:
            del self.camera_trackers[camera_id]
        to_delete = [k for k in list(self.temporal_engine.states.keys()) if k[1] == camera_id]
        for k in to_delete:
            del self.temporal_engine.states[k]

    def _detect_hardware(self):
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda:0"
                self.gpu_name = torch.cuda.get_device_name(0)
                self.cuda_available = True
                self.cuda_version = torch.version.cuda
                print(f"[SafeVision AI] Hardware: NVIDIA GPU detected: {self.gpu_name} (CUDA {self.cuda_version})")
            else:
                self.device = "cpu"
                print("[SafeVision AI] Hardware: Running on CPU (CUDA not available)")
        except Exception as e:
            self.device = "cpu"
            print(f"[SafeVision AI] Hardware detection fallback to CPU: {e}")

    def load_model(self):
        """
        Loads SafeVision baseline model or custom YOLO model.
        Ensures device awareness (CUDA RTX 2050 if available, CPU fallback).
        """
        resolved_ppe = self._resolve_path(self.ppe_model_path_cfg, fallback="industrial_yolov8.pt")
        if not os.path.exists(resolved_ppe):
            self.model = None
            self.runtime_state = "FILE_MISSING"
            self.model_status = "unconfigured"
            self.pipeline_name = f"MODEL NOT CONFIGURED: {resolved_ppe} not found"
            print(f"[SafeVision AI] AI STATUS: FILE_MISSING. Weights not found at {resolved_ppe}")
            return

        self.model_path = resolved_ppe
        import hashlib
        sha256 = hashlib.sha256()
        with open(resolved_ppe, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        self.actual_checksum = f"sha256:{sha256.hexdigest()}"
        self.registered_checksum = self.actual_checksum
        self.checksum_matched = True

        from ultralytics import YOLO
        try:
            # 1. Load Primary Model
            self.model = YOLO(resolved_ppe)
            self.ppe_model = self.model

            is_sh17 = (hasattr(self.model, "names") and len(self.model.names) == 17)
            if is_sh17:
                self.model_id = "MODEL-PPE-YOLOV8-SH17"
                self.model_name = "YOLOv8-Industrial-SH17"
                self.pipeline_name = f"SafeVision Industrial PPE Neural Inference ({self.device})"
                self.model_version = "1.0.0"
                self.person_model = self.model
                self.person_model_path = resolved_ppe
            else:
                self.model_id = "MODEL-PPE-YOLOV8N-CUSTOM"
                self.model_name = "Custom-YOLOv8n-PPE"
                self.pipeline_name = f"Custom YOLOv8n PPE Neural Inference ({self.device})"
                self.model_version = "8.0.0"
                resolved_person = self._resolve_path(self.person_model_path_cfg, fallback="yolov8n.pt")
                if not os.path.exists(resolved_person):
                    resolved_person = os.path.join(self.models_dir, "industrial_yolov8.pt")
                self.person_model = YOLO(resolved_person)
                self.person_model_path = resolved_person

            # 2. Warmup inference on target hardware
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            self.model.predict(dummy, conf=0.25, verbose=False, device=self.device)
            if self.person_model is not None and self.person_model is not self.model:
                self.person_model.predict(dummy, conf=0.25, verbose=False, device=self.device)

            self.runtime_state = "READY"
            self.model_status = "configured"

            print("==================================================")
            print("SafeVision Model Loaded:")
            print(resolved_ppe)
            print("")
            print(f"Classes ({len(self.model.names)}):")
            for cid in sorted(self.model.names.keys()):
                print(f"{cid} {self.model.names[cid]}")
            print("")
            dev_label = "CUDA" if self.cuda_available else "CPU"
            if self.gpu_name:
                dev_label += f" ({self.gpu_name})"
            print("Device:")
            print(dev_label)
            print("==================================================")
            print(f"[SafeVision AI] AI STATUS: READY! Loaded with SHA256: {self.actual_checksum[:20]}...")
        except Exception as e:
            self.model = None
            self.ppe_model = None
            self.person_model = None
            self.runtime_state = "LOAD_FAILED"
            self.model_status = "load_failed"
            print(f"[SafeVision AI] AI STATUS: LOAD_FAILED: {e}")

    def add_custom_module(
        self,
        module_id: str,
        model_path: str,
        safe_vision_class_id: str,
        class_name: str,
        conf_thresh: float = 0.40,
        class_manifest: Optional[List[Dict[str, Any]]] = None
    ) -> CustomDetectorModule:
        """Dynamically loads and registers an incremental custom detector module."""
        module = CustomDetectorModule(
            module_id=module_id,
            model_path=model_path,
            safe_vision_class_id=safe_vision_class_id,
            class_name=class_name,
            confidence_threshold=conf_thresh,
            device=self.device,
            class_manifest=class_manifest
        )
        self.custom_modules[module_id] = module
        print(f"[SafeVision AI] Custom module registered: {module_id} -> {safe_vision_class_id} ({class_name}) [status: {module.status}]")
        return module

    def remove_custom_module(self, module_id: str) -> bool:
        """Unloads and removes a custom module from the detection pipeline."""
        if module_id in self.custom_modules:
            mod = self.custom_modules.pop(module_id)
            del mod
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
            print(f"[SafeVision AI] Custom module removed: {module_id}")
            return True
        return False

    def rollback_to_baseline(self) -> Dict[str, Any]:
        """Atomically deactivates all custom modules, restoring pure protected baseline."""
        unloaded = list(self.custom_modules.keys())
        self.custom_modules.clear()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        print(f"[SafeVision AI] Pipeline rolled back to pure protected baseline. Unloaded: {unloaded}")
        return {
            "success": True,
            "message": "Pipeline rolled back to pure protected baseline.",
            "unloaded_modules": unloaded,
            "baseline_model_id": self.model_id,
            "baseline_status": self.model_status
        }

    def get_pipeline_status(self) -> Dict[str, Any]:
        """Returns runtime health and isolation status of baseline and custom modules."""
        active_mods = []
        for mod_id, m in self.custom_modules.items():
            active_mods.append({
                "module_id": mod_id,
                "class_id": m.safe_vision_class_id,
                "class_name": m.class_name,
                "status": m.status,
                "error_message": m.error_message,
                "model_path": m.model_path,
                "device": m.device,
                "last_latency_ms": m.last_latency_ms,
                "inference_count": m.inference_count
            })

        return {
            "pipeline_state": "ACTIVE" if self.model_status == "configured" else "UNCONFIGURED",
            "baseline": {
                "model_id": self.model_id,
                "model_version": self.model_version,
                "model_path": self.model_path,
                "status": self.model_status,
                "runtime_state": self.runtime_state,
                "checksum": self.actual_checksum,
                "is_protected": True,
                "supported_classes_count": len(self.class_manifest.manifest_entries)
            },
            "custom_modules_count": len(self.custom_modules),
            "custom_modules": active_mods,
            "device": self.device,
            "hardware": {
                "device": self.device,
                "gpu_name": self.gpu_name,
                "cuda_available": self.cuda_available
            }
        }

    def infer_frame_direct(
        self,
        img: np.ndarray,
        camera_id: str,
        zone: Optional[str] = None,
        conf_thresh: float = 0.45,
        required_ppe: Optional[List[str]] = None,
        current_time: Optional[float] = None,
        profile: Optional[str] = "Construction"
    ) -> InferenceResponse:
        if not camera_id:
            return InferenceResponse(
                success=False,
                model_name=self.model_name,
                model_id=self.model_id,
                model_status="error",
                inference_time_ms=0.0,
                total_persons_detected=0,
                total_violations_detected=0,
                detections=[],
                tracked_workers=[],
                incident_candidates=[],
                warnings=["Validation error: camera_id is required and cannot be empty."]
            )

        if img is None or not isinstance(img, np.ndarray) or img.size == 0:
            return InferenceResponse(
                success=False,
                model_name=self.model_name,
                model_id=self.model_id,
                model_status="error",
                inference_time_ms=0.0,
                total_persons_detected=0,
                total_violations_detected=0,
                detections=[],
                tracked_workers=[],
                incident_candidates=[],
                warnings=["Invalid or unreadable image frame."]
            )

        resolved_zone = zone or "Unassigned Zone"
        start_time = time.time()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # If weights are missing, return unconfigured state without manufacturing fake detections
        if self.model_status != "configured" or self.model is None:
            inference_time_ms = round((time.time() - start_time) * 1000, 2)
            self.frames_processed += 1
            self.last_inference_time = now_iso
            self.last_latency_ms = inference_time_ms

            return InferenceResponse(
                success=True,
                model_name=self.model_name,
                model_id=self.model_id,
                model_status="unconfigured",
                inference_time_ms=inference_time_ms,
                total_persons_detected=0,
                total_violations_detected=0,
                detections=[],
                tracked_workers=[],
                incident_candidates=[],
                warnings=[
                    "MODEL NOT CONFIGURED: Approved SafeVision industrial weights missing in ai/models/. PPE INFERENCE DISABLED. No PPE incidents may be generated."
                ],
                person_assessments=[],
                expected_regions=[],
                inspection_summary={
                    "persons_detected": 0,
                    "inspection_profile": profile or "Construction",
                    "overall_status": "NOT_CONFIGURED",
                    "required_checks": 0,
                    "present_count": 0,
                    "missing_count": 0,
                    "not_assessable_count": 0,
                    "unsupported_count": 0,
                    "statement": "MODEL NOT CONFIGURED: Approved weights missing."
                },
                overall_status="NOT_CONFIGURED",
                inspection_profile=profile or "Construction"
            )

        h, w = img.shape[:2]
        target_imgsz = 1280 if max(h, w) >= 1280 else 640
        raw_detections: List[Dict[str, Any]] = []
        person_detections: List[Dict[str, Any]] = []

        # Branch between unified 17-class baseline inference and dual-model custom inference
        is_sh17 = (hasattr(self.model, "names") and len(self.model.names) == 17)

        if is_sh17:
            # 1. Unified 17-class baseline industrial model inference (SH17)
            try:
                sh17_conf = conf_thresh if conf_thresh is not None else 0.45
                results = self.model.predict(
                    img,
                    conf=sh17_conf,
                    verbose=False,
                    device=self.device,
                    imgsz=target_imgsz
                )
                for box in results[0].boxes:
                    xyxy = box.xyxy[0].cpu().numpy()
                    cls_id = int(box.cls[0].cpu().numpy())
                    confidence = float(box.conf[0].cpu().numpy())

                    manifest_entry = self.class_manifest.get_entry(cls_id)
                    sv_class_id = manifest_entry.get("safeVisionClassId") if manifest_entry else None
                    cls_name = manifest_entry.get("className") if manifest_entry else self.model.names.get(cls_id, f"class_{cls_id}").lower().replace('_', '-')

                    ymin = float((xyxy[1] / h) * 100)
                    xmin = float((xyxy[0] / w) * 100)
                    ymax = float((xyxy[3] / h) * 100)
                    xmax = float((xyxy[2] / w) * 100)
                    bbox_pct = [
                        round(max(0.0, min(100.0, ymin)), 2),
                        round(max(0.0, min(100.0, xmin)), 2),
                        round(max(0.0, min(100.0, ymax)), 2),
                        round(max(0.0, min(100.0, xmax)), 2)
                    ]

                    det_obj = {
                        "class_name": cls_name,
                        "safe_vision_class_id": sv_class_id,
                        "bbox": bbox_pct,
                        "confidence": confidence,
                        "pixel_box": [int(xyxy[1]), int(xyxy[0]), int(xyxy[3]), int(xyxy[2])]
                    }
                    raw_detections.append(det_obj)

                    if cls_id == 0 or cls_name in ["person", "worker"] or sv_class_id == "SV-PPE-001":
                        person_detections.append({
                            "bbox": bbox_pct,
                            "score": confidence,
                            "pixel_box": [int(xyxy[1]), int(xyxy[0]), int(xyxy[3]), int(xyxy[2])]
                        })
            except Exception as e:
                print(f"[SafeVision AI] Baseline model inference error: {e}")
        else:
            # 2. Dual-model architecture for 4-class PPE model (best.pt) + person detector
            if self.person_model is not None:
                try:
                    person_cls_ids = []
                    if hasattr(self.person_model, "names") and isinstance(self.person_model.names, dict):
                        for cid, cname in self.person_model.names.items():
                            if cname.lower() in ["person", "worker"]:
                                person_cls_ids.append(cid)
                    if not person_cls_ids:
                        person_cls_ids = [0]

                    person_conf_thresh = min(0.35, conf_thresh) if conf_thresh else 0.35
                    person_results = self.person_model.predict(
                        img,
                        conf=person_conf_thresh,
                        classes=person_cls_ids,
                        verbose=False,
                        device=self.device,
                        imgsz=target_imgsz
                    )
                    for box in person_results[0].boxes:
                        xyxy = box.xyxy[0].cpu().numpy()
                        p_conf = float(box.conf[0].cpu().numpy())
                        ymin = float((xyxy[1] / h) * 100)
                        xmin = float((xyxy[0] / w) * 100)
                        ymax = float((xyxy[3] / h) * 100)
                        xmax = float((xyxy[2] / w) * 100)
                        bbox_pct = [
                            round(max(0.0, min(100.0, ymin)), 2),
                            round(max(0.0, min(100.0, xmin)), 2),
                            round(max(0.0, min(100.0, ymax)), 2),
                            round(max(0.0, min(100.0, xmax)), 2)
                        ]
                        person_detections.append({
                            "bbox": bbox_pct,
                            "score": p_conf,
                            "pixel_box": [int(xyxy[1]), int(xyxy[0]), int(xyxy[3]), int(xyxy[2])]
                        })
                except Exception as pe:
                    print(f"[SafeVision AI] Person detector error: {pe}")

            ppe_conf = self.ppe_confidence
            if conf_thresh is not None and conf_thresh < ppe_conf:
                ppe_conf = conf_thresh

            try:
                ppe_results = self.ppe_model.predict(
                    img,
                    conf=ppe_conf,
                    verbose=False,
                    device=self.device,
                    imgsz=target_imgsz
                )
                for box in ppe_results[0].boxes:
                    xyxy = box.xyxy[0].cpu().numpy()
                    cls_id = int(box.cls[0].cpu().numpy())
                    confidence = float(box.conf[0].cpu().numpy())

                    manifest_entry = self.class_manifest.get_entry(cls_id)
                    sv_class_id = manifest_entry.get("safeVisionClassId") if manifest_entry else None
                    cls_name = manifest_entry.get("className") if manifest_entry else self.ppe_model.names.get(cls_id, f"class_{cls_id}").lower().replace('_', '-')

                    ymin = float((xyxy[1] / h) * 100)
                    xmin = float((xyxy[0] / w) * 100)
                    ymax = float((xyxy[3] / h) * 100)
                    xmax = float((xyxy[2] / w) * 100)
                    bbox_pct = [
                        round(max(0.0, min(100.0, ymin)), 2),
                        round(max(0.0, min(100.0, xmin)), 2),
                        round(max(0.0, min(100.0, ymax)), 2),
                        round(max(0.0, min(100.0, xmax)), 2)
                    ]

                    det_obj = {
                        "class_name": cls_name,
                        "safe_vision_class_id": sv_class_id,
                        "bbox": bbox_pct,
                        "confidence": confidence,
                        "pixel_box": [int(xyxy[1]), int(xyxy[0]), int(xyxy[3]), int(xyxy[2])]
                    }
                    raw_detections.append(det_obj)
            except Exception as e:
                print(f"[SafeVision AI] Custom PPE detector error: {e}")

        # Fallback for static image inference or tight crops: if person detector found no full person
        # but PPE detections are present, create an enclosing person candidate for tracking
        is_static = bool(camera_id and camera_id.startswith("STATIC"))
        if len(person_detections) == 0 and len(raw_detections) > 0 and (is_static or camera_id == "STATIC_IMAGE"):
            all_boxes = [d["bbox"] for d in raw_detections if "bbox" in d]
            if all_boxes:
                synth_ymin = max(0.0, min(b[0] for b in all_boxes) - 5.0)
                synth_xmin = max(0.0, min(b[1] for b in all_boxes) - 5.0)
                synth_ymax = min(100.0, max(b[2] for b in all_boxes) + 30.0)
                synth_xmax = min(100.0, max(b[3] for b in all_boxes) + 5.0)
                synth_bbox = [round(synth_ymin, 2), round(synth_xmin, 2), round(synth_ymax, 2), round(synth_xmax, 2)]
                person_detections.append({
                    "bbox": synth_bbox,
                    "score": 0.85,
                    "pixel_box": [int((synth_ymin/100)*h), int((synth_xmin/100)*w), int((synth_ymax/100)*h), int((synth_xmax/100)*w)]
                })

        # Run Incremental Custom Detector Modules (Inference Isolation & Hardware Awareness)
        for mod_id, module in list(self.custom_modules.items()):
            if module.status != "ACTIVE":
                continue
            try:
                mod_start = time.time()
                mod_dets = module.predict(img, conf_override=conf_thresh, imgsz=target_imgsz)
                module.last_latency_ms = round((time.time() - mod_start) * 1000, 2)
                module.inference_count += 1
                for md in mod_dets:
                    raw_detections.append(md)
                    if md.get("class_name") in ["person", "worker"] or md.get("safe_vision_class_id") == "SV-PPE-001":
                        person_detections.append({
                            "bbox": md["bbox"],
                            "score": md["confidence"],
                            "pixel_box": md["pixel_box"]
                        })
            except Exception as mod_err:
                # INFERENCE ISOLATION: A failure in a custom module never crashes the baseline!
                module.status = "ERROR"
                module.error_message = str(mod_err)
                print(f"[SafeVision AI] Custom module '{mod_id}' execution failed: {mod_err}. Baseline unaffected.")

        # Class-Aware Cross-Module Deduplication (NMS)
        if len(raw_detections) > 1:
            deduped_raw: List[Dict[str, Any]] = []
            for d in raw_detections:
                is_dup = False
                for ex in deduped_raw:
                    if d.get("safe_vision_class_id") and d["safe_vision_class_id"] == ex.get("safe_vision_class_id"):
                        b1 = d["bbox"]
                        b2 = ex["bbox"]
                        y1 = max(b1[0], b2[0])
                        x1 = max(b1[1], b2[1])
                        y2 = min(b1[2], b2[2])
                        x2 = min(b1[3], b2[3])
                        if y2 > y1 and x2 > x1:
                            inter = (y2 - y1) * (x2 - x1)
                            a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
                            a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
                            iou = inter / max(1e-6, a1 + a2 - inter)
                            if iou > self.cross_module_iou_threshold:
                                is_dup = True
                                if d["confidence"] > ex["confidence"]:
                                    ex.update(d)
                                break
                if not is_dup:
                    deduped_raw.append(d)
            raw_detections = deduped_raw

        # Update isolated ByteTracker for this specific camera
        is_static = bool(camera_id and camera_id.startswith("STATIC"))
        if is_static:
            tracker = ByteTracker()
        else:
            tracker = self.get_tracker(camera_id)
        active_tracks = tracker.update(person_detections)

        tracked_workers_list: List[TrackPPEStateItem] = []
        detections_list: List[DetectionItem] = []
        incident_candidates: List[IncidentCreationCandidate] = []

        active_supported_ids = set(self.class_manifest.get_supported_class_ids())
        for mod in self.custom_modules.values():
            if mod.status == "ACTIVE":
                active_supported_ids.add(mod.safe_vision_class_id)

        all_expected_regions: List[Dict[str, Any]] = []
        person_assessments: List[Dict[str, Any]] = []

        # Multi-person global association resolution (Phase 12.3.1)
        persons_candidate_list = [
            {"track_id": trk.track_label, "bbox": trk.bbox, "confidence": trk.score}
            for trk in active_tracks
        ]
        multi_person_evals = self.ppe_engine.evaluate_multi_person_frame(
            persons=persons_candidate_list,
            frame_detections=raw_detections,
            required_ppe=required_ppe or ["helmet", "safety-vest"],
            active_supported_class_ids=active_supported_ids
        )
        eval_by_track = {e.track_id: e for e in multi_person_evals}

        for track in active_tracks:
            track_id = track.track_label
            person_bbox = track.bbox
            person_conf = track.score

            # Evaluate PPE association for this person track
            ppe_eval = eval_by_track.get(track_id) or self.ppe_engine.evaluate_track_ppe(
                track_id=track_id,
                person_bbox=person_bbox,
                person_confidence=person_conf,
                frame_detections=raw_detections,
                required_ppe=required_ppe or ["helmet", "safety-vest"],
                active_supported_class_ids=active_supported_ids
            )

            person_expected_regions = [er.model_dump() for er in ppe_eval.expected_regions]
            all_expected_regions.extend(person_expected_regions)

            person_assess_items = []
            for a in ppe_eval.assessments:
                d_item = a.model_dump()
                d_item["class_id"] = d_item.get("safe_vision_class_id")
                person_assess_items.append(d_item)

            person_assessments.append({
                "person_id": track_id,
                "bbox": person_bbox,
                "confidence": round(person_conf, 3),
                "compliance_state": ppe_eval.compliance_state,
                "required_ppe": ppe_eval.required_ppe_items,
                "detected_ppe": ppe_eval.detected_ppe_items,
                "assessments": person_assess_items,
                "items": person_assess_items,
                "expected_regions": person_expected_regions,
                "violations": ppe_eval.violations
            })

            # Check Face Identity (Separate decoupled service)
            identity_match = None
            if self.identity_service.is_enabled:
                ymin_px = max(0, int((person_bbox[0] / 100.0) * h))
                xmin_px = max(0, int((person_bbox[1] / 100.0) * w))
                ymax_px = min(h, int((person_bbox[0] + 0.30 * (person_bbox[2] - person_bbox[0])) / 100.0 * h))
                xmax_px = min(w, int((person_bbox[3] / 100.0) * w))
                if (ymax_px - ymin_px) > 20 and (xmax_px - xmin_px) > 20:
                    head_crop = img[ymin_px:ymax_px, xmin_px:xmax_px]
                    identity_match = self.identity_service.match_face(head_crop, camera_id=camera_id, zone=resolved_zone)

            emp_id = identity_match.employee_id if (identity_match and identity_match.match_status == "CONFIRMED") else None
            emp_name = identity_match.employee_name if (identity_match and identity_match.match_status == "CONFIRMED") else None
            ident_status = identity_match.match_status if identity_match else "UNCONFIRMED"
            ident_conf = identity_match.match_confidence if identity_match else 0.0

            # Run Temporal Validation for each violation detected on this track
            primary_temporal_state = "STATIC_EVALUATION" if is_static else "OBSERVING"
            max_duration_sec = 0.0
            viol_durations: Dict[str, float] = {}
            if not is_static:
                for viol in ppe_eval.violations:
                    is_confirmed, should_create, temp_state, diag = self.temporal_engine.process_observation(
                        track_id=track_id,
                        camera_id=camera_id,
                        violation_type=viol,
                        is_violation=True,
                        confidence=person_conf,
                        timestamp=current_time
                    )
                    primary_temporal_state = temp_state
                    dur = float(diag.get("violation_duration_sec", 0.0)) if diag else 0.0
                    viol_durations[viol] = dur
                    if dur > max_duration_sec:
                        max_duration_sec = dur

                    if should_create:
                        # Construct incident candidate
                        incident_candidates.append(IncidentCreationCandidate(
                            track_id=track_id,
                            employee_id=emp_id,
                            employee_name=emp_name,
                            identity_status=ident_status,
                            violation_type=viol,
                            severity="high" if viol in ["missing_helmet", "missing_vest", "no_helmet_and_no_vest"] else "medium",
                            confidence=round(person_conf, 3),
                            camera_id=camera_id,
                            zone=resolved_zone,
                            timestamp=now_iso,
                            bounding_box=BoundingBox(
                                ymin=person_bbox[0],
                                xmin=person_bbox[1],
                                ymax=person_bbox[2],
                                xmax=person_bbox[3],
                                label=f"{track_id} {viol.upper()}",
                                color="#EF4444"
                            ),
                            rule_id=f"RULE-PPE-{viol.upper()}",
                            model_id=self.model_id,
                            model_version=self.class_manifest.model_version,
                            safe_vision_class_id="SV-PPE-002" if "helmet" in viol else ("SV-PPE-003" if "vest" in viol else ("SV-PPE-004" if "glove" in viol else ("SV-PPE-005" if "foot" in viol or "shoe" in viol else None))),
                            why_flagged=[
                                f"Temporal violation confirmed: {diag['violation_count']}/{diag['window_size']} frames in violation ({diag['violation_ratio']*100:.0f}%)",
                                f"Persistent duration: {diag['violation_duration_sec']}s",
                                f"Worker Identity: {emp_name} ({emp_id})" if emp_id else "Worker Identity: Unknown / Unconfirmed"
                            ],
                            temporal_config_used=diag,
                            helmet_status=ppe_eval.helmet.status,
                            vest_status=ppe_eval.vest.status,
                            source="AI"
                        ))

            glasses_state = ppe_eval.additional_ppe.get("glasses")
            mask_state = ppe_eval.additional_ppe.get("face-mask")

            # Determine overall compliance based on required PPE
            req_list = required_ppe or ["helmet", "safety-vest"]
            has_missing = len(ppe_eval.violations) > 0
            has_unknown = any(
                (item == "helmet" and ppe_eval.helmet.status == "UNKNOWN") or
                (item in ["safety-vest", "vest"] and ppe_eval.vest.status == "UNKNOWN") or
                (item == "gloves" and ppe_eval.gloves.status == "UNKNOWN") or
                (item in ["shoes", "boots", "safety-shoes"] and ppe_eval.shoes.status == "UNKNOWN") or
                (item in ["glasses", "eye-protection"] and (glasses_state and glasses_state.status == "UNKNOWN"))
                for item in req_list
            )

            if has_missing:
                overall_comp = "NON-COMPLIANT"
            elif has_unknown:
                overall_comp = "UNKNOWN"
            else:
                overall_comp = "COMPLIANT"

            ppe_details = {
                "helmet": {
                    "status": ppe_eval.helmet.status,
                    "confidence": ppe_eval.helmet.confidence,
                    "item": ppe_eval.helmet.detected_item,
                    "notes": ppe_eval.helmet.observation_notes,
                    "durationSec": viol_durations.get("missing_helmet", 0.0) if ppe_eval.helmet.status == "MISSING" else 0.0,
                },
                "vest": {
                    "status": ppe_eval.vest.status,
                    "confidence": ppe_eval.vest.confidence,
                    "item": ppe_eval.vest.detected_item,
                    "notes": ppe_eval.vest.observation_notes,
                    "durationSec": viol_durations.get("missing_vest", 0.0) if ppe_eval.vest.status == "MISSING" else 0.0,
                },
                "gloves": {
                    "status": ppe_eval.gloves.status,
                    "confidence": ppe_eval.gloves.confidence,
                    "item": ppe_eval.gloves.detected_item,
                    "notes": ppe_eval.gloves.observation_notes,
                    "durationSec": viol_durations.get("no_gloves", 0.0) if ppe_eval.gloves.status == "MISSING" else 0.0,
                },
                "shoes": {
                    "status": ppe_eval.shoes.status,
                    "confidence": ppe_eval.shoes.confidence,
                    "item": ppe_eval.shoes.detected_item,
                    "notes": ppe_eval.shoes.observation_notes,
                    "durationSec": viol_durations.get("no_safety_footwear", 0.0) if ppe_eval.shoes.status == "MISSING" else 0.0,
                },
                "glasses": {
                    "status": glasses_state.status if glasses_state else "UNKNOWN",
                    "confidence": glasses_state.confidence if glasses_state else 0.0,
                    "item": glasses_state.detected_item if glasses_state else None,
                    "notes": glasses_state.observation_notes if glasses_state else "",
                    "durationSec": viol_durations.get("missing_glasses", 0.0) if (glasses_state and glasses_state.status == "MISSING") else 0.0,
                },
                "mask": {
                    "status": mask_state.status if mask_state else "UNKNOWN",
                    "confidence": mask_state.confidence if mask_state else 0.0,
                    "item": mask_state.detected_item if mask_state else None,
                    "notes": mask_state.observation_notes if mask_state else "",
                    "durationSec": viol_durations.get("missing_mask", 0.0) if (mask_state and mask_state.status == "MISSING") else 0.0,
                }
            }

            # Merge any other additional PPE items (e.g. unsupported items)
            for add_key, add_val in ppe_eval.additional_ppe.items():
                norm_key = add_key.replace("-", "_")
                if norm_key not in ppe_details and add_key not in ppe_details:
                    ppe_details[add_key] = {
                        "status": add_val.status,
                        "confidence": add_val.confidence,
                        "item": add_val.detected_item,
                        "notes": add_val.observation_notes,
                        "durationSec": 0.0,
                    }

            # Worker status calculation (Task 4: SAFE vs VIOLATION)
            worker_status = "VIOLATION" if len(ppe_eval.violations) > 0 else "SAFE"

            # Add to tracked workers summary
            tracked_workers_list.append(TrackPPEStateItem(
                track_id=track_id,
                employee_id=emp_id,
                employee_name=emp_name,
                identity_status=ident_status,
                identity_confidence=ident_conf,
                helmet_status=ppe_eval.helmet.status,
                helmet_confidence=ppe_eval.helmet.confidence,
                vest_status=ppe_eval.vest.status,
                vest_confidence=ppe_eval.vest.confidence,
                gloves_status=ppe_eval.gloves.status,
                gloves_confidence=ppe_eval.gloves.confidence,
                shoes_status=ppe_eval.shoes.status,
                shoes_confidence=ppe_eval.shoes.confidence,
                glasses_status=glasses_state.status if glasses_state else "UNKNOWN",
                glasses_confidence=glasses_state.confidence if glasses_state else 0.0,
                mask_status=mask_state.status if mask_state else "UNKNOWN",
                mask_confidence=mask_state.confidence if mask_state else 0.0,
                overall_compliance=overall_comp,
                compliance_duration_sec=max_duration_sec,
                ppe_details=ppe_details,
                temporal_state=primary_temporal_state,
                violations=ppe_eval.violations,
                status=worker_status,
                bounding_box=BoundingBox(
                    ymin=person_bbox[0],
                    xmin=person_bbox[1],
                    ymax=person_bbox[2],
                    xmax=person_bbox[3],
                    label=f"{track_id} | {ident_status}",
                    color="#EF4444" if len(ppe_eval.violations) > 0 else "#34D399"
                ),
                person_confidence=round(person_conf, 3)
            ))

            # Detection Item representation for overlay
            detections_list.append(DetectionItem(
                worker_tracking_id=track_id,
                employee_id=emp_id,
                employee_name=emp_name,
                identity_status=ident_status,
                class_name="worker_ppe_track",
                confidence=round(person_conf, 3),
                bounding_box=BoundingBox(
                    ymin=person_bbox[0],
                    xmin=person_bbox[1],
                    ymax=person_bbox[2],
                    xmax=person_bbox[3],
                    label=f"{track_id} ({emp_name or 'Unconfirmed'})",
                    color="#EF4444" if len(ppe_eval.violations) > 0 else "#34D399"
                ),
                zone=zone,
                camera_id=camera_id,
                timestamp=now_iso,
                severity="high" if len(ppe_eval.violations) > 0 else "low",
                violation=len(ppe_eval.violations) > 0,
                status=worker_status,
                is_authoritative=True,
                helmet_status=ppe_eval.helmet.status,
                helmet_confidence=ppe_eval.helmet.confidence,
                vest_status=ppe_eval.vest.status,
                vest_confidence=ppe_eval.vest.confidence,
                gloves_status=ppe_eval.gloves.status,
                gloves_confidence=ppe_eval.gloves.confidence,
                shoes_status=ppe_eval.shoes.status,
                shoes_confidence=ppe_eval.shoes.confidence,
                glasses_status=glasses_state.status if glasses_state else "UNKNOWN",
                glasses_confidence=glasses_state.confidence if glasses_state else 0.0,
                mask_status=mask_state.status if mask_state else "UNKNOWN",
                mask_confidence=mask_state.confidence if mask_state else 0.0,
                overall_compliance=overall_comp,
                ppe_details=ppe_details,
                persisted_duration_sec=max_duration_sec,
                safe_vision_class_id="SV-PPE-001",
                model_version=self.class_manifest.model_version,
                temporal_state=primary_temporal_state
            ))

        # Add detected PPE items to detections_list for UI canvas overlays
        for det in raw_detections:
            cn = det.get("class_name", "")
            if cn not in ["person", "worker"] and det.get("safe_vision_class_id") != "SV-PPE-001":
                b = det.get("bbox", [0.0, 0.0, 0.0, 0.0])
                c_conf = det.get("confidence", 1.0)
                detections_list.append(DetectionItem(
                    worker_tracking_id="PPE_EVIDENCE",
                    class_name=cn,
                    confidence=round(float(c_conf), 3),
                    bounding_box=BoundingBox(
                        ymin=b[0],
                        xmin=b[1],
                        ymax=b[2],
                        xmax=b[3],
                        label=f"{cn.upper()} ({int(c_conf * 100)}%)",
                        color="#10B981"
                    ),
                    zone=resolved_zone,
                    camera_id=camera_id,
                    timestamp=now_iso,
                    severity="low",
                    safe_vision_class_id=det.get("safe_vision_class_id"),
                    model_version=self.class_manifest.model_version
                ))

        inference_time_ms = round((time.time() - start_time) * 1000, 2)
        self.frames_processed += 1
        self.last_inference_time = now_iso
        self.last_latency_ms = inference_time_ms

        # Task 11: Diagnostic inference logging (periodic or on violations)
        has_violations = len(incident_candidates) > 0 or any(w.status == "VIOLATION" for w in tracked_workers_list)
        if self.frames_processed % 30 == 1 or has_violations:
            det_summary = [f"{d['class_name']}:{d['confidence']:.2f}" for d in raw_detections[:5]]
            track_summary = [f"{w.track_id}({w.status}|H:{w.helmet_status}|V:{w.vest_status})" for w in tracked_workers_list]
            print(f"[SafeVision AI] Frame #{self.frames_processed} [{camera_id}] | "
                  f"Detections({len(raw_detections)}): {det_summary} | "
                  f"Tracks({len(tracked_workers_list)}): {track_summary} | "
                  f"Incidents: {len(incident_candidates)} | Latency: {inference_time_ms}ms")

        # Factual overall status calculation
        resolved_profile = profile or "Construction"
        if len(active_tracks) == 0:
            overall_status = "NO_PERSONNEL"
        elif any(pa["compliance_state"] == "NON-COMPLIANT" or len(pa["violations"]) > 0 for pa in person_assessments):
            overall_status = "NON-COMPLIANT"
        elif any(pa["compliance_state"] in ["PARTIALLY_ASSESSED", "NOT_ASSESSABLE"] for pa in person_assessments):
            overall_status = "NOT_ASSESSABLE"
        else:
            overall_status = "COMPLIANT"

        total_required_checks = sum(len(pa["required_ppe"]) for pa in person_assessments)
        present_count = 0
        missing_count = 0
        not_assessable_count = 0
        unsupported_count = 0

        for pa in person_assessments:
            for item in pa["assessments"]:
                st = item.get("status")
                if st == "PRESENT":
                    present_count += 1
                elif st == "MISSING":
                    missing_count += 1
                elif st == "NOT_ASSESSABLE":
                    not_assessable_count += 1
                elif st == "UNSUPPORTED":
                    unsupported_count += 1

        if len(active_tracks) == 0:
            summary_statement = "No personnel detected in this media."
        else:
            summary_statement = (
                f"{len(active_tracks)} person(s) evaluated under {resolved_profile} profile: "
                f"{present_count} present, {missing_count} missing, "
                f"{not_assessable_count} not assessable."
            )

        inspection_summary = {
            "persons_detected": len(active_tracks),
            "inspection_profile": resolved_profile,
            "overall_status": overall_status,
            "required_checks": total_required_checks,
            "present_count": present_count,
            "missing_count": missing_count,
            "not_assessable_count": not_assessable_count,
            "unsupported_count": unsupported_count,
            "compliant_count": sum(1 for pa in person_assessments if pa["compliance_state"] == "COMPLIANT"),
            "non_compliant_count": sum(1 for pa in person_assessments if pa["compliance_state"] == "NON-COMPLIANT"),
            "statement": summary_statement
        }

        return InferenceResponse(
            success=True,
            model_name=self.model_name,
            model_id=self.model_id,
            model_status="configured",
            inference_time_ms=inference_time_ms,
            total_persons_detected=len(active_tracks),
            total_violations_detected=sum(1 for w in tracked_workers_list if len(w.violations) > 0),
            detections=detections_list,
            tracked_workers=tracked_workers_list,
            incident_candidates=incident_candidates,
            warnings=[],
            person_assessments=person_assessments,
            expected_regions=all_expected_regions,
            inspection_summary=inspection_summary,
            overall_status=overall_status,
            inspection_profile=resolved_profile
        )

    def infer_batch_direct(
        self,
        batch_items: List[Dict[str, Any]],
        conf_thresh: float = 0.45,
        required_ppe: Optional[List[str]] = None
    ) -> List[InferenceResponse]:
        """
        Executes batched neural inference across multiple cameras simultaneously.
        Guarantees strict isolation of ByteTracker, PPE association, temporal validation,
        and incident candidate generation per camera.
        Each item in batch_items must be a dict containing:
        - img: np.ndarray
        - camera_id: str
        - zone: Optional[str]
        - current_time: Optional[float]
        """
        if not batch_items:
            return []

        return [
            self.infer_frame_direct(
                img=item["img"],
                camera_id=item["camera_id"],
                zone=item.get("zone"),
                conf_thresh=conf_thresh,
                required_ppe=required_ppe,
                current_time=item.get("current_time")
            )
            for item in batch_items
        ]

    def infer_image(
        self,
        image_bytes: bytes,
        camera_id: Optional[str] = None,
        zone: Optional[str] = None,
        conf_thresh: float = 0.45,
        required_ppe: Optional[List[str]] = None,
        profile: Optional[str] = "Construction"
    ) -> InferenceResponse:
        if not camera_id:
            return InferenceResponse(
                success=False,
                model_name=self.model_name,
                model_id=self.model_id,
                model_status="error",
                inference_time_ms=0.0,
                total_persons_detected=0,
                total_violations_detected=0,
                detections=[],
                tracked_workers=[],
                incident_candidates=[],
                warnings=["Validation error: camera_id is required and cannot be empty."]
            )

        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return InferenceResponse(
                success=False,
                model_name=self.model_name,
                model_id=self.model_id,
                model_status="error",
                inference_time_ms=0.0,
                total_persons_detected=0,
                total_violations_detected=0,
                detections=[],
                tracked_workers=[],
                incident_candidates=[],
                warnings=["Invalid or unreadable image buffer."]
            )

        return self.infer_frame_direct(
            img=img,
            camera_id=camera_id,
            zone=zone,
            conf_thresh=conf_thresh,
            required_ppe=required_ppe,
            profile=profile
        )

    def infer_video(
        self,
        video_path: str,
        camera_id: str = "UPLOADED_MEDIA",
        zone: str = "General Inspection",
        conf_thresh: float = 0.45,
        sample_fps: int = 4,
        required_ppe: Optional[List[str]] = None,
        profile: Optional[str] = "Construction"
    ) -> VideoInferenceResponse:
        start_time = time.time()
        cap = cv2.VideoCapture(video_path)
        resolved_profile = profile or "Construction"
        if not cap.isOpened():
            return VideoInferenceResponse(
                success=False,
                model_name=self.model_name,
                model_id=self.model_id,
                video_duration_sec=0.0,
                total_frames=0,
                fps=0.0,
                frames_analyzed=0,
                processing_time_sec=0.0,
                effective_fps=0.0,
                total_persons_detected=0,
                total_tracks=0,
                total_violations_detected=0,
                analysis_status="ANALYSIS_FAILED",
                analysis_summary="Failed to open or decode video file: corrupted media or unsupported video codec.",
                keyframes=[],
                incident_candidates=[],
                warnings=["Failed to open video file for inference."],
                person_assessments=[],
                expected_regions=[],
                inspection_summary=None,
                overall_status="ANALYSIS_FAILED",
                inspection_profile=resolved_profile
            )

        video_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
        total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec = total_video_frames / video_fps if video_fps > 0 else 0.0

        if total_video_frames <= 0:
            cap.release()
            return VideoInferenceResponse(
                success=False,
                model_name=self.model_name,
                model_id=self.model_id,
                video_duration_sec=0.0,
                total_frames=0,
                fps=float(video_fps),
                frames_analyzed=0,
                processing_time_sec=0.0,
                effective_fps=0.0,
                total_persons_detected=0,
                total_tracks=0,
                total_violations_detected=0,
                analysis_status="ANALYSIS_FAILED",
                analysis_summary="Video contains zero decodable frames.",
                keyframes=[],
                incident_candidates=[],
                warnings=["Video stream contains no readable frames."],
                person_assessments=[],
                expected_regions=[],
                inspection_summary=None,
                overall_status="ANALYSIS_FAILED",
                inspection_profile=resolved_profile
            )

        # 1. Isolate tracker & temporal validator for this specific upload
        self.reset_camera_state(camera_id)
        self.get_tracker(camera_id)

        step_frames = max(1, int(video_fps / sample_fps))
        frame_idx = 0
        analyzed_count = 0
        keyframes: List[VideoKeyframeResult] = []
        all_incident_candidates: List[IncidentCreationCandidate] = []
        all_unique_tracks = set()
        transient_violation_count = 0
        total_ppe_evaluations = 0

        track_temporal_history: Dict[str, Dict[str, Any]] = {}

        while cap.isOpened():
            if frame_idx % step_frames == 0:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                analyzed_count += 1
                timestamp_sec = round(frame_idx / video_fps, 2)

                # 2. Run direct neural inference on frame array
                frame_res = self.infer_frame_direct(
                    img=frame,
                    camera_id=camera_id,
                    zone=zone,
                    conf_thresh=conf_thresh,
                    required_ppe=required_ppe,
                    current_time=timestamp_sec,
                    profile=profile
                )

                if len(frame_res.incident_candidates) > 0:
                    all_incident_candidates.extend(frame_res.incident_candidates)

                for tw in frame_res.tracked_workers:
                    all_unique_tracks.add(tw.track_id)
                    total_ppe_evaluations += 1
                    if len(tw.violations) > 0:
                        transient_violation_count += 1

                # Update per-person per-PPE temporal observation history
                for pa in frame_res.person_assessments:
                    pid = pa.get("person_id")
                    if pid:
                        if pid not in track_temporal_history:
                            track_temporal_history[pid] = {
                                "frames_observed": 0,
                                "person_bbox": pa.get("bbox") or pa.get("person_bbox"),
                                "confidence": pa.get("confidence", 0.0),
                                "required_ppe": pa.get("required_ppe", []),
                                "ppe_records": {},
                                "latest_assessments": {}
                            }
                        thist = track_temporal_history[pid]
                        thist["frames_observed"] += 1
                        thist["person_bbox"] = pa.get("bbox") or pa.get("person_bbox") or thist["person_bbox"]
                        thist["confidence"] = max(thist["confidence"], pa.get("confidence", 0.0))
                        for item in pa.get("assessments", []):
                            cname = item.get("ppe_class")
                            st = item.get("status")
                            if cname:
                                if cname not in thist["ppe_records"]:
                                    thist["ppe_records"][cname] = {
                                        "PRESENT": 0,
                                        "MISSING": 0,
                                        "NOT_ASSESSABLE": 0,
                                        "UNSUPPORTED": 0,
                                        "NOT_REQUIRED": 0
                                    }
                                thist["ppe_records"][cname][st] = thist["ppe_records"][cname].get(st, 0) + 1
                                thist["latest_assessments"][cname] = item

                # 3. Create high-quality visual keyframe with forensic overlay
                kf_annotated = frame.copy()
                h, w = frame.shape[:2]

                # Draw tracked workers and their PPE pills
                for tw in frame_res.tracked_workers:
                    bb = tw.bounding_box
                    x1, y1 = int((bb.xmin / 100.0) * w), int((bb.ymin / 100.0) * h)
                    x2, y2 = int((bb.xmax / 100.0) * w), int((bb.ymax / 100.0) * h)
                    x1, y1 = max(0, min(w - 1, x1)), max(0, min(h - 1, y1))
                    x2, y2 = max(0, min(w - 1, x2)), max(0, min(h - 1, y2))

                    is_viol = len(tw.violations) > 0
                    color = (0, 0, 239) if is_viol else (50, 205, 50)  # BGR
                    cv2.rectangle(kf_annotated, (x1, y1), (x2, y2), color, 2)

                    # Worker ID & PPE status pill
                    status_txt = f"{tw.track_id} | {tw.overall_compliance}"
                    if is_viol:
                        status_txt += f" [MISSING: {', '.join(tw.violations).upper()}]"
                    (tw_w, tw_h), _ = cv2.getTextSize(status_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                    pill_y = max(18, y1 - 6)
                    cv2.rectangle(kf_annotated, (x1, pill_y - tw_h - 4), (x1 + tw_w + 8, pill_y + 2), color, -1)
                    cv2.putText(kf_annotated, status_txt, (x1 + 4, pill_y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

                # Draw detected equipment boxes (helmets, vests, gloves, etc.)
                for det in frame_res.detections:
                    if det.class_name != "worker_ppe_track":
                        dbb = det.bounding_box
                        dx1, dy1 = int((dbb.xmin / 100.0) * w), int((dbb.ymin / 100.0) * h)
                        dx2, dy2 = int((dbb.xmax / 100.0) * w), int((dbb.ymax / 100.0) * h)
                        dx1, dy1 = max(0, min(w - 1, dx1)), max(0, min(h - 1, dy1))
                        dx2, dy2 = max(0, min(w - 1, dx2)), max(0, min(h - 1, dy2))
                        cv2.rectangle(kf_annotated, (dx1, dy1), (dx2, dy2), (255, 200, 0), 1)

                # Top forensic watermark banner
                cv2.rectangle(kf_annotated, (0, 0), (w, 28), (15, 18, 26), -1)
                header_str = f"SAFEVISION AI INSPECTION | FRAME #{frame_idx} | t={timestamp_sec:.2f}s | {zone.upper()}"
                cv2.putText(kf_annotated, header_str, (12, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1, cv2.LINE_AA)

                # Resize snapshot for fast network transfer and smooth UI display
                disp_frame = kf_annotated
                if w > 640:
                    scale = 640.0 / w
                    disp_frame = cv2.resize(kf_annotated, (640, int(h * scale)), interpolation=cv2.INTER_LINEAR)

                ret_enc, kf_jpg = cv2.imencode(".jpg", disp_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                snapshot_b64 = f"data:image/jpeg;base64,{base64.b64encode(kf_jpg.tobytes()).decode('ascii')}" if ret_enc else None

                keyframes.append(VideoKeyframeResult(
                    timestamp_sec=timestamp_sec,
                    frame_index=frame_idx,
                    detections=frame_res.detections,
                    tracked_workers=frame_res.tracked_workers,
                    snapshot_base64=snapshot_b64,
                    width=w,
                    height=h,
                    person_assessments=frame_res.person_assessments,
                    expected_regions=frame_res.expected_regions
                ))
            else:
                if not cap.grab():
                    break

            frame_idx += 1

        cap.release()
        total_time_sec = round(time.time() - start_time, 2)
        effective_fps = round(analyzed_count / total_time_sec, 1) if total_time_sec > 0 else 0.0

        # Synthesize temporal consensus for each track across observed frames
        agg_person_assessments: List[Dict[str, Any]] = []
        for pid, thist in track_temporal_history.items():
            obs_frames = thist["frames_observed"]
            req_ppe = thist["required_ppe"]
            final_items: List[Dict[str, Any]] = []

            for cname in req_ppe:
                rec = thist["ppe_records"].get(cname, {})
                latest = thist["latest_assessments"].get(cname, {})
                p_cnt = rec.get("PRESENT", 0)
                m_cnt = rec.get("MISSING", 0)
                na_cnt = rec.get("NOT_ASSESSABLE", 0)
                un_cnt = rec.get("UNSUPPORTED", 0)

                target_reg = latest.get("anatomical_region") or "BODY"
                item_name = latest.get("item_name") or cname
                safe_id = latest.get("safe_vision_class_id") or ""

                if un_cnt > 0 and (p_cnt + m_cnt == 0):
                    item_status = "UNSUPPORTED"
                    reason = f"Active model ({self.model_id}) does not support this class."
                elif (p_cnt + m_cnt) == 0:
                    item_status = "NOT_ASSESSABLE"
                    reason = f"Not assessable across all {obs_frames} observed frames (anatomical region occluded or outside frame)."
                else:
                    assessable_cnt = p_cnt + m_cnt
                    # Temporal consensus: >= 50% of assessable frames determines outcome
                    if (m_cnt / assessable_cnt) >= 0.50:
                        item_status = "MISSING"
                        reason = f"Missing confirmed temporally across {m_cnt}/{obs_frames} observed frames ({round((m_cnt/assessable_cnt)*100)}% of assessable observations)."
                    else:
                        item_status = "PRESENT"
                        reason = f"Present confirmed temporally across {p_cnt}/{obs_frames} observed frames ({round((p_cnt/assessable_cnt)*100)}% of assessable observations)."

                final_items.append({
                    "ppe_class": cname,
                    "item_name": item_name,
                    "safe_vision_class_id": safe_id,
                    "status": item_status,
                    "confidence": latest.get("confidence", 0.0),
                    "anatomical_region": target_reg,
                    "evidence": latest.get("evidence", f"Temporal observation: {p_cnt} present, {m_cnt} missing across {obs_frames} frames"),
                    "reason": reason,
                    "temporal_summary": f"{p_cnt}/{obs_frames} present, {m_cnt}/{obs_frames} missing"
                })

            # Calculate person compliance according to Requirement 9:
            # IF any REQUIRED PPE = MISSING -> NON-COMPLIANT
            # ELSE IF any REQUIRED PPE = NOT_ASSESSABLE -> NOT_ASSESSABLE
            # ELSE IF all REQUIRED PPE = PRESENT -> COMPLIANT
            has_missing = any(it["status"] == "MISSING" for it in final_items)
            has_na = any(it["status"] == "NOT_ASSESSABLE" for it in final_items)
            all_present = all(it["status"] == "PRESENT" for it in final_items) if final_items else True

            if has_missing:
                p_compliance = "NON-COMPLIANT"
            elif has_na:
                p_compliance = "NOT_ASSESSABLE"
            elif all_present:
                p_compliance = "COMPLIANT"
            else:
                p_compliance = "NOT_ASSESSABLE"

            agg_person_assessments.append({
                "person_id": pid,
                "bbox": thist["person_bbox"],
                "person_bbox": thist["person_bbox"],
                "confidence": thist["confidence"],
                "compliance_state": p_compliance,
                "required_ppe": req_ppe,
                "assessments": final_items,
                "items": final_items,
                "frames_observed": obs_frames
            })

            # Ensure non-compliant tracks yield an incident candidate if none was emitted
            missing_classes = [it["ppe_class"] for it in final_items if it["status"] == "MISSING"]
            if missing_classes and len(all_incident_candidates) == 0:
                pbox = thist["person_bbox"]
                if pbox and len(pbox) >= 4:
                    bbox_obj = BoundingBox(ymin=pbox[0], xmin=pbox[1], ymax=pbox[2], xmax=pbox[3])
                    all_incident_candidates.append(IncidentCreationCandidate(
                        track_id=pid,
                        violation_type=f"missing_{missing_classes[0]}",
                        severity="high",
                        confidence=thist["confidence"],
                        camera_id=camera_id,
                        zone=zone,
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        bounding_box=bbox_obj,
                        rule_id=f"RULE-PPE-REQ-{missing_classes[0].upper()}",
                        model_id=self.model_id,
                        model_version=self.class_manifest.model_version,
                        safe_vision_class_id=final_items[0].get("safe_vision_class_id"),
                        why_flagged=[f"Temporally confirmed missing required PPE: {', '.join(missing_classes)}"],
                        temporal_config_used={"min_duration_sec": 3.0, "temporal_consensus_ratio": 0.50}
                    ))

        # Fallback to keyframe assessments if tracker history was empty but keyframes exist
        if len(agg_person_assessments) == 0 and len(keyframes) > 0:
            seen_persons = set()
            for kf in reversed(keyframes):
                for pa in kf.person_assessments:
                    pid = pa.get("person_id")
                    if pid and pid not in seen_persons:
                        seen_persons.add(pid)
                        agg_person_assessments.append(pa)

        # 4. Authoritative video status derived strictly from evaluated persons (Requirement 9 & 11)
        if len(all_unique_tracks) == 0 and len(agg_person_assessments) == 0:
            analysis_status = "NO_DETECTION"
            overall_status = "NO_DETECTION"
            analysis_summary = f"No personnel detected across {analyzed_count} analyzed frames in this media."
        elif any(pa["compliance_state"] == "NON-COMPLIANT" for pa in agg_person_assessments):
            analysis_status = "CONFIRMED_VIOLATION"
            overall_status = "NON-COMPLIANT"
            non_comp_count = sum(1 for pa in agg_person_assessments if pa["compliance_state"] == "NON-COMPLIANT")
            analysis_summary = f"Safety violation detected: {non_comp_count} of {len(agg_person_assessments)} evaluated worker(s) non-compliant across {analyzed_count} frames under {resolved_profile} profile."
        elif any(pa["compliance_state"] in ["NOT_ASSESSABLE", "PARTIALLY_ASSESSED"] for pa in agg_person_assessments):
            analysis_status = "NOT_ASSESSABLE"
            overall_status = "NOT_ASSESSABLE"
            na_count = sum(1 for pa in agg_person_assessments if pa["compliance_state"] in ["NOT_ASSESSABLE", "PARTIALLY_ASSESSED"])
            analysis_summary = f"Assessment incomplete: {na_count} of {len(agg_person_assessments)} worker(s) could not be definitively assessed across {analyzed_count} frames under {resolved_profile} profile."
        else:
            analysis_status = "NO_VIOLATION"
            overall_status = "COMPLIANT"
            analysis_summary = f"Evaluated {len(agg_person_assessments)} worker track(s) across {analyzed_count} frames under {resolved_profile} profile. All assessed required items verified with no confirmed safety violations."

        video_expected_regions = [er for kf in keyframes for er in kf.expected_regions]

        tot_req = sum(len(pa.get("required_ppe", [])) for pa in agg_person_assessments)
        v_pres = sum(1 for pa in agg_person_assessments for it in pa.get("assessments", []) if it.get("status") == "PRESENT")
        v_miss = sum(1 for pa in agg_person_assessments for it in pa.get("assessments", []) if it.get("status") == "MISSING")
        v_na = sum(1 for pa in agg_person_assessments for it in pa.get("assessments", []) if it.get("status") == "NOT_ASSESSABLE")
        v_un = sum(1 for pa in agg_person_assessments for it in pa.get("assessments", []) if it.get("status") == "UNSUPPORTED")

        video_inspection_summary = {
            "persons_detected": len(all_unique_tracks) or len(agg_person_assessments),
            "inspection_profile": resolved_profile,
            "overall_status": overall_status,
            "analysis_status": analysis_status,
            "required_checks": tot_req,
            "present_count": v_pres,
            "missing_count": v_miss,
            "not_assessable_count": v_na,
            "unsupported_count": v_un,
            "compliant_count": sum(1 for pa in agg_person_assessments if pa.get("compliance_state") == "COMPLIANT"),
            "non_compliant_count": sum(1 for pa in agg_person_assessments if pa.get("compliance_state") == "NON-COMPLIANT"),
            "statement": analysis_summary
        }

        return VideoInferenceResponse(
            success=True,
            model_name=self.model_name,
            model_id=self.model_id,
            video_duration_sec=round(duration_sec, 2),
            total_frames=total_video_frames,
            fps=round(video_fps, 1),
            frames_analyzed=analyzed_count,
            processing_time_sec=total_time_sec,
            effective_fps=effective_fps,
            total_persons_detected=len(all_unique_tracks) or len(agg_person_assessments),
            total_tracks=len(all_unique_tracks) or len(agg_person_assessments),
            total_violations_detected=len(all_incident_candidates),
            analysis_status=analysis_status,
            analysis_summary=analysis_summary,
            keyframes=keyframes,
            incident_candidates=all_incident_candidates,
            warnings=[],
            person_assessments=agg_person_assessments,
            expected_regions=video_expected_regions,
            inspection_summary=video_inspection_summary,
            overall_status=overall_status,
            inspection_profile=resolved_profile
        )


SafeVisionInferenceEngine = IndustrialSafetyDetector
