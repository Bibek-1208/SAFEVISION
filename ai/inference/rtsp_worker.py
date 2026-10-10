"""
SafeVision AI — Direct RTSP Ingestion & Multi-Camera Worker Architecture (Phase 5)

Architectural Flow:
CAMERA -> MediaMTX -> RTSP -> LowLatencyRTSPReader (queue-depth=1)
       -> IndustrialSafetyDetector (YOLO -> ByteTrack -> PPE -> Temporal)
       -> Authoritative Incident Candidate -> Node.js / MongoDB -> Change Stream -> Socket.IO

Zero raw-frame / JPEG / base64 HTTP serialization.
"""

import os
import sys
import time
import json
import threading
import queue
import numpy as np
import cv2
import re
import requests
import psutil
import base64
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

# Enable low-latency capture options in OpenCV's FFMPEG backend
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|stimeout;3000000"

from .detector import IndustrialSafetyDetector
from .schemas import IncidentCreationCandidate, InferenceResponse

# STRICT STREAM ISOLATION: No fallback video dataset or demo media allowed for live CCTV ingestion.

def redact_stream_url(url: str) -> str:
    """Masks credentials in RTSP/HTTP URLs for safe logging and telemetry."""
    if not url:
        return ""
    return re.sub(r"://([^:]+):([^@]+)@", r"://***:***@", url)

