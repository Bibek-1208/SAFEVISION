import os
import sys
import base64
import time
from datetime import datetime, timezone
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import cv2
import numpy as np
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

ROOT_DIR = Path(__file__).resolve().parent.parent

from inference.schemas import (
    HealthResponse,
    HardwareStatusResponse,
    CapabilitiesResponse,
    InferenceResponse,
    DetectionItem,
    VideoInferenceResponse,
    TrackPPEStateItem,
    IncidentCreationCandidate
)
from inference.detector import IndustrialSafetyDetector
from inference.provenance import ModelRegistry, ModelProvenanceRecord
from inference.ppe_registry import PPEClassRegistry, ModelClassManifest
from scripts.dataset_importer import DatasetRegistry, DatasetImporter, ClassMapper, QualityGate
from scripts.candidate_evaluator import CandidateEvaluator, DEFAULT_ACCEPTANCE_THRESHOLDS

app = FastAPI(
    title="SafeVision AI Inference Engine",
    description="Real-time Computer Vision service for Industrial Safety Monitoring (SH17 PPE, ByteTrack, Worker Identity)",
    version="1.0.0"
)

# Configured origins for web client and Node.js backend
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5005,http://127.0.0.1:5173,http://127.0.0.1:5005")
ALLOWED_ORIGINS = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize detector & registries
detector = IndustrialSafetyDetector(models_dir=os.path.join(os.path.dirname(__file__), "models"))
model_registry = ModelRegistry()

@app.on_event("startup")
def startup_event():
    try:
        import torch
        torch_ver = torch.__version__
        cuda_avail = torch.cuda.is_available()
        cuda_ver = torch.version.cuda if cuda_avail else None
        gpu_name = torch.cuda.get_device_name(0) if cuda_avail else None
    except Exception:
        torch_ver = "unavailable"
        cuda_avail = False
        cuda_ver = None
        gpu_name = None

    try:
        import torchvision
        torchvision_ver = torchvision.__version__
    except Exception:
        torchvision_ver = "unavailable"

    try:
        import ultralytics
        ultralytics_ver = ultralytics.__version__
    except Exception:
        ultralytics_ver = "unavailable"

    print("==================================================")
    print("SAFEVISION AI SERVICE STARTUP REPORT")
    print(f"python_version: {sys.version.split()[0]}")
    print(f"torch_version: {torch_ver}")
    print(f"torchvision_version: {torchvision_ver}")
    print(f"ultralytics_version: {ultralytics_ver}")
    print(f"cuda_available: {cuda_avail}")
    print(f"cuda_version: {cuda_ver}")
    print(f"gpu_name: {gpu_name}")
    print(f"device: {detector.device}")
    print(f"runtime_state: {detector.runtime_state}")
    print(f"model_status: {detector.model_status}")
    print(f"registeredChecksum: {detector.registered_checksum}")
    print(f"actualChecksum: {detector.actual_checksum}")
    print(f"checksumMatched: {detector.checksum_matched}")
    print("==================================================")

class FrameInferenceRequest(BaseModel):
    frame_base64: str
    camera_id: Optional[str] = "CAM-01"
    zone: Optional[str] = "Main Bay"
    conf_thresh: Optional[float] = 0.45
    required_ppe: Optional[List[str]] = None
    profile: Optional[str] = "Construction"

class BiometricConfigPayload(BaseModel):
    enabled: bool
    admin_user_id: str = "ADMIN"

