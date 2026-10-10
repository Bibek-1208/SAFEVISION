import os
import time
import numpy as np
import cv2
import hashlib
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel, Field

class IdentityMatchResult(BaseModel):
    match_status: str  # "CONFIRMED", "UNCERTAIN", "NO_MATCH", "NOT_AVAILABLE"
    match_confidence: float = 0.0
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    match_method: str = "BIOMETRIC_FEATURE_COSINE"
    details: str = ""
    timestamp: float = Field(default_factory=time.time)

class EnrolledEmployeeRecord(BaseModel):
    employee_id: str
    employee_name: str
    enrolled_at: str
    enrolled_by: str
    template_checksum: str
    feature_dimension: int

class EmployeeIdentityService:
    """
    Decoupled Employee Identity & Face Recognition Service.
    
    CRITICAL SECURITY & PRIVACY CONTROLS:
    1. Default state: is_enabled = False (NOT CONFIGURED / OFF).
    2. Strictly avoids covert facial surveillance.
    3. Never exposes raw embeddings/templates through REST APIs or Socket.IO.
    4. Enforces high confidence threshold (>= 0.88) for CONFIRMED status.
    5. Returns UNCERTAIN / NOT_AVAILABLE for blurred, occluded, or low-res crops.
    6. Does NOT randomly guess or associate unconfirmed workers.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmployeeIdentityService, cls).__new__(cls)
            cls._instance._init_service()
        return cls._instance

    def _init_service(self):
        # Default: Employee Identification is OFF until explicitly enabled by Admin
        self.is_enabled: bool = False
        self.confirmed_threshold: float = 0.88
        self.uncertain_threshold: float = 0.65
        self.min_face_size: int = 40  # pixels

        # Secure reference store: employee_id -> { "name": str, "vector": np.ndarray, "checksum": str }
        self._enrolled_templates: Dict[str, Dict[str, Any]] = {}

    def set_enabled_state(self, enabled: bool, admin_user_id: str) -> Dict[str, Any]:
        """Admin control to enable or disable biometric identification."""
        self.is_enabled = enabled
        return {
            "is_enabled": self.is_enabled,
            "updated_by": admin_user_id,
            "status": "CONFIGURED_ACTIVE" if self.is_enabled else "NOT CONFIGURED / OFF"
        }

    def enroll_reference_template(
        self,
        employee_id: str,
        employee_name: str,
        face_image_bytes: bytes,
        enrolled_by: str
    ) -> Dict[str, Any]:
        """
        Enrolls approved reference face template for registered employee.
        Computes 128-d normalized feature representation and stores template securely.
        """
        nparr = np.frombuffer(face_image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Invalid or unreadable reference image buffer.")

        h, w = img.shape[:2]
        if h < self.min_face_size or w < self.min_face_size:
            raise ValueError(f"Reference image resolution too low (minimum {self.min_face_size}x{self.min_face_size} required).")

        # Extract deterministic normalized face feature vector
        resized = cv2.resize(img, (64, 64), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        # Compute gradient orientation histogram (HOG-style lightweight descriptor)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=1)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=1)
        mag, angle = cv2.cartToPolar(gx, gy, angleInDegrees=True)
        # 16-bin angle histogram across 4x4 spatial cells -> 16 * 16 = 256-d vector
        cells_y, cells_x = 4, 4
        cell_h, cell_w = 64 // cells_y, 64 // cells_x
        features = []
        for cy in range(cells_y):
            for cx in range(cells_x):
                sub_mag = mag[cy*cell_h:(cy+1)*cell_h, cx*cell_w:(cx+1)*cell_w]
                sub_ang = angle[cy*cell_h:(cy+1)*cell_h, cx*cell_w:(cx+1)*cell_w]
                hist, _ = np.histogram(sub_ang, bins=8, range=(0, 360), weights=sub_mag)
                features.extend(hist)

        feat_vec = np.array(features, dtype=np.float32)
        norm = np.linalg.norm(feat_vec)
        if norm > 0:
            feat_vec /= norm

        checksum = hashlib.sha256(feat_vec.tobytes()).hexdigest()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        self._enrolled_templates[employee_id] = {
            "name": employee_name,
            "vector": feat_vec,
            "checksum": f"sha256:{checksum}",
            "enrolled_at": now_iso,
            "enrolled_by": enrolled_by
        }

        return {
            "employee_id": employee_id,
            "employee_name": employee_name,
            "template_checksum": f"sha256:{checksum}",
            "feature_dimension": len(feat_vec),
            "enrolled_at": now_iso,
            "status": "ENROLLED"
        }

    def match_face(
        self,
        face_img: np.ndarray,
        camera_id: str = "CAM-01",
        zone: str = "Furnace Bay"
    ) -> IdentityMatchResult:
        """
        Attempts to match a detected face region against enrolled templates.
        
        Returns IdentityMatchResult with status:
        - NOT_AVAILABLE: If service is OFF, or face is occluded/blurred/low-res
        - NO_MATCH: If face is clear but does not match any enrolled employee
        - UNCERTAIN: If similarity is between uncertain_threshold and confirmed_threshold
        - CONFIRMED: If similarity >= confirmed_threshold (reliably identified)
        """
        if not self.is_enabled:
            return IdentityMatchResult(
                match_status="NOT_AVAILABLE",
                match_confidence=0.0,
                details="Biometric identification feature is NOT CONFIGURED / OFF in system settings."
            )

        if face_img is None or face_img.size == 0:
            return IdentityMatchResult(
                match_status="NOT_AVAILABLE",
                match_confidence=0.0,
                details="Face crop unavailable or not visible in frame."
            )

        h, w = face_img.shape[:2]
        if h < self.min_face_size or w < self.min_face_size:
            return IdentityMatchResult(
                match_status="NOT_AVAILABLE",
                match_confidence=0.0,
                details=f"Face resolution ({w}x{h}) below minimum reliability threshold ({self.min_face_size}px)."
            )

        # Check blur / laplacian variance
        gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY) if len(face_img.shape) == 3 else face_img
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplacian_var < 25.0:
            return IdentityMatchResult(
                match_status="NOT_AVAILABLE",
                match_confidence=0.0,
                details="Face crop blurred or occluded. Reliable match cannot be performed."
            )

        if len(self._enrolled_templates) == 0:
            return IdentityMatchResult(
                match_status="NO_MATCH",
                match_confidence=0.0,
                details="No employee biometric reference templates currently enrolled."
            )

        # Extract features for query crop
        resized = cv2.resize(face_img, (64, 64), interpolation=cv2.INTER_AREA)
        gx = cv2.Sobel(gray if gray.shape == (64, 64) else cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY), cv2.CV_32F, 1, 0, ksize=1)
        gy = cv2.Sobel(gray if gray.shape == (64, 64) else cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY), cv2.CV_32F, 0, 1, ksize=1)
        mag, angle = cv2.cartToPolar(gx, gy, angleInDegrees=True)

        cells_y, cells_x = 4, 4
        cell_h, cell_w = 16, 16
        features = []
        for cy in range(cells_y):
            for cx in range(cells_x):
                sub_mag = mag[cy*cell_h:(cy+1)*cell_h, cx*cell_w:(cx+1)*cell_w]
                sub_ang = angle[cy*cell_h:(cy+1)*cell_h, cx*cell_w:(cx+1)*cell_w]
                hist, _ = np.histogram(sub_ang, bins=8, range=(0, 360), weights=sub_mag)
                features.extend(hist)

        query_vec = np.array(features, dtype=np.float32)
        norm = np.linalg.norm(query_vec)
        if norm > 0:
            query_vec /= norm

        # Compute cosine similarity with enrolled templates
        best_id: Optional[str] = None
        best_name: Optional[str] = None
        best_sim: float = -1.0

        for emp_id, tmpl in self._enrolled_templates.items():
            ref_vec = tmpl["vector"]
            sim = float(np.dot(query_vec, ref_vec))
            if sim > best_sim:
                best_sim = sim
                best_id = emp_id
                best_name = tmpl["name"]

        best_sim = max(0.0, min(1.0, best_sim))

        if best_sim >= self.confirmed_threshold:
            return IdentityMatchResult(
                match_status="CONFIRMED",
                match_confidence=round(best_sim, 3),
                employee_id=best_id,
                employee_name=best_name,
                details=f"Reliable biometric verification confirmed for {best_name} ({best_id})"
            )
        elif best_sim >= self.uncertain_threshold:
            return IdentityMatchResult(
                match_status="UNCERTAIN",
                match_confidence=round(best_sim, 3),
                employee_id=None,  # Do not assign name when uncertain
                employee_name=None,
                details=f"Candidate match below confirmation threshold ({best_sim:.2f} < {self.confirmed_threshold:.2f}). Marked as UNCERTAIN."
            )
        else:
            return IdentityMatchResult(
                match_status="NO_MATCH",
                match_confidence=round(best_sim, 3),
                employee_id=None,
                employee_name=None,
                details="No matching enrolled worker found."
            )

    def list_enrolled_employees(self) -> List[EnrolledEmployeeRecord]:
        """Returns non-sensitive metadata of enrolled templates (never raw vectors)."""
        result = []
        for emp_id, tmpl in self._enrolled_templates.items():
            result.append(EnrolledEmployeeRecord(
                employee_id=emp_id,
                employee_name=tmpl["name"],
                enrolled_at=tmpl["enrolled_at"],
                enrolled_by=tmpl["enrolled_by"],
                template_checksum=tmpl["checksum"],
                feature_dimension=len(tmpl["vector"])
            ))
        return result