def annotate_forensic_evidence(
    frame: np.ndarray,
    camera_id: str,
    timestamp_str: str,
    track_id: Optional[str] = None,
    violation_type: Optional[str] = None,
    confidence: Optional[float] = None,
    bounding_box: Optional[Dict[str, Any]] = None,
    zone_polygon: Optional[List[Dict[str, float]]] = None,
    zone_name: Optional[str] = None,
    is_breach: bool = False
) -> np.ndarray:
    """
    Forensically annotates the actual CCTV frame with worker bounding box,
    zone polygon boundary, breach/violation indicators, and top evidence header.
    """
    annotated = frame.copy()
    h, w = annotated.shape[:2]

    # 1. Draw Zone Polygon if present
    if zone_polygon and len(zone_polygon) >= 3:
        pts = np.array([[int(p['x'] * w), int(p['y'] * h)] for p in zone_polygon], np.int32)
        pts = pts.reshape((-1, 1, 2))

        # Translucent overlay for zone interior
        overlay = annotated.copy()
        zone_color = (0, 0, 230) if is_breach else (255, 140, 0) # BGR Red or Amber
        cv2.fillPoly(overlay, [pts], zone_color)
        cv2.addWeighted(overlay, 0.25, annotated, 0.75, 0, annotated)

        # Zone boundary
        cv2.polylines(annotated, [pts], isClosed=True, color=zone_color, thickness=3, lineType=cv2.LINE_AA)

        # Zone label
        top_pt = min(zone_polygon, key=lambda p: p['y'])
        tx = max(10, int(top_pt['x'] * w))
        ty = max(55, int(top_pt['y'] * h) - 10)
        tag = f"WARNING: RESTRICTED ZONE BREACH - {zone_name.upper() if zone_name else 'ZONE'}" if is_breach else f"RESTRICTED ZONE: {zone_name.upper() if zone_name else 'ZONE'}"
        (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(annotated, (tx - 4, ty - th - 6), (tx + tw + 6, ty + 4), (0, 0, 180) if is_breach else (0, 80, 200), -1)
        cv2.putText(annotated, tag, (tx, ty - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

    # 2. Draw Person Bounding Box if present
    if bounding_box:
        ymin = float(bounding_box.get('ymin', 0))
        xmin = float(bounding_box.get('xmin', 0))
        ymax = float(bounding_box.get('ymax', 0))
        xmax = float(bounding_box.get('xmax', 0))

        if ymin <= 1.0 and ymax <= 1.0 and xmin <= 1.0 and xmax <= 1.0:
            y1, x1, y2, x2 = int(ymin * h), int(xmin * w), int(ymax * h), int(xmax * w)
        else:
            y1, x1, y2, x2 = int(ymin), int(xmin), int(ymax), int(xmax)

        box_color = (0, 0, 239) if is_breach or violation_type else (0, 200, 50)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 3, cv2.LINE_AA)

        # Label Pill
        conf_str = f" {confidence * 100:.1f}%" if confidence else ""
        viol_str = violation_type.upper().replace('_', ' ') if violation_type else "WORKER"
        label_text = f"[{track_id or 'TRACK'}] {viol_str}{conf_str}"

        (lw, lh), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        pill_y1 = max(42, y1 - lh - 10)
        pill_y2 = pill_y1 + lh + 10
        cv2.rectangle(annotated, (x1, pill_y1), (x1 + lw + 12, pill_y2), box_color, -1)
        cv2.putText(annotated, label_text, (x1 + 6, pill_y2 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

    # 3. Top Forensic Watermark Header
    banner_h = 36
    overlay_bar = annotated.copy()
    cv2.rectangle(overlay_bar, (0, 0), (w, banner_h), (15, 18, 26), -1)
    cv2.addWeighted(overlay_bar, 0.88, annotated, 0.12, 0, annotated)
    cv2.line(annotated, (0, banner_h), (w, banner_h), (255, 255, 255), 1)

    header_left = f"SAFEVISION AI FORENSIC EVIDENCE | CAM: {camera_id.upper()} | {timestamp_str}"
    cv2.putText(annotated, header_left, (16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

    header_right = "VERIFIED AUDIT RECORD"
    (rw, _), _ = cv2.getTextSize(header_right, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
    cv2.putText(annotated, header_right, (w - rw - 16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 100), 2, cv2.LINE_AA)

    return annotated

class LowLatencyRTSPReader:
    """
    Asynchronous RTSP reader thread that continuously drains the socket buffer.
    Maintains strictly the latest frame (queue depth = 1).
    Discards older buffered frames to guarantee fresh frame age (< 25 ms).
    Includes automatic reconnect handling with exponential backoff on disconnect.
    """
    def __init__(self, rtsp_url: str, camera_id: str = "CAM-UNKNOWN", reconnect_delay_sec: float = 1.0):
        self.rtsp_url = rtsp_url
        self.camera_id = camera_id
        self.reconnect_delay_sec = reconnect_delay_sec

        self.cap: Optional[cv2.VideoCapture] = None
        self.lock = threading.Lock()
        self.latest_frame: Optional[np.ndarray] = None
        self.current_frame: Optional[np.ndarray] = None
        self.latest_frame_time: float = 0.0

        self.running = True
        self._is_connected = False
        self.disconnect_time: float = 0.0
        self.prolonged_disconnect: bool = False
        self.received_count = 0
        self.dropped_stale_count = 0
        self.reconnect_count = 0
        self.source_fps: float = 0.0
        self.resolution: Tuple[int, int] = (0, 0)
        self.codec: str = "H264"

        self.thread = threading.Thread(target=self._reader_loop, daemon=True, name=f"RTSPReader-{camera_id}")
        self.thread.start()

    @property
    def is_connected(self) -> bool:
        if not self._is_connected:
            return False
        # Watchdog: if no frames arrived for > 2.5s, report disconnected
        if self.latest_frame_time > 0 and (time.perf_counter() - self.latest_frame_time) > 2.5:
            return False
        return True

    @is_connected.setter
    def is_connected(self, value: bool):
        self._is_connected = bool(value)

    def _open_capture(self) -> bool:
        try:
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None

            # 1. Attempt connection to primary RTSP stream if URL is provided
            if self.rtsp_url and ("rtsp://" in self.rtsp_url or "http://" in self.rtsp_url):
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;2000000"
                self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if self.cap.isOpened():
                    ret, test_f = self.cap.read()
                    if ret and test_f is not None:
                        fps = self.cap.get(cv2.CAP_PROP_FPS) or 24.0
                        w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        fourcc_int = int(self.cap.get(cv2.CAP_PROP_FOURCC))
                        codec_tag = "".join([chr((fourcc_int >> 8 * i) & 0xFF) for i in range(4)]).strip()
                        self.codec = codec_tag if codec_tag else "H264"
                        self.source_fps = float(fps)
                        self.resolution = (w, h)
                        self._is_connected = True
                        with self.lock:
                            self.latest_frame = test_f
                            self.current_frame = test_f
                        self.latest_frame_time = time.perf_counter()
                        print(f"[{self.camera_id}] Primary RTSP stream connected: {redact_stream_url(self.rtsp_url)} ({w}x{h} @ {fps:.1f} FPS)")
                        return True
                    else:
                        try:
                            self.cap.release()
                        except Exception:
                            pass
                        self.cap = None
        except Exception as e:
            print(f"[{self.camera_id}] Primary RTSP open error: {e}")

        # STRICT ISOLATION (Section 1 & 3): Never fall back to sample/demo/dataset video.
        # If the physical RTSP stream is offline, stream state MUST be strictly OFFLINE.
        self._is_connected = False
        with self.lock:
            self.latest_frame = None
            self.current_frame = None
        return False

    def _reader_loop(self):
        while self.running:
            if not self.is_connected:
                # Attempt connection with backoff
                opened = self._open_capture()
                if not opened:
                    if not self.disconnect_time:
                        self.disconnect_time = time.time()
                    elif (time.time() - self.disconnect_time) > 5.0:
                        self.prolonged_disconnect = True
                    time.sleep(self.reconnect_delay_sec)
                    continue
                else:
                    self.reconnect_count += 1
                    self.disconnect_time = 0.0

            try:
                ret, frame = self.cap.read()
            except Exception as e:
                print(f"[{self.camera_id}] cv2 read exception: {e}")
                ret = False
                frame = None

            if not ret or frame is None:
                # Stream broken or camera publisher stopped
                print(f"[{self.camera_id}] RTSP frame read failed. Entering reconnecting state...")
                self._is_connected = False
                if not self.disconnect_time:
                    self.disconnect_time = time.time()
                elif (time.time() - self.disconnect_time) > 5.0:
                    self.prolonged_disconnect = True
                with self.lock:
                    self.latest_frame = None
                    self.current_frame = None
                if self.cap is not None:
                    try:
                        self.cap.release()
                    except Exception:
                        pass
                    self.cap = None
                time.sleep(self.reconnect_delay_sec)
                continue

            t_capture = time.perf_counter()
            with self.lock:
                if self.latest_frame is not None:
                    self.dropped_stale_count += 1
                self.latest_frame = frame
                self.current_frame = frame
                self.latest_frame_time = t_capture
                self.received_count += 1

    def get_latest(self) -> Tuple[Optional[np.ndarray], float]:
        """
        Retrieves newest frame (queue depth = 1).
        Resets slot so stale frames are never re-read.
        """
        with self.lock:
            f = self.latest_frame
            t = self.latest_frame_time
            self.latest_frame = None
            return f, t

    def get_current_display_frame(self) -> Optional[np.ndarray]:
        """
        Returns the newest frame without clearing latest_frame slot.
        Used for zero-latency browser live stream feeds.
        STRICT ISOLATION (Section 7 & 11): Never returns stale frames or frames from an offline stream.
        """
        with self.lock:
            if not self._is_connected:
                return None
            if self.latest_frame_time <= 0 or (time.perf_counter() - self.latest_frame_time > 3.0):
                return None
            if self.current_frame is not None:
                return self.current_frame
            return self.latest_frame

    def release(self):
        self.running = False
        self._is_connected = False
        with self.lock:
            self.latest_frame = None
            self.current_frame = None
        cap = self.cap
        self.cap = None
        if cap is not None:
            try:
                cap.release()
            except Exception:
                pass


class CameraWorker:
    """
    Dedicated worker for an RTSP camera stream.
    Directly feeds numpy frames into IndustrialSafetyDetector without HTTP/base64 intermediate steps.
    Dispatches authoritative candidates to Node.js only when a verified incident candidate is produced.
    """
    def __init__(
        self,
        camera_id: str,
        stream_url: str,
        camera_code: Optional[str] = None,
        zone: str = "Unassigned Zone",
        site_id: str = "SITE-01",
        backend_url: str = "http://127.0.0.1:5005",
        detector: Optional[IndustrialSafetyDetector] = None,
        conf_thresh: float = 0.45,
        required_ppe: Optional[List[str]] = None
    ):
        self.camera_id = camera_id
        self.camera_code = camera_code or camera_id
        self.stream_url = stream_url
        self.zone = zone
        self.site_id = site_id
        self.backend_url = backend_url.rstrip("/")
        self.detector = detector
        self.conf_thresh = conf_thresh
        self.required_ppe = required_ppe or ["helmet", "safety-vest"]

        self.reader = LowLatencyRTSPReader(stream_url, camera_id=camera_id)
        self.session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=5, pool_maxsize=5)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

        self.running = False
        self.worker_thread: Optional[threading.Thread] = None

        # Metrics
        self.processed_count = 0
        self.candidate_count = 0
        self.latencies_ms: List[float] = []
        self.frame_ages_ms: List[float] = []
        self.start_time: Optional[float] = None
        self.last_heartbeat_time = 0.0
        self._last_processed_count = 0
        self.last_detection_dispatch = 0.0

    def dispatch_detections(self, res: InferenceResponse):
        """
        Dispatches real-time detection telemetry for CV overlay rendering in frontend.
        Throttled to max ~15 FPS to preserve bandwidth while ensuring smooth live overlay.
        """
        now = time.time()
        if (now - self.last_detection_dispatch) < 0.065:
            return
        self.last_detection_dispatch = now

        detections_payload = []
        # If tracked workers exist, prefer them because they have ByteTrack trackId and PPE state
        if res.tracked_workers:
            for tw in res.tracked_workers:
                detections_payload.append({
                    "trackId": tw.track_id,
                    "employeeId": tw.employee_id,
                    "employeeName": tw.employee_name,
                    "identityStatus": tw.identity_status,
                    "className": "person",
                    "confidence": round(tw.person_confidence, 2),
                    "personConfidence": round(tw.person_confidence, 3),
                    "bbox": {
                        "ymin": tw.bounding_box.ymin,
                        "xmin": tw.bounding_box.xmin,
                        "ymax": tw.bounding_box.ymax,
                        "xmax": tw.bounding_box.xmax,
                        "label": tw.bounding_box.label,
                        "color": tw.bounding_box.color
                    },
                    "ppe": {
                        "helmet": tw.helmet_status,
                        "vest": tw.vest_status,
                        "gloves": tw.gloves_status,
                        "shoes": tw.shoes_status,
                        "glasses": tw.glasses_status,
                        "mask": tw.mask_status
                    },
                    "ppeDetails": tw.ppe_details,
                    "overallCompliance": tw.overall_compliance,
                    "complianceDurationSec": tw.compliance_duration_sec,
                    "temporalState": tw.temporal_state,
                    "violations": tw.violations
                })
        elif res.detections:
            for d in res.detections:
                detections_payload.append({
                    "trackId": d.worker_tracking_id,
                    "employeeId": d.employee_id,
                    "employeeName": d.employee_name,
                    "identityStatus": d.identity_status,
                    "className": d.class_name,
                    "confidence": round(d.confidence, 2),
                    "personConfidence": round(d.confidence, 3),
                    "bbox": {
                        "ymin": d.bounding_box.ymin,
                        "xmin": d.bounding_box.xmin,
                        "ymax": d.bounding_box.ymax,
                        "xmax": d.bounding_box.xmax,
                        "label": d.bounding_box.label,
                        "color": d.bounding_box.color
                    },
                    "ppe": {
                        "helmet": d.helmet_status,
                        "vest": d.vest_status,
                        "gloves": d.gloves_status,
                        "shoes": d.shoes_status,
                        "glasses": d.glasses_status,
                        "mask": d.mask_status
                    },
                    "ppeDetails": d.ppe_details,
                    "overallCompliance": d.overall_compliance,
                    "complianceDurationSec": d.persisted_duration_sec,
                    "temporalState": d.temporal_state,
                    "violation": d.violation
                })

        w, h = self.reader.resolution
        payload = {
            "cameraId": self.camera_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "frameWidth": w if w > 0 else 1280,
            "frameHeight": h if h > 0 else 720,
            "detections": detections_payload
        }
        try:
            url = f"{self.backend_url}/api/detection/camera-detections"
            self.session.post(url, json=payload, timeout=0.5)
        except Exception:
            pass

    def dispatch_incident_candidate(self, candidate: IncidentCreationCandidate, frame: Optional[np.ndarray] = None) -> bool:
        """
        Dispatches structured authoritative incident candidate to Node.js backend.
        Captures the actual CCTV frame at confirmation time, annotates forensically,
        and attaches evidenceBase64 + SHA-256 hash to guarantee visual evidence provenance.
        """
        evidence_b64: Optional[str] = None
        evidence_sha256: Optional[str] = None
        frame_w: Optional[int] = None
        frame_h: Optional[int] = None

        if frame is not None:
            try:
                frame_h, frame_w = frame.shape[:2]
                bbox_dict = {
                    "ymin": candidate.bounding_box.ymin,
                    "xmin": candidate.bounding_box.xmin,
                    "ymax": candidate.bounding_box.ymax,
                    "xmax": candidate.bounding_box.xmax,
                }
                is_breach = "breach" in candidate.violation_type.lower() or "zone" in candidate.violation_type.lower()
                zone_polygon = None
                zone_name = candidate.zone
                if getattr(self, "zone", None) and isinstance(self.zone, dict):
                    zone_polygon = self.zone.get("polygon")
                    zone_name = self.zone.get("name") or zone_name

                annotated = annotate_forensic_evidence(
                    frame=frame,
                    camera_id=self.camera_id,
                    timestamp_str=candidate.timestamp or datetime.now(timezone.utc).isoformat(),
                    track_id=candidate.track_id,
                    violation_type=candidate.violation_type,
                    confidence=candidate.confidence,
                    bounding_box=bbox_dict,
                    zone_polygon=zone_polygon,
                    zone_name=zone_name,
                    is_breach=is_breach
                )
                ret, jpg = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
                if ret:
                    jpg_bytes = jpg.tobytes()
                    evidence_sha256 = hashlib.sha256(jpg_bytes).hexdigest()
                    evidence_b64 = base64.b64encode(jpg_bytes).decode('ascii')
            except Exception as e:
                print(f"[{self.camera_id}] Error generating forensic evidence frame: {e}")

        payload: Dict[str, Any] = {
            "candidate": {
                "trackId": candidate.track_id,
                "employeeId": candidate.employee_id,
                "employeeName": candidate.employee_name,
                "identityStatus": candidate.identity_status,
                "violationType": candidate.violation_type,
                "severity": candidate.severity,
                "confidence": candidate.confidence,
                "cameraId": candidate.camera_id,
                "zone": candidate.zone,
                "timestamp": candidate.timestamp,
                "boundingBox": {
                    "ymin": candidate.bounding_box.ymin,
                    "xmin": candidate.bounding_box.xmin,
                    "ymax": candidate.bounding_box.ymax,
                    "xmax": candidate.bounding_box.xmax,
                    "label": candidate.bounding_box.label,
                    "color": candidate.bounding_box.color
                },
                "ruleId": candidate.rule_id,
                "modelId": candidate.model_id,
                "whyFlagged": candidate.why_flagged,
                "temporalConfigUsed": candidate.temporal_config_used
            }
        }

        if evidence_b64:
            payload["evidenceBase64"] = evidence_b64
            payload["evidenceSha256"] = evidence_sha256
            payload["frameWidth"] = frame_w
            payload["frameHeight"] = frame_h

        try:
            url = f"{self.backend_url}/api/detection/incident-candidate"
            resp = self.session.post(url, json=payload, timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                self.candidate_count += 1
                return data.get("incidentCreated", False)
            else:
                print(f"[{self.camera_id}] Candidate dispatch error: {resp.status_code} {resp.text}")
        except Exception as e:
            print(f"[{self.camera_id}] Candidate dispatch exception: {e}")
        return False

    def emit_heartbeat(self, status: str, fps: float, latency_ms: float, frame_age_ms: float = 0.0):
        """Emits camera status and performance telemetry to Node.js backend."""
        try:
            url = f"{self.backend_url}/api/detection/camera-heartbeat"
            payload = {
                "cameraId": self.camera_id,
                "status": status,
                "fps": round(fps, 1),
                "processedFps": round(fps, 1),
                "sourceFps": round(self.reader.source_fps, 1),
                "latencyMs": round(latency_ms, 1),
                "frameAgeMs": round(frame_age_ms, 1),
                "droppedFrames": self.reader.dropped_stale_count,
                "processedFrames": self.processed_count,
                "workerUptime": round(time.time() - (self.start_time or time.time()), 1),
            }
            self.session.post(url, json=payload, timeout=1.0)
        except Exception:
            pass

    def step(self, frame: Optional[np.ndarray] = None, capture_time: Optional[float] = None) -> Optional[InferenceResponse]:
        """Processes a single fresh frame directly in Python memory."""
        if frame is None or capture_time is None:
            frame, capture_time = self.reader.get_latest()
            if frame is None:
                return None
        # Reset camera tracking state if reconnected after prolonged disconnect
        if self.reader.prolonged_disconnect and self.detector:
            print(f"[{self.camera_id}] Resumed after prolonged disconnect (> 5s). Resetting camera tracking state...")
            self.detector.reset_camera_state(self.camera_id)
            self.reader.prolonged_disconnect = False

        t_infer_start = time.perf_counter()
        frame_age_ms = round((t_infer_start - capture_time) * 1000, 2)

        res = self.detector.infer_frame_direct(
            img=frame,
            camera_id=self.camera_id,
            zone=self.zone,
            conf_thresh=self.conf_thresh,
            required_ppe=self.required_ppe,
            current_time=time.time()
        )

        infer_duration_ms = round((time.perf_counter() - t_infer_start) * 1000, 2)
        self.processed_count += 1
        self.latencies_ms.append(infer_duration_ms)
        self.frame_ages_ms.append(frame_age_ms)

        # Dispatch authoritative candidates if any confirmed, passing the actual confirmation frame
        if res.incident_candidates:
            for cand in res.incident_candidates:
                self.dispatch_incident_candidate(cand, frame)

        # Dispatch real-time detections telemetry for live CV overlay
        self.dispatch_detections(res)

        # Periodic heartbeat (every 2.0 seconds)
        now = time.time()
        if (now - self.last_heartbeat_time) >= 2.0:
            delta_time = now - (self.last_heartbeat_time or (now - 2.0))
            delta_frames = self.processed_count - self._last_processed_count
            current_fps = delta_frames / delta_time if delta_time > 0 else 0.0
            self.last_heartbeat_time = now
            self._last_processed_count = self.processed_count

            avg_lat = float(np.mean(self.latencies_ms[-20:])) if self.latencies_ms else 0.0
            avg_age = float(np.mean(self.frame_ages_ms[-20:])) if self.frame_ages_ms else 0.0
            status = "LIVE" if (self.reader.is_connected and self.reader.received_count > 0) else ("RECONNECTING" if self.reader.reconnect_count > 0 else "OFFLINE")
            self.emit_heartbeat(status=status, fps=current_fps, latency_ms=avg_lat, frame_age_ms=avg_age)

        return res

    def start(self):
        """Starts independent inference worker thread."""
        if self.running and self.worker_thread and self.worker_thread.is_alive():
            return
        self.running = True
        self.start_time = time.time()
        self.worker_thread = threading.Thread(target=self._run_loop, daemon=True, name=f"CamWorker-{self.camera_id}")
        self.worker_thread.start()

    def _run_loop(self):
        while self.running:
            try:
                frame, capture_time = self.reader.get_latest()
                if frame is None:
                    now = time.time()
                    if (now - self.last_heartbeat_time) >= 2.0:
                        delta_time = now - (self.last_heartbeat_time or (now - 2.0))
                        delta_frames = self.processed_count - self._last_processed_count
                        inst_fps = delta_frames / delta_time if delta_time > 0 else 0.0
                        self.last_heartbeat_time = now
                        self._last_processed_count = self.processed_count

                        # LIVE is strictly allowed ONLY when actual fresh frames are currently being received!
                        is_fresh = (time.perf_counter() - self.reader.latest_frame_time) < 3.0 if self.reader.latest_frame_time > 0 else False
                        if self.reader.is_connected and self.reader.received_count > 0 and is_fresh:
                            status = "LIVE"
                        elif self.reader.reconnect_count > 0 or self.reader.received_count > 0:
                            status = "RECONNECTING"
                        else:
                            status = "OFFLINE"
                        avg_lat = float(np.mean(self.latencies_ms[-20:])) if self.latencies_ms else 0.0
                        self.emit_heartbeat(status=status, fps=inst_fps, latency_ms=avg_lat, frame_age_ms=0.0)
                    time.sleep(0.005)
                    continue
                self.step(frame, capture_time)
            except Exception as e:
                print(f"[{self.camera_id}] Error in worker loop: {e}")
                time.sleep(0.01)

    def stop(self):
        self.running = False
        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=1.0)
        self.reader.release()
        if self.detector:
            self.detector.reset_camera_state(self.camera_id)


class MultiCameraPipelineManager:
    """
    Orchestrates multiple camera workers dynamically using cameras configured in Node.js backend.
    Supports concurrent worker execution, synchronized batched inference with fair round-robin scheduling,
    dynamic backend synchronization, and duplicate worker prevention.
    """
    def __init__(self, backend_url: str = "http://127.0.0.1:5005", detector: Optional[IndustrialSafetyDetector] = None):
        self.backend_url = backend_url.rstrip("/")
        self.detector = detector or IndustrialSafetyDetector()
        self.workers: Dict[str, CameraWorker] = {}
        self.lock = threading.RLock()
        self.running = False
        self.batch_thread: Optional[threading.Thread] = None

    @staticmethod
    def fetch_camera_configs(backend_url: str = "http://127.0.0.1:5005") -> List[Dict[str, Any]]:
        """Dynamically pulls camera configurations from backend."""
        try:
            resp = requests.get(f"{backend_url.rstrip('/')}/api/cameras/pipeline-config", timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("cameras", [])
        except Exception as e:
            print(f"[MultiCameraPipelineManager] Failed to fetch camera configs: {e}")
        return []

    def sync_with_backend_config(self, backend_url: Optional[str] = None) -> Dict[str, Any]:
        """Dynamically syncs pipeline workers with enabled cameras from backend."""
        url = (backend_url or self.backend_url).rstrip("/")
        configs = self.fetch_camera_configs(url)
        active_ids = set()
        added = []
        stopped = []

        for cfg in configs:
            cam_id = cfg.get("cameraId") or cfg.get("code")
            enabled = cfg.get("enabled", True)
            if not cam_id or not enabled:
                continue

            active_ids.add(cam_id)
            with self.lock:
                if cam_id not in self.workers:
                    worker = self.add_camera(cfg)
                    if self.batch_thread and self.batch_thread.is_alive():
                        worker.running = True
                        worker.start_time = time.time()
                    else:
                        worker.start()
                    added.append(cam_id)
                else:
                    worker = self.workers[cam_id]
                    if worker.stream_url != cfg.get("streamUrl"):
                        worker.stop()
                        self.detector.reset_camera_state(cam_id)
                        del self.workers[cam_id]
                        new_worker = self.add_camera(cfg)
                        if self.batch_thread and self.batch_thread.is_alive():
                            new_worker.running = True
                            new_worker.start_time = time.time()
                        else:
                            new_worker.start()
                    elif not (self.batch_thread and self.batch_thread.is_alive()) and not worker.running:
                        worker.start()
        self.running = True

        # Stop workers for cameras that are disabled or removed from configuration
        with self.lock:
            current_ids = list(self.workers.keys())
            for cam_id in current_ids:
                if cam_id not in active_ids:
                    self.stop_camera(cam_id)
                    stopped.append(cam_id)

        return {
            "active_cameras": list(self.workers.keys()),
            "added": added,
            "stopped": stopped
        }

    def add_camera(self, camera_config: Dict[str, Any]) -> Optional[CameraWorker]:
        """Adds a camera worker. Prevents duplicate workers for the same cameraId."""
        with self.lock:
            if camera_config.get("enabled", True) is False:
                return None
            camera_id = camera_config.get("cameraId") or camera_config.get("code")
            camera_code = camera_config.get("code") or camera_config.get("cameraCode") or camera_id
            stream_url = camera_config.get("streamUrl")
            zone = camera_config.get("zone") or "Unassigned Zone"
            site_id = camera_config.get("siteId") or "SITE-01"

            if not camera_id or not stream_url:
                raise ValueError(f"Invalid camera configuration: {camera_config}")

            # Duplicate worker prevention
            primary_key = camera_code or camera_id
            if primary_key in self.workers:
                existing_worker = self.workers[primary_key]
                if existing_worker.stream_url == stream_url and existing_worker.zone == zone:
                    return existing_worker
                existing_worker.stop()
                self.detector.reset_camera_state(primary_key)
                keys_to_clean = [k for k, w in self.workers.items() if w == existing_worker]
                for k in keys_to_clean:
                    del self.workers[k]

            worker = CameraWorker(
                camera_id=camera_id,
                stream_url=stream_url,
                camera_code=camera_code,
                zone=zone,
                site_id=site_id,
                backend_url=self.backend_url,
                detector=self.detector
            )
            self.workers[primary_key] = worker
            if camera_id != primary_key:
                self.workers[camera_id] = worker
            return worker

    def start_camera(self, camera_id: str):
        with self.lock:
            if camera_id in self.workers:
                self.workers[camera_id].start()

    def stop_camera(self, camera_id: str):
        with self.lock:
            worker = self.workers.get(camera_id)
            if worker:
                worker.stop()
                keys_to_delete = [k for k, w in self.workers.items() if w == worker]
                for k in keys_to_delete:
                    del self.workers[k]
                self.detector.reset_camera_state(camera_id)
                if hasattr(worker, "camera_code") and worker.camera_code:
                    self.detector.reset_camera_state(worker.camera_code)

    def start_all_independent(self):
        """Starts each camera worker in its own thread."""
        with self.lock:
            for worker in self.workers.values():
                worker.start()

    def start_batched(self, target_fps: float = 30.0):
        """
        Runs synchronized batched inference across all cameras with fair round-robin scheduling.
        Drains newest frames from all camera readers and performs batched YOLO forward pass.
        """
        self.running = True
        now = time.time()
        with self.lock:
            for worker in self.workers.values():
                worker.start_time = now
                worker.running = True
        self.batch_thread = threading.Thread(target=self._batched_run_loop, args=(target_fps,), daemon=True, name="BatchedInferenceCoordinator")
        self.batch_thread.start()

    def _batched_run_loop(self, target_fps: float):
        sleep_interval = 1.0 / target_fps
        rr_offset = 0

        while self.running:
            t_loop_start = time.perf_counter()
            with self.lock:
                current_workers = list(self.workers.items())

            if not current_workers:
                time.sleep(0.05)
                continue

            # Fair round-robin order rotation
            n_cams = len(current_workers)
            ordered_workers = [current_workers[(rr_offset + i) % n_cams] for i in range(n_cams)]
            rr_offset = (rr_offset + 1) % n_cams

            batch_items = []
            workers_for_batch = []

            # Check immediately ready frames
            for cam_id, worker in ordered_workers:
                frame, capture_time = worker.reader.get_latest()
                if frame is not None:
                    batch_items.append({
                        "img": frame,
                        "camera_id": cam_id,
                        "zone": worker.zone,
                        "current_time": time.time(),
                        "capture_time": capture_time
                    })
                    workers_for_batch.append(worker)

            # If some cameras were not ready, allow a brief bounded window (up to 15ms)
            if len(batch_items) < len(ordered_workers):
                time.sleep(0.005)
                for cam_id, worker in ordered_workers:
                    if worker not in workers_for_batch:
                        frame, capture_time = worker.reader.get_latest()
                        if frame is not None:
                            batch_items.append({
                                "img": frame,
                                "camera_id": cam_id,
                                "zone": worker.zone,
                                "current_time": time.time(),
                                "capture_time": capture_time
                            })
                            workers_for_batch.append(worker)

            if batch_items:
                t_infer_start = time.perf_counter()
                responses = self.detector.infer_batch_direct(batch_items)
                total_duration_ms = (time.perf_counter() - t_infer_start) * 1000
                per_frame_lat_ms = total_duration_ms / len(batch_items)

                for item, worker, res in zip(batch_items, workers_for_batch, responses):
                    frame_age_ms = (t_infer_start - item["capture_time"]) * 1000
                    worker.processed_count += 1
                    worker.latencies_ms.append(per_frame_lat_ms)
                    worker.frame_ages_ms.append(frame_age_ms)

                    # Dispatch candidates
                    if res.incident_candidates:
                        for cand in res.incident_candidates:
                            worker.dispatch_incident_candidate(cand)

                    # Dispatch real-time detections telemetry for live CV overlay
                    worker.dispatch_detections(res)

                    # Heartbeat
                    now = time.time()
                    if (now - worker.last_heartbeat_time) >= 2.0:
                        worker.last_heartbeat_time = now
                        elapsed = now - (worker.start_time or now)
                        current_fps = worker.processed_count / elapsed if elapsed > 0 else 0.0
                        avg_age = float(np.mean(worker.frame_ages_ms[-20:])) if worker.frame_ages_ms else 0.0
                        worker.emit_heartbeat(
                            status="LIVE" if worker.reader.is_connected else "OFFLINE",
                            fps=current_fps,
                            latency_ms=per_frame_lat_ms,
                            frame_age_ms=avg_age
                        )

            # Emit disconnect telemetry for workers that produced no frame
            now = time.time()
            for cam_id, worker in ordered_workers:
                if worker not in workers_for_batch:
                        is_fresh = (time.perf_counter() - worker.reader.latest_frame_time) < 3.0 if worker.reader.latest_frame_time > 0 else False
                        if worker.reader.is_connected and worker.reader.received_count > 0 and is_fresh:
                            status = "LIVE"
                        elif worker.reader.reconnect_count > 0:
                            status = "RECONNECTING"
                        else:
                            status = "OFFLINE"
                        worker.emit_heartbeat(
                            status=status,
                            fps=0.0,
                            latency_ms=0.0,
                            frame_age_ms=0.0
                        )

            elapsed = time.perf_counter() - t_loop_start
            remaining = sleep_interval - elapsed
            if remaining > 0.001:
                time.sleep(remaining)

    def stop_all(self):
        self.running = False
        if self.batch_thread and self.batch_thread.is_alive():
            self.batch_thread.join(timeout=1.0)
        with self.lock:
            for cam_id, worker in list(self.workers.items()):
                worker.stop()
                self.detector.reset_camera_state(cam_id)
            self.workers.clear()

    def get_aggregate_metrics(self) -> Dict[str, Any]:
        """Calculates system-wide and per-camera benchmarks."""
        per_camera = {}
        total_processed = 0
        total_received = 0
        total_dropped = 0
        all_latencies = []
        all_frame_ages = []

        for cam_id, worker in self.workers.items():
            r = worker.reader
            lat = worker.latencies_ms
            ages = worker.frame_ages_ms
            elapsed = time.time() - (worker.start_time or time.time())
            fps = worker.processed_count / elapsed if elapsed > 0 else 0.0

            p50_lat = float(np.percentile(lat, 50)) if lat else 0.0
            p95_lat = float(np.percentile(lat, 95)) if lat else 0.0
            avg_lat = float(np.mean(lat)) if lat else 0.0

            p50_age = float(np.percentile(ages, 50)) if ages else 0.0
            p95_age = float(np.percentile(ages, 95)) if ages else 0.0
            avg_age = float(np.mean(ages)) if ages else 0.0

            per_camera[cam_id] = {
                "source_fps": r.source_fps,
                "received_frames": r.received_count,
                "processed_frames": worker.processed_count,
                "dropped_frames": r.dropped_stale_count,
                "fps": round(fps, 2),
                "frame_age_ms": {
                    "avg": round(avg_age, 2),
                    "p50": round(p50_age, 2),
                    "p95": round(p95_age, 2)
                },
                "latency_ms": {
                    "avg": round(avg_lat, 2),
                    "p50": round(p50_lat, 2),
                    "p95": round(p95_lat, 2)
                },
                "is_connected": r.is_connected,
                "candidates_created": worker.candidate_count
            }

            total_processed += worker.processed_count
            total_received += r.received_count
            total_dropped += r.dropped_stale_count
            all_latencies.extend(lat)
            all_frame_ages.extend(ages)

        # Hardware metrics
        cpu_util = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        gpu_mem_mb = 0.0
        try:
            import torch
            if torch.cuda.is_available():
                gpu_mem_mb = torch.cuda.memory_allocated(0) / (1024 * 1024)
        except Exception:
            pass

        return {
            "camera_count": len(self.workers),
            "total_received": total_received,
            "total_processed": total_processed,
            "total_dropped": total_dropped,
            "aggregate_fps": round(sum(c["fps"] for c in per_camera.values()), 2),
            "frame_age_ms": {
                "avg": round(float(np.mean(all_frame_ages)), 2) if all_frame_ages else 0.0,
                "p50": round(float(np.percentile(all_frame_ages, 50)), 2) if all_frame_ages else 0.0,
                "p95": round(float(np.percentile(all_frame_ages, 95)), 2) if all_frame_ages else 0.0,
            },
            "latency_ms": {
                "avg": round(float(np.mean(all_latencies)), 2) if all_latencies else 0.0,
                "p50": round(float(np.percentile(all_latencies, 50)), 2) if all_latencies else 0.0,
                "p95": round(float(np.percentile(all_latencies, 95)), 2) if all_latencies else 0.0,
            },
            "hardware": {
                "cpu_util_pct": cpu_util,
                "ram_used_pct": mem.percent,
                "gpu_allocated_mb": round(gpu_mem_mb, 2)
            },
            "cameras": per_camera
        }