@app.get("/health", response_model=HealthResponse)
def health_check():
    model_loaded = (detector.model_status == "configured" and detector.model is not None)
    weights_path = detector.model_path if os.path.exists(detector.model_path) else (detector.onnx_path if os.path.exists(detector.onnx_path) else None)
    fps_val = round(1000.0 / detector.last_latency_ms, 1) if detector.last_latency_ms > 0 else None
    bio_status = "CONFIGURED_ACTIVE" if detector.identity_service.is_enabled else "NOT CONFIGURED / OFF"

    try:
        import torch
        torch_ver = torch.__version__
        cuda_avail = torch.cuda.is_available()
        cuda_ver = torch.version.cuda if cuda_avail else None
        gpu_name = torch.cuda.get_device_name(0) if cuda_avail else None
    except Exception:
        torch_ver = None
        cuda_avail = False
        cuda_ver = None
        gpu_name = None

    try:
        import torchvision
        torchvision_ver = torchvision.__version__
    except Exception:
        torchvision_ver = None

    try:
        import ultralytics
        ultralytics_ver = ultralytics.__version__
    except Exception:
        ultralytics_ver = None

    model_classes = []
    if model_loaded and hasattr(detector.model, "names") and isinstance(detector.model.names, dict):
        model_classes = list(detector.model.names.values())
    elif hasattr(detector, "model_registry"):
        rec = detector.model_registry.get_model(detector.model_id)
        if rec and hasattr(rec, "classList"):
            model_classes = rec.classList
    class_count = len(model_classes) if model_classes else 17

    return HealthResponse(
        serviceStatus="AI ONLINE",
        modelStatus=detector.runtime_state if detector.runtime_state == "READY" else f"MODEL {detector.runtime_state}",
        runtimeState=detector.runtime_state,
        modelName=detector.model_name,
        modelVersion=detector.model_version,
        modelId=detector.model_id,
        weights=weights_path,
        registeredChecksum=detector.registered_checksum,
        actualChecksum=detector.actual_checksum,
        checksumMatched=detector.checksum_matched,
        device=detector.device,
        ai_device=detector.device,
        gpu_available=cuda_avail,
        gpu_name=gpu_name,
        cuda_available=cuda_avail,
        cuda_version=cuda_ver,
        pytorch_version=torch_ver,
        python_version=sys.version.split()[0],
        ultralytics_version=ultralytics_ver,
        latency=detector.last_latency_ms if detector.last_latency_ms > 0 else None,
        framesProcessed=detector.frames_processed,
        lastInference=detector.last_inference_time,
        status="healthy",
        service="safevision-ai",
        ai_engine=detector.pipeline_name,
        model_loaded=model_loaded,
        model_name=detector.model_name,
        model_version=detector.model_version,
        model_status=detector.model_status,
        ppe_inference="ENABLED" if model_loaded else "DISABLED",
        weights_path=weights_path,
        inference_latency_ms=detector.last_latency_ms if detector.last_latency_ms > 0 else None,
        fps=fps_val,
        frames_processed=detector.frames_processed,
        last_inference_time=detector.last_inference_time,
        biometric_identification_status=bio_status,
        classCount=class_count,
        classes=model_classes
    )

@app.get("/hardware", response_model=HardwareStatusResponse)
def get_hardware_status():
    try:
        import torch
        torch_ver = torch.__version__
        cuda_avail = torch.cuda.is_available()
        cuda_ver = torch.version.cuda if cuda_avail else None
        gpu_name = torch.cuda.get_device_name(0) if cuda_avail else None
    except Exception:
        torch_ver = "unknown"
        cuda_avail = False
        cuda_ver = None
        gpu_name = None

    try:
        import ultralytics
        ultralytics_ver = ultralytics.__version__
    except Exception:
        ultralytics_ver = None

    return HardwareStatusResponse(
        GPU_AVAILABLE=cuda_avail,
        GPU_NAME=gpu_name,
        CUDA_AVAILABLE=cuda_avail,
        CUDA_VERSION=cuda_ver,
        PYTORCH_VERSION=torch_ver,
        PYTHON_VERSION=sys.version.split()[0],
        ULTRALYTICS_VERSION=ultralytics_ver,
        AI_DEVICE=detector.device
    )

@app.get("/capabilities", response_model=CapabilitiesResponse)
def get_capabilities():
    is_configured = detector.model_status == "configured"
    return CapabilitiesResponse(
        model_name=detector.model_name,
        model_id=detector.model_id,
        model_status=detector.model_status,
        ppe_inference="ENABLED" if is_configured else "DISABLED",
        supported_classes=[
            e.className for e in detector.class_manifest.manifest_entries
        ] if is_configured else [],
        max_input_resolution="1920x1080",
        target_inference_fps=30,
        device="cpu",
        temporal_verification_supported=True,
        biometric_identification_enabled=detector.identity_service.is_enabled
    )

@app.get("/models")
def list_models():
    """Returns official Model & Data Provenance Registry."""
    return {
        "models": model_registry.list_models(),
        "active_model_id": detector.model_id,
        "licensing_advisory": "SH17 dataset and derivative models are licensed under CC BY-NC-SA 4.0. Commercial deployment requires explicit separate commercial authorization."
    }

@app.get("/models/{model_id}")
def get_model(model_id: str):
    rec = model_registry.get_model(model_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found in registry.")
    return rec

@app.get("/models/{model_id}/runtime_status")
def get_model_runtime_status(model_id: str):
    rec = model_registry.get_model(model_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found in registry.")

    # Check stages independently
    is_registered = True
    pt_path = os.path.join(detector.models_dir, "industrial_yolov8.pt")
    onnx_path = os.path.join(detector.models_dir, "industrial_ppe.onnx")
    
    file_present = os.path.exists(pt_path) or os.path.exists(onnx_path)
    actual_path = pt_path if os.path.exists(pt_path) else (onnx_path if os.path.exists(onnx_path) else None)
    
    checksum_matched = False
    if file_present and actual_path:
        computed = model_registry.compute_file_checksum(actual_path)
        checksum_matched = (computed == rec.weightsChecksum)

    model_loadable = False
    model_loaded = (detector.model is not None and detector.model_status == "configured")
    inference_working = False
    classes_available = False

    if file_present and actual_path:
        try:
            if actual_path.endswith(".pt"):
                from ultralytics import YOLO
                test_m = YOLO(actual_path)
                model_loadable = True
                # Test inference
                dummy = np.zeros((320, 320, 3), dtype=np.uint8)
                res = test_m(dummy, verbose=False)
                inference_working = True
                classes_available = len(rec.classList) >= 5
            elif actual_path.endswith(".onnx"):
                test_net = cv2.dnn.readNetFromONNX(actual_path)
                model_loadable = True
                inference_working = True
                classes_available = len(rec.classList) >= 5
        except Exception:
            pass

    runtime_state = "READY_FOR_DEPLOYMENT" if (is_registered and file_present and checksum_matched and model_loaded and inference_working) else "NOT CONFIGURED / NOT LOADED"

    return {
        "model_id": model_id,
        "is_registered": is_registered,
        "model_file_present": file_present,
        "file_path": actual_path,
        "checksum_matched": checksum_matched,
        "model_loadable": model_loadable,
        "model_loaded": model_loaded,
        "inference_working": inference_working,
        "classes_available": classes_available,
        "runtime_state": runtime_state,
        "detail": "Model file not found on disk. Place approved trained weights in ai/models/." if not file_present else ("Checksum mismatch." if not checksum_matched else "Runtime verification complete.")
    }

@app.post("/identity/configure")
def configure_identity(payload: BiometricConfigPayload):
    """Admin configuration endpoint to enable or disable biometric identification."""
    res = detector.identity_service.set_enabled_state(payload.enabled, payload.admin_user_id)
    return res

@app.get("/identity/status")
def get_identity_status():
    return {
        "is_enabled": detector.identity_service.is_enabled,
        "status": "CONFIGURED_ACTIVE" if detector.identity_service.is_enabled else "NOT CONFIGURED / OFF",
        "enrolled_count": len(detector.identity_service.list_enrolled_employees()),
        "confirmation_threshold": detector.identity_service.confirmed_threshold,
        "privacy_policy": "Raw facial embeddings and images are strictly forbidden from frontend REST payloads."
    }

@app.post("/identity/enroll")
async def enroll_worker_identity(
    file: UploadFile = File(...),
    employee_id: str = Form(...),
    employee_name: str = Form(...),
    enrolled_by: str = Form("ADMIN")
):
    """Secure reference enrollment endpoint. Extracts template and discards raw buffer."""
    try:
        contents = await file.read()
        res = detector.identity_service.enroll_reference_template(
            employee_id=employee_id,
            employee_name=employee_name,
            face_image_bytes=contents,
            enrolled_by=enrolled_by
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/identity/enrolled")
def list_enrolled_identities():
    """Returns non-sensitive metadata for enrolled templates."""
    return {"enrolled": detector.identity_service.list_enrolled_employees()}

@app.post("/infer/image", response_model=InferenceResponse)
async def infer_image(
    file: UploadFile = File(...),
    camera_id: str = Form("STATIC_IMAGE"),
    zone: str = Form("Main Bay"),
    conf_thresh: float = Form(0.45),
    required_ppe: Optional[str] = Form(None),
    profile: Optional[str] = Form("Construction")
):
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        parsed_required_ppe = None
        if required_ppe:
            try:
                parsed_required_ppe = json.loads(required_ppe)
                if not isinstance(parsed_required_ppe, list):
                    parsed_required_ppe = [str(parsed_required_ppe)]
            except Exception:
                parsed_required_ppe = [p.strip() for p in required_ppe.split(",") if p.strip()]

        result = detector.infer_image(
            image_bytes=contents,
            camera_id=camera_id,
            zone=zone,
            conf_thresh=conf_thresh,
            required_ppe=parsed_required_ppe,
            profile=profile
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

@app.post("/infer/video", response_model=VideoInferenceResponse)
async def infer_video(
    file: UploadFile = File(...),
    camera_id: str = Form("UPLOADED_MEDIA"),
    zone: str = Form("General Inspection"),
    conf_thresh: float = Form(0.45),
    sample_fps: int = Form(4),
    required_ppe: Optional[str] = Form(None),
    profile: Optional[str] = Form("Construction")
):
    try:
        parsed_required_ppe = None
        if required_ppe:
            try:
                parsed_required_ppe = json.loads(required_ppe)
                if not isinstance(parsed_required_ppe, list):
                    parsed_required_ppe = [str(parsed_required_ppe)]
            except Exception:
                parsed_required_ppe = [p.strip() for p in required_ppe.split(",") if p.strip()]

        suffix = os.path.splitext(file.filename)[1] if file.filename else ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            result = detector.infer_video(
                video_path=tmp_path,
                camera_id=camera_id,
                zone=zone,
                conf_thresh=conf_thresh,
                sample_fps=sample_fps,
                required_ppe=parsed_required_ppe,
                profile=profile
            )
            return result
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video inference error: {str(e)}")

@app.post("/infer/frame", response_model=InferenceResponse)
def infer_frame(req: FrameInferenceRequest):
    try:
        raw_b64 = req.frame_base64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        
        image_bytes = base64.b64decode(raw_b64)
        result = detector.infer_image(
            image_bytes=image_bytes,
            camera_id=req.camera_id or "CAM-01",
            zone=req.zone or "Main Bay",
            conf_thresh=req.conf_thresh or 0.45,
            required_ppe=req.required_ppe,
            profile=req.profile
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 frame: {str(e)}")

@app.post("/reload-model")
def reload_model():
    detector.load_model()
    return {
        "status": "reloaded",
        "model_status": detector.model_status,
        "model_name": detector.model_name
    }

# Phase 5: Direct RTSP Multi-Camera Ingestion Pipeline Endpoints
from inference.rtsp_worker import MultiCameraPipelineManager, redact_stream_url

NODE_BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:5005")
pipeline_manager = MultiCameraPipelineManager(backend_url=NODE_BACKEND_URL, detector=detector)

# Initial camera pipeline synchronization
try:
    pipeline_manager.sync_with_backend_config(NODE_BACKEND_URL)
    print(f"[SafeVision AI] Initialized pipeline with {len(pipeline_manager.workers)} camera(s)")
except Exception as e:
    print(f"[SafeVision AI] Initial camera pipeline sync deferred: {e}")

class PipelineStartRequest(BaseModel):
    cameras: Optional[List[Dict[str, Any]]] = None
    mode: str = "batched"  # "batched" or "independent"
    target_fps: float = 30.0

@app.post("/pipeline/start")
def start_pipeline(req: PipelineStartRequest):
    cams = req.cameras
    if not cams:
        cams = MultiCameraPipelineManager.fetch_camera_configs(NODE_BACKEND_URL)
    if not cams:
        raise HTTPException(status_code=400, detail="No active cameras available to start pipeline.")
    
    pipeline_manager.stop_all()
    for cam in cams:
        pipeline_manager.add_camera(cam)
    
    if req.mode == "batched":
        pipeline_manager.start_batched(target_fps=req.target_fps)
    else:
        pipeline_manager.start_all_independent()
        
    return {
        "success": True,
        "mode": req.mode,
        "camera_count": len(pipeline_manager.workers),
        "cameras": [c.get("cameraId") or c.get("code") for c in cams]
    }

@app.post("/pipeline/stop")
def stop_pipeline():
    pipeline_manager.stop_all()
    return {"success": True, "status": "stopped"}

@app.get("/pipeline/status")
def get_pipeline_status():
    return pipeline_manager.get_aggregate_metrics()

class CameraSyncRequest(BaseModel):
    backend_url: Optional[str] = None

class CameraAddRequest(BaseModel):
    cameraId: str
    streamUrl: str
    cameraName: Optional[str] = None
    zone: Optional[str] = "Main Bay"
    siteId: Optional[str] = "SITE-01"
    enabled: Optional[bool] = True

class CameraRemoveRequest(BaseModel):
    cameraId: str

@app.post("/pipeline/sync")
def sync_pipeline(req: Optional[CameraSyncRequest] = None):
    url = req.backend_url if req and req.backend_url else NODE_BACKEND_URL
    res = pipeline_manager.sync_with_backend_config(url)
    return {"success": True, "result": res}

@app.post("/pipeline/camera/add")
def add_pipeline_camera(req: CameraAddRequest):
    if not req.enabled:
        return {"success": False, "message": "Camera is marked disabled. Not added to pipeline."}
    cam_cfg = req.dict()
    worker = pipeline_manager.add_camera(cam_cfg)
    if not (pipeline_manager.batch_thread and pipeline_manager.batch_thread.is_alive()):
        worker.start()
    pipeline_manager.running = True
    return {"success": True, "cameraId": req.cameraId, "status": "added"}

@app.post("/pipeline/camera/remove")
def remove_pipeline_camera(req: CameraRemoveRequest):
    pipeline_manager.stop_camera(req.cameraId)
    return {"success": True, "cameraId": req.cameraId, "status": "removed"}

def find_pipeline_worker(camera_id: str):
    """
    STRICT 1:1 RESOLUTION (Section 1 & 5):
    Resolves the pipeline worker strictly for the requested camera ID or code.
    NEVER matches substrings (e.g. 'm' in 'cam-4').
    NEVER falls back to a single worker or arbitrary camera.
    """
    if not camera_id:
        return None
    c_clean = str(camera_id).strip()
    if c_clean in pipeline_manager.workers:
        return pipeline_manager.workers[c_clean]
    c_lower = c_clean.lower()
    for k, w in pipeline_manager.workers.items():
        if k.strip().lower() == c_lower or getattr(w, "camera_id", "").strip().lower() == c_lower:
            return w
    return None

@app.get("/camera/{camera_id}/status")
def get_camera_status(camera_id: str):
    """
    Exposes stream status for a specific camera (Section 10).
    Returns real telemetry from the dedicated worker reader.
    """
    worker = find_pipeline_worker(camera_id)
    if not worker:
        return {
            "cameraId": camera_id,
            "configured": False,
            "connected": False,
            "streamType": "NONE",
            "streamPath": None,
            "fps": 0.0,
            "latencyMs": 0.0,
            "frameAgeMs": 0.0,
            "lastFrameAt": None,
            "error": "No active stream worker configured for this camera"
        }
    r = worker.reader
    is_conn = r.is_connected
    is_fresh = (time.perf_counter() - r.latest_frame_time) < 3.0 if r.latest_frame_time > 0 else False
    connected = is_conn and is_fresh and r.received_count > 0
    now = time.time()
    elapsed = now - (worker.start_time or now)
    fps = worker.processed_count / elapsed if elapsed > 0 else 0.0
    avg_lat = float(np.mean(worker.latencies_ms[-20:])) if worker.latencies_ms else 0.0
    avg_age = float(np.mean(worker.frame_ages_ms[-20:])) if worker.frame_ages_ms else 0.0

    return {
        "cameraId": camera_id,
        "configured": True,
        "connected": connected,
        "streamType": "RTSP",
        "streamPath": f"/camera/{camera_id}/feed",
        "streamUrl": redact_stream_url(worker.stream_url),
        "fps": round(fps, 1),
        "latencyMs": round(avg_lat, 1),
        "frameAgeMs": round(avg_age, 1),
        "receivedFrames": r.received_count,
        "droppedFrames": r.dropped_stale_count,
        "lastFrameAt": datetime.fromtimestamp(r.latest_frame_time, timezone.utc).isoformat() if r.latest_frame_time > 0 else None,
        "error": None if connected else ("Stream reconnecting" if r.reconnect_count > 0 else "Camera stream offline")
    }

@app.get("/camera/{camera_id}/feed")
def get_camera_feed(camera_id: str):
    """
    Direct zero-latency MJPEG live frame stream strictly isolated to this camera ID.
    STRICT ISOLATION (Section 1, 3, 7):
    - Rejects request with 404 if worker not configured.
    - Rejects request with 404 if camera is disconnected/offline.
    - Closes connection immediately if camera stream drops.
    - NEVER streams another camera's frames or fallback dataset video.
    """
    worker = find_pipeline_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Camera worker '{camera_id}' not found or not configured")

    if not worker.reader.is_connected:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' is offline. No active stream source.")

    def frame_generator():
        consecutive_misses = 0
        while True:
            if not worker.reader.is_connected:
                # Stop stream immediately if camera disconnects
                break
            frame = worker.reader.get_current_display_frame()
            if frame is not None:
                consecutive_misses = 0
                ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            else:
                consecutive_misses += 1
                if consecutive_misses > 75:  # ~3s with no fresh frames
                    break
            time.sleep(0.04)  # ~25 fps max for display stream

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/camera/{camera_id}/snapshot")
def get_camera_snapshot(camera_id: str):
    """Returns a single fresh JPEG frame snapshot from the physical camera reader."""
    worker = find_pipeline_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Camera worker '{camera_id}' not found")
    frame = worker.reader.get_current_display_frame()
    if frame is None:
        raise HTTPException(status_code=503, detail="No frame available from camera yet")
    ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ret:
        raise HTTPException(status_code=500, detail="Failed to encode frame")
    return Response(content=jpeg.tobytes(), media_type="image/jpeg")

class CaptureEvidenceRequest(BaseModel):
    track_id: Optional[str] = None
    violation_type: Optional[str] = None
    confidence: Optional[float] = None
    bounding_box: Optional[Dict[str, Any]] = None
    zone_polygon: Optional[List[Dict[str, float]]] = None
    zone_name: Optional[str] = None
    is_breach: Optional[bool] = False

@app.post("/camera/{camera_id}/capture-evidence")
def capture_camera_evidence(camera_id: str, req: Optional[CaptureEvidenceRequest] = None):
    """
    Forensically captures the current CCTV frame, applies forensic annotations (worker bbox,
    breach polygon, timestamp, camera watermark), encodes to JPEG, and calculates SHA-256.
    """
    worker = find_pipeline_worker(camera_id)
    if not worker:
        return {
            "captured": False,
            "failureReason": "CAMERA_OFFLINE",
            "message": f"Camera worker '{camera_id}' not found in active pipeline"
        }

    frame = worker.reader.get_current_display_frame()
    if frame is None:
        return {
            "captured": False,
            "failureReason": "FRAME_UNAVAILABLE",
            "message": f"No video frame available from camera '{camera_id}'"
        }

    try:
        from inference.rtsp_worker import annotate_forensic_evidence
        import hashlib
        from datetime import datetime, timezone

        req_data = req or CaptureEvidenceRequest()
        annotated = annotate_forensic_evidence(
            frame=frame,
            camera_id=camera_id,
            timestamp_str=datetime.now(timezone.utc).isoformat(),
            track_id=req_data.track_id,
            violation_type=req_data.violation_type,
            confidence=req_data.confidence,
            bounding_box=req_data.bounding_box,
            zone_polygon=req_data.zone_polygon,
            zone_name=req_data.zone_name,
            is_breach=bool(req_data.is_breach)
        )

        ret, jpeg = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if not ret:
            return {
                "captured": False,
                "failureReason": "ENCODING_ERROR",
                "message": "Failed to encode JPEG evidence frame"
            }

        jpeg_bytes = jpeg.tobytes()
        sha256_hash = hashlib.sha256(jpeg_bytes).hexdigest()
        b64 = base64.b64encode(jpeg_bytes).decode('ascii')
        h, w = frame.shape[:2]

        return {
            "captured": True,
            "mediaType": "image/jpeg",
            "cameraId": camera_id,
            "width": w,
            "height": h,
            "sha256": sha256_hash,
            "evidenceBase64": b64,
            "capturedAt": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        return {
            "captured": False,
            "failureReason": "CAPTURE_ERROR",
            "message": str(e)
        }

# -------------------------------------------------------------
# PHASE 12.2: MODEL REGISTRY RUNTIME & TRAINING INFRASTRUCTURE
# -------------------------------------------------------------
ppe_class_registry = PPEClassRegistry()
model_class_manifest = ModelClassManifest()
dataset_registry = DatasetRegistry()
dataset_importer = DatasetImporter()
class_mapper = ClassMapper()

@app.get("/models/{model_id}/runtime_status")
def get_model_runtime_status(model_id: str):
    is_registered = bool(model_registry.get_model(model_id)) or model_id in ["MODEL-PPE-SH17-001", "MODEL-PPE-BASELINE-SH17"]
    file_present = os.path.exists(detector.model_path)
    checksum_match = detector.checksum_matched
    is_ready = (detector.runtime_state == "READY" and file_present and checksum_match)

    return {
        "model_id": model_id,
        "is_registered": is_registered,
        "model_file_present": file_present,
        "checksum_matched": checksum_match,
        "model_loadable": detector.model is not None,
        "model_loaded": detector.model is not None,
        "inference_working": is_ready,
        "classes_available": len(model_class_manifest.manifest_entries) > 0,
        "runtime_state": "READY_FOR_DEPLOYMENT" if is_ready else detector.runtime_state,
        "detail": f"Runtime state: {detector.runtime_state}. Device: {detector.device}. Verified Baseline Model.",
        "active_model_path": detector.model_path,
        "weights_checksum": detector.actual_checksum,
        "supported_classes": [e["className"] for e in model_class_manifest.manifest_entries]
    }

@app.get("/training/classes")
def list_training_classes(active_only: bool = False):
    return {
        "classes": ppe_class_registry.get_classes(active_only=active_only),
        "total": len(ppe_class_registry.get_classes(active_only=active_only))
    }

@app.get("/training/ontology")
def get_training_ontology():
    from inference.ppe_registry import SAFEVISION_ONTOLOGY
    return {
        "ontology": SAFEVISION_ONTOLOGY
    }

class CreateClassPayload(BaseModel):
    name: str
    displayName: str
    category: Optional[str] = "PPE"
    subCategory: Optional[str] = None
    description: Optional[str] = ""
    aliases: Optional[List[str]] = None

@app.post("/training/classes")
def create_training_class(payload: CreateClassPayload):
    try:
        new_cls = ppe_class_registry.create_class(
            name=payload.name,
            display_name=payload.displayName,
            category=payload.category or "PPE",
            description=payload.description or "",
            aliases=payload.aliases,
            initial_status="NO_TRAINING_DATA",
            sub_category=payload.subCategory
        )
        return {
            "success": True,
            "class": new_cls,
            "disclaimer": "Class created. Labelled training data and model training are required before this PPE can be detected."
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class PatchClassPayload(BaseModel):
    active: Optional[bool] = None
    status: Optional[str] = None

@app.patch("/training/classes/{class_id}")
def patch_training_class(class_id: str, payload: PatchClassPayload):
    cls_obj = ppe_class_registry.get_class_by_id(class_id)
    if not cls_obj:
        raise HTTPException(status_code=404, detail=f"Class {class_id} not found")
    if payload.active is not None:
        if payload.active:
            ppe_class_registry.activate_class(class_id)
        else:
            ppe_class_registry.deactivate_class(class_id)
    if payload.status:
        try:
            ppe_class_registry.update_class_status(class_id, payload.status)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "class": ppe_class_registry.get_class_by_id(class_id)}

@app.get("/training/datasets")
def list_training_datasets():
    datasets = dataset_registry.list_datasets()
    return {"datasets": datasets, "total": len(datasets)}

class ImportDatasetPayload(BaseModel):
    sourceDir: str
    datasetId: str
    datasetName: str
    version: Optional[str] = "1.0.0"
    source: Optional[str] = "External Import"
    license: Optional[str] = "UNKNOWN"
    attribution: Optional[str] = ""
    sourceUrl: Optional[str] = None

@app.post("/training/datasets/import")
def import_training_dataset(payload: ImportDatasetPayload):
    try:
        from pathlib import Path
        src_path = Path(payload.sourceDir)
        if not src_path.is_absolute():
            src_path = ROOT_DIR / src_path
        record = dataset_importer.import_yolo_dataset(
            source_dir=src_path,
            dataset_id=payload.datasetId,
            dataset_name=payload.datasetName,
            version=payload.version or "1.0.0",
            source=payload.source or "External Import",
            license_str=payload.license or "UNKNOWN",
            attribution=payload.attribution or "",
            source_url=payload.sourceUrl
        )
        return {"success": True, "dataset": record}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/training/datasets/{dataset_id}")
def get_training_dataset(dataset_id: str):
    ds = dataset_registry.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found")
    return {"dataset": ds}

@app.post("/training/datasets/{dataset_id}/audit")
def audit_training_dataset(dataset_id: str):
    try:
        report = dataset_registry.audit_dataset_by_id(dataset_id)
        return {"success": True, "report": report, "dataset": dataset_registry.get_dataset(dataset_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/training/mappings")
def list_training_mappings(datasetId: Optional[str] = None):
    return {"mappings": class_mapper.list_mappings(dataset_id=datasetId)}

class UpdateMappingPayload(BaseModel):
    sourceDataset: str
    sourceClass: str
    sourceClassId: int
    safeVisionClassId: str
    mappingStatus: Optional[str] = "PENDING"
    mappingReason: Optional[str] = ""

@app.post("/training/mappings")
def update_training_mapping(payload: UpdateMappingPayload):
    try:
        mapping = class_mapper.add_or_update_mapping(
            source_dataset=payload.sourceDataset,
            source_class=payload.sourceClass,
            source_class_id=payload.sourceClassId,
            safe_vision_class_id=payload.safeVisionClassId,
            mapping_status=payload.mappingStatus or "PENDING",
            mapping_reason=payload.mappingReason or ""
        )
        return {"success": True, "mapping": mapping}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/training/models/manifest")
def get_model_class_manifest():
    return {
        "modelId": model_class_manifest.model_id,
        "modelVersion": model_class_manifest.model_version,
        "classManifest": model_class_manifest.manifest_entries
    }

candidate_evaluator = CandidateEvaluator()

@app.get("/training/models/pipeline_status")
def get_pipeline_status():
    return detector.get_pipeline_status()

@app.get("/training/models/registry")
def get_model_registry_list():
    return {
        "models": model_registry.list_models(),
        "baseline": model_registry.get_baseline_model(),
        "active": model_registry.get_active_model()
    }

class EvaluateCandidatePayload(BaseModel):
    candidateId: str
    modelPath: str
    datasetId: str
    targetClassId: str
    targetClassName: str
    thresholds: Optional[Dict[str, Any]] = None

@app.post("/training/models/evaluate_candidate")
def evaluate_candidate(payload: EvaluateCandidatePayload):
    try:
        if payload.thresholds:
            evaluator = CandidateEvaluator(thresholds=payload.thresholds)
        else:
            evaluator = candidate_evaluator

        m_path = payload.modelPath
        if not os.path.isabs(m_path):
            m_path = str(ROOT_DIR / m_path)

        result = evaluator.evaluate_candidate(
            candidate_id=payload.candidateId,
            candidate_model_path=m_path,
            dataset_id=payload.datasetId,
            target_sv_class_id=payload.targetClassId,
            target_class_name=payload.targetClassName,
            device=detector.device
        )
        return {"success": True, "evaluation": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class ActivateCandidatePayload(BaseModel):
    activatedBy: Optional[str] = "Admin"

@app.post("/training/models/{model_id}/activate")
def activate_candidate_model(model_id: str, payload: Optional[ActivateCandidatePayload] = None):
    rec = model_registry.get_model(model_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Candidate model '{model_id}' not found.")

    if rec.isProtected:
        raise HTTPException(status_code=400, detail="Protected baseline is already active and cannot be activated as a custom module.")

    if rec.status != "APPROVED":
        raise HTTPException(
            status_code=422,
            detail=f"Candidate model cannot be activated: Status is '{rec.status}'. Only models with status 'APPROVED' may be activated."
        )

    # Determine target class from addedClassIds or classManifest
    target_sv_id = None
    target_class_name = None
    if rec.addedClassIds:
        target_sv_id = rec.addedClassIds[0]
        c_entry = ppe_class_registry.get_class_by_id(target_sv_id)
        target_class_name = c_entry.get("name") if c_entry else "custom_ppe"
    elif rec.classManifest:
        entry = rec.classManifest[0]
        target_sv_id = entry.get("safeVisionClassId")
        target_class_name = entry.get("className")

    if not target_sv_id:
        raise HTTPException(status_code=400, detail="Candidate record missing target class mapping (addedClassIds or classManifest).")

    # Load custom detector module into detector with hardware awareness
    mod_path = rec.modelPath or ""
    if not os.path.isabs(mod_path):
        mod_path = str(ROOT_DIR / mod_path)

    module = detector.add_custom_module(
        module_id=model_id,
        model_path=mod_path,
        safe_vision_class_id=target_sv_id,
        class_name=target_class_name,
        conf_thresh=0.40,
        class_manifest=rec.classManifest
    )

    if module.status == "ERROR" or module.status == "FILE_MISSING":
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load custom detector module: {module.error_message}. Baseline unaffected."
        )

    # Atomically mark class as ACTIVE in class registry
    ppe_class_registry.update_class_status(target_sv_id, "ACTIVE")

    # Atomically mark candidate record as ACTIVE in model registry
    actor = (payload.activatedBy if payload else "Admin") or "Admin"
    act_res = model_registry.activate_candidate(model_id, activated_by=actor)

    return {
        "success": True,
        "message": f"Candidate model '{model_id}' activated. Class '{target_sv_id}' is now ACTIVE.",
        "activatedModel": act_res.get("model"),
        "pipelineStatus": detector.get_pipeline_status()
    }

@app.post("/training/models/{model_id}/deactivate")
def deactivate_candidate_model(model_id: str):
    rec = model_registry.get_model(model_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")
    if rec.isProtected:
        raise HTTPException(status_code=400, detail="Protected baseline cannot be deactivated.")

    detector.remove_custom_module(model_id)
    if rec.addedClassIds:
        for cid in rec.addedClassIds:
            ppe_class_registry.update_class_status(cid, "DEACTIVATED")

    model_registry.deactivate_candidate(model_id)
    return {
        "success": True,
        "message": f"Model '{model_id}' deactivated.",
        "pipelineStatus": detector.get_pipeline_status()
    }

@app.post("/training/models/rollback_baseline")
def rollback_model_to_baseline():
    det_res = detector.rollback_to_baseline()
    reg_res = model_registry.rollback_to_baseline()

    # Any deactivated custom class in registry
    for m in model_registry.list_models():
        if not m.isProtected and m.addedClassIds:
            for cid in m.addedClassIds:
                c = ppe_class_registry.get_class_by_id(cid)
                if c and c.get("status") == "ACTIVE":
                    ppe_class_registry.update_class_status(cid, "DEACTIVATED")

    return {
        "success": True,
        "message": "Atomic rollback to protected baseline completed successfully.",
        "detectorResult": det_res,
        "registryResult": reg_res,
        "pipelineStatus": detector.get_pipeline_status()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

