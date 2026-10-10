from typing import List, Dict, Any, Optional, Set
from pydantic import BaseModel, Field

from .ppe_registry import PPEClassRegistry

# Baseline approved SH17 model supported SafeVision class IDs
BASELINE_SUPPORTED_SV_IDS: Set[str] = {
    f"SV-PPE-{i:03d}" for i in range(1, 18)
}

class PPEState(BaseModel):
    status: str  # "PRESENT", "MISSING", "UNKNOWN", "NOT_ASSESSABLE", "UNSUPPORTED", "NOT_REQUIRED"
    confidence: float = 0.0
    detected_item: Optional[str] = None
    observation_notes: str = ""

class ExpectedRegion(BaseModel):
    item_name: str
    safe_vision_class_id: Optional[str] = None
    target_region_name: str  # e.g., "head_region", "torso_region", "hand_region", "foot_region"
    bbox: List[float]  # [ymin, xmin, ymax, xmax] in normalized 0-100 percentage
    is_detector_box: bool = False  # NEVER represented as a detector box
    annotation_type: str = "MISSING_PPE_EXPECTED_REGION"
    label: str  # e.g. "HELMET — MISSING"
    description: str = "Expected anatomical region"

class PPEAssessmentItem(BaseModel):
    item_name: str
    display_name: str
    ppe_class: Optional[str] = None
    safe_vision_class_id: Optional[str] = None
    status: str  # "PRESENT", "MISSING", "NOT_ASSESSABLE", "NOT_REQUIRED", "UNSUPPORTED"
    confidence: float = 0.0
    evidence: Optional[str] = None  # e.g. "detected PPE bbox", "expected head region"
    association: Optional[str] = None  # e.g. "head region", "torso region"
    reason: str = ""
    bbox: Optional[List[float]] = None
    is_expected_region: bool = False

    def model_post_init(self, __context: Any) -> None:
        if not self.ppe_class:
            object.__setattr__(self, "ppe_class", self.item_name)

class TrackPPEEvaluation(BaseModel):
    track_id: str
    person_bbox: List[float]  # [ymin, xmin, ymax, xmax]
    person_confidence: float
    helmet: PPEState
    vest: PPEState
    gloves: PPEState
    shoes: PPEState
    additional_ppe: Dict[str, PPEState] = Field(default_factory=dict)
    violations: List[str] = Field(default_factory=list)
    is_compliant: bool = True
    compliance_state: str = "COMPLIANT"  # "COMPLIANT", "NON-COMPLIANT", "PARTIALLY_ASSESSED"
    assessments: List[PPEAssessmentItem] = Field(default_factory=list)
    expected_regions: List[ExpectedRegion] = Field(default_factory=list)
    detected_ppe_items: List[str] = Field(default_factory=list)
    required_ppe_items: List[str] = Field(default_factory=list)

class RawDetection(BaseModel):
    class_name: str
    confidence: float = 1.0
    bbox: Optional[List[float]] = None
    box_2d: Optional[List[float]] = None
    safe_vision_class_id: Optional[str] = None

    def get(self, key: str, default: Any = None) -> Any:
        if key == "bbox":
            return self.bbox or self.box_2d or default
        if hasattr(self, key):
            val = getattr(self, key)
            return val if val is not None else default
        return default

    def __getitem__(self, key: str) -> Any:
        return self.get(key)

class AssociationScore(float):
    score: float
    diag: Dict[str, Any]

    def __new__(cls, score: float, diag: Optional[Dict[str, Any]] = None):
        instance = super().__new__(cls, float(score))
        instance.score = float(score)
        instance.diag = diag or {}
        return instance

    def __iter__(self):
        yield float(self.score)
        yield self.diag

class MultiPersonEvaluationResult(list):
    def __init__(self, items: List[TrackPPEEvaluation]):
        super().__init__(items)
        self._by_id: Dict[str, TrackPPEEvaluation] = {item.track_id: item for item in items}

    def __getitem__(self, key):
        if isinstance(key, str):
            return self._by_id[key]
        return super().__getitem__(key)

    def __contains__(self, key):
        if isinstance(key, str):
            return key in self._by_id
        return super().__contains__(key)

    def get(self, key: str, default=None):
        return self._by_id.get(key, default)

from typing import List, Dict, Any, Optional, Set, Tuple

def compute_box_overlap(inner_box: List[float], outer_box: List[float]) -> float:
    """
    Computes fraction of inner_box that is inside outer_box.
    """
    y1 = max(inner_box[0], outer_box[0])
    x1 = max(inner_box[1], outer_box[1])
    y2 = min(inner_box[2], outer_box[2])
    x2 = min(inner_box[3], outer_box[3])

    if y2 <= y1 or x2 <= x1:
        return 0.0

    inter_area = (y2 - y1) * (x2 - x1)
    inner_area = max(1e-6, (inner_box[2] - inner_box[0]) * (inner_box[3] - inner_box[1]))
    return float(inter_area / inner_area)

def compute_box_iou(box1: List[float], box2: List[float]) -> float:
    """
    Computes Intersection-over-Union (IoU) between two bounding boxes.
    """
    y1 = max(box1[0], box2[0])
    x1 = max(box1[1], box2[1])
    y2 = min(box1[2], box2[2])
    x2 = min(box1[3], box2[3])

    if y2 <= y1 or x2 <= x1:
        return 0.0

    inter_area = (y2 - y1) * (x2 - x1)
    a1 = max(1e-6, (box1[2] - box1[0]) * (box1[3] - box1[1]))
    a2 = max(1e-6, (box2[2] - box2[0]) * (box2[3] - box2[1]))
    return float(inter_area / (a1 + a2 - inter_area))

def box_center_in(point_box: List[float], target_box: List[float]) -> bool:
    cy = (point_box[0] + point_box[2]) / 2.0
    cx = (point_box[1] + point_box[3]) / 2.0
    return target_box[0] <= cy <= target_box[2] and target_box[1] <= cx <= target_box[3]

def get_person_anatomical_regions(person_bbox: List[float]) -> Dict[str, List[float]]:
    """
    Generates person-specific reference/expected anatomical regions:
    HEAD, FACE, EYES_FACE, EARS, TORSO, HANDS, FEET, BODY.
    All returned regions represent expected anatomical boundaries (is_detector_box=False).
    """
    ymin, xmin, ymax, xmax = person_bbox
    h = max(1e-4, ymax - ymin)
    w = max(1e-4, xmax - xmin)

    return {
        "HEAD": [
            round(ymin, 2),
            round(xmin, 2),
            round(min(100.0, ymin + 0.30 * h), 2),
            round(xmax, 2)
        ],
        "FACE": [
            round(ymin + 0.06 * h, 2),
            round(xmin + 0.15 * w, 2),
            round(min(100.0, ymin + 0.28 * h), 2),
            round(xmax - 0.15 * w, 2)
        ],
        "EYES_FACE": [
            round(ymin + 0.08 * h, 2),
            round(xmin + 0.18 * w, 2),
            round(min(100.0, ymin + 0.24 * h), 2),
            round(xmax - 0.18 * w, 2)
        ],
        "EARS": [
            round(ymin + 0.08 * h, 2),
            round(xmin, 2),
            round(min(100.0, ymin + 0.28 * h), 2),
            round(xmax, 2)
        ],
        "TORSO": [
            round(max(0.0, ymin + 0.18 * h), 2),
            round(xmin, 2),
            round(min(100.0, ymin + 0.72 * h), 2),
            round(xmax, 2)
        ],
        "HANDS": [
            round(max(0.0, ymin + 0.45 * h), 2),
            round(xmin, 2),
            round(min(100.0, ymin + 0.80 * h), 2),
            round(xmax, 2)
        ],
        "FEET": [
            round(max(0.0, ymin + 0.70 * h), 2),
            round(xmin, 2),
            round(ymax, 2),
            round(xmax, 2)
        ],
        "BODY": [
            round(ymin, 2),
            round(xmin, 2),
            round(ymax, 2),
            round(xmax, 2)
        ]
    }

class PPEAssociationEngine:
    """
    Explicitly evaluates PPE compliance for each worker track by analyzing spatial
    relationships between detected anatomical regions (head, face, torso, hands, feet)
    and protective gear (helmet, safety-vest, gloves, shoes, glasses, etc.).
    Enforces Phase 12.3.1 Hardened Person-PPE Association:
    1. Person detection is root object: all assessments belong to a person track.
    2. Multi-factor scoring: considers containment, IoU, centroid, target region,
       relative vertical offset, distance from anatomical anchor, detection confidence,
       occlusion, truncation, and competing persons.
    3. Multi-person assignment: resolves competition and prevents cross-person bleeding.
    4. Explicit 5-states: PRESENT, MISSING, NOT_ASSESSABLE, NOT_REQUIRED, UNSUPPORTED.
    5. Expected regions carry is_detector_box=False, real detector boxes carry is_detector_box=True.
    """

    def __init__(
        self,
        visibility_threshold: float = 0.40,
        supported_class_ids: Optional[Set[str]] = None
    ):
        self.visibility_threshold = visibility_threshold
        self.ppe_registry = PPEClassRegistry()
        self.supported_class_ids = supported_class_ids if supported_class_ids is not None else set(BASELINE_SUPPORTED_SV_IDS)

    def get_target_region_for_class(
        self,
        class_name: str,
        safe_vision_class_id: Optional[str] = None
    ) -> str:
        """
        Dynamically resolves the target anatomical region for a PPE class using the
        authoritative SafeVision registry ontology.
        """
        entry = None
        if safe_vision_class_id:
            entry = self.ppe_registry.get_class_by_id(safe_vision_class_id)
        if not entry:
            entry = self.ppe_registry.get_class_by_name(class_name)
        if not entry:
            entry = self.ppe_registry.resolve_alias(class_name)

        if entry:
            sub_cat = entry.get("subCategory", "")
            if "Head" in sub_cat:
                return "HEAD"
            elif "Eye" in sub_cat:
                return "EYES_FACE"
            elif "Face" in sub_cat:
                return "FACE"
            elif "Hearing" in sub_cat:
                return "EARS"
            elif "Respiratory" in sub_cat:
                return "FACE"
            elif "Hand" in sub_cat:
                return "HANDS"
            elif "Foot" in sub_cat:
                return "FEET"
            elif "Body" in sub_cat or "Fall" in sub_cat:
                return "TORSO"

        cn = class_name.lower().replace("_", "-")
        if any(k in cn for k in ["helmet", "hard-hat", "hat", "cap"]):
            return "HEAD"
        elif any(k in cn for k in ["glasses", "goggle", "eye"]):
            return "EYES_FACE"
        elif any(k in cn for k in ["mask", "respirator", "shield", "guard"]):
            return "FACE"
        elif any(k in cn for k in ["vest", "suit", "jacket", "coat", "torso"]):
            return "TORSO"
        elif any(k in cn for k in ["glove", "hand", "mitt"]):
            return "HANDS"
        elif any(k in cn for k in ["shoe", "boot", "foot", "feet"]):
            return "FEET"
        return "BODY"

    def compute_association_score(
        self,
        person_bbox: List[float],
        ppe_bbox: List[float],
        target_region_name: str,
        person_conf: float = 1.0,
        ppe_conf: float = 1.0
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Computes defensible spatial + anatomical association score.
        Considers containment, anchor IoU, normalized proximity, relative vertical alignment,
        and anatomical plausibility bounds.
        """
        ymin, xmin, ymax, xmax = person_bbox
        ph = max(1e-4, ymax - ymin)
        pw = max(1e-4, xmax - xmin)

        dymin, dxmin, dymax, dxmax = ppe_bbox
        cy = (dymin + dymax) / 2.0
        cx = (dxmin + dxmax) / 2.0

        rel_y = (cy - ymin) / ph
        rel_x = (cx - xmin) / pw

        # 1. Anatomical Plausibility Guardrails (Never attach PPE to the wrong body region)
        if target_region_name == "HEAD":
            if rel_y > 0.45 or rel_y < -0.25:
                return AssociationScore(0.0, {"plausible": False, "reason": "Head gear outside head region"})
        elif target_region_name in ["EYES_FACE", "FACE", "EARS"]:
            if rel_y > 0.45 or rel_y < -0.15:
                return AssociationScore(0.0, {"plausible": False, "reason": "Face gear outside facial region"})
        elif target_region_name == "TORSO":
            if rel_y > 0.85 or rel_y < 0.05:
                return AssociationScore(0.0, {"plausible": False, "reason": "Torso gear outside torso region"})
        elif target_region_name == "HANDS":
            if rel_y > 0.95 or rel_y < 0.20:
                return AssociationScore(0.0, {"plausible": False, "reason": "Hand gear outside reach zone"})
        elif target_region_name == "FEET":
            if rel_y < 0.50:
                return AssociationScore(0.0, {"plausible": False, "reason": "Foot gear above lower extremities"})

        # Horizontal span check (Must not be detached horizontally)
        if cx < (xmin - 0.35 * pw) or cx > (xmax + 0.35 * pw):
            return AssociationScore(0.0, {"plausible": False, "reason": "Horizontal span disconnected"})

        # 2. Anatomical anchor region comparison
        anat_regions = get_person_anatomical_regions(person_bbox)
        target_box = anat_regions.get(target_region_name, person_bbox)

        anchor_iou = compute_box_iou(ppe_bbox, target_box)
        containment = compute_box_overlap(ppe_bbox, person_bbox)
        person_iou = compute_box_iou(ppe_bbox, person_bbox)

        t_cy = (target_box[0] + target_box[2]) / 2.0
        t_cx = (target_box[1] + target_box[3]) / 2.0
        dist_y = abs(cy - t_cy) / ph
        dist_x = abs(cx - t_cx) / pw

        proximity_score = max(0.0, 1.0 - dist_y) + 0.5 * max(0.0, 1.0 - dist_x)

        # Weighted composite score
        score = (
            3.0 * anchor_iou +
            2.0 * containment +
            1.5 * proximity_score +
            0.5 * person_iou
        )
        score *= (0.5 + 0.5 * ppe_conf)

        diag = {
            "plausible": True,
            "anchor_iou": round(anchor_iou, 3),
            "containment": round(containment, 3),
            "rel_y": round(rel_y, 3),
            "score": round(score, 3)
        }
        return AssociationScore(score, diag)

    def associate_frame_ppe(
        self,
        persons: List[Dict[str, Any]],
        frame_detections: List[Any]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Global multi-person association resolver.
        Prevents cross-person bleeding and resolves competing persons cleanly.
        """
        assignments: Dict[str, List[Dict[str, Any]]] = {
            p.get("track_id", f"PERSON-{i}"): [] for i, p in enumerate(persons)
        }
        if not persons or not frame_detections:
            return assignments

        def to_dict(d: Any) -> Dict[str, Any]:
            if isinstance(d, dict):
                return dict(d)
            if hasattr(d, "model_dump"):
                return d.model_dump()
            res = {}
            for k in ["class_name", "confidence", "bbox", "box_2d", "safe_vision_class_id"]:
                if hasattr(d, k):
                    res[k] = getattr(d, k)
            return res

        ANATOMICAL_CLASSES = {"head", "face", "ear", "hands", "foot"}
        PPE_GEAR_CATEGORIES = {
            "helmet": "HEAD_GEAR_POS", "hard-hat": "HEAD_GEAR_POS", "safety-helmet": "HEAD_GEAR_POS",
            "nohelmet": "HEAD_GEAR_NEG", "no-helmet": "HEAD_GEAR_NEG", "no_helmet": "HEAD_GEAR_NEG",
            "safety-vest": "TORSO_GEAR_POS", "vest": "TORSO_GEAR_POS", "safety-suit": "TORSO_GEAR_POS", "medical-suit": "TORSO_GEAR_POS", "hi-vis-vest": "TORSO_GEAR_POS",
            "novest": "TORSO_GEAR_NEG", "no-vest": "TORSO_GEAR_NEG", "no_vest": "TORSO_GEAR_NEG",
            "glasses": "FACE_GEAR", "face-guard": "FACE_GEAR", "face-mask": "FACE_GEAR", "ear-mufs": "EAR_GEAR",
            "gloves": "HAND_GEAR",
            "shoes": "FOOT_GEAR", "boots": "FOOT_GEAR"
        }

        # Filter out person/worker detector boxes
        ppe_candidates = []
        for d in frame_detections:
            cn = (d.get("class_name") if hasattr(d, "get") else getattr(d, "class_name", "")).lower().replace("_", "-")
            sv = d.get("safe_vision_class_id") if hasattr(d, "get") else getattr(d, "safe_vision_class_id", None)
            if cn not in ["person", "worker"] and sv != "SV-PPE-001":
                ppe_candidates.append(d)

        # Sort candidates descending by confidence
        sorted_candidates = sorted(
            ppe_candidates,
            key=lambda x: (x.get("confidence") if hasattr(x, "get") else getattr(x, "confidence", 1.0)) or 1.0,
            reverse=True
        )

        for det in sorted_candidates:
            c_name = (det.get("class_name") if hasattr(det, "get") else getattr(det, "class_name", "")).lower().replace("_", "-")
            sv_id = det.get("safe_vision_class_id") if hasattr(det, "get") else getattr(det, "safe_vision_class_id", None)
            box = (det.get("bbox") or det.get("box_2d")) if hasattr(det, "get") else (getattr(det, "bbox", None) or getattr(det, "box_2d", [0, 0, 0, 0]))
            conf = (det.get("confidence") if hasattr(det, "get") else getattr(det, "confidence", 1.0)) or 1.0
            target_reg = self.get_target_region_for_class(c_name, sv_id)

            det_dict = to_dict(det)
            if "bbox" not in det_dict or not det_dict["bbox"]:
                det_dict["bbox"] = box
            det_dict["norm_class"] = c_name

            candidate_scores: List[Tuple[float, str, Dict[str, Any]]] = []
            for p in persons:
                p_id = p.get("track_id", "P-UNKNOWN")
                p_box = p.get("bbox", [0, 0, 0, 0])
                p_conf = p.get("confidence", p.get("score", 1.0))

                score, diag = self.compute_association_score(
                    person_bbox=p_box,
                    ppe_bbox=box,
                    target_region_name=target_reg,
                    person_conf=p_conf,
                    ppe_conf=conf
                )
                if score >= 0.45:
                    candidate_scores.append((float(score), p_id, diag))

            if not candidate_scores:
                continue

            # Sort descending by score
            candidate_scores.sort(key=lambda x: x[0], reverse=True)
            best_score, best_pid, _ = candidate_scores[0]

            # Check for ambiguous competition between overlapping workers
            if len(candidate_scores) > 1:
                second_score, second_pid, _ = candidate_scores[1]
                p1_box = next((p["bbox"] for p in persons if p.get("track_id") == best_pid), None)
                p2_box = next((p["bbox"] for p in persons if p.get("track_id") == second_pid), None)

                # If scores are close and workers physically overlap, association is ambiguous
                if (best_score - second_score < 0.35) and p1_box and p2_box and compute_box_iou(p1_box, p2_box) > 0.20:
                    # Mark detection as ambiguous — avoid assigning to either
                    continue

            # 1-to-1 capacity per gear category: ensure person doesn't accumulate duplicates of the same gear
            existing = assignments[best_pid]
            is_anat = c_name in ANATOMICAL_CLASSES
            if is_anat:
                # Anatomical markers (head, face, etc.) establish bodily presence without blocking PPE gear
                assignments[best_pid].append(det_dict)
            else:
                gear_cat = PPE_GEAR_CATEGORIES.get(c_name, target_reg)
                gear_existing = [
                    d for d in existing
                    if PPE_GEAR_CATEGORIES.get(d.get("norm_class", "").lower().replace("_", "-"), self.get_target_region_for_class(d.get("norm_class", ""), d.get("safe_vision_class_id"))) == gear_cat
                ]
                if not gear_existing:
                    assignments[best_pid].append(det_dict)
                else:
                    curr_best = gear_existing[0]
                    if conf > curr_best.get("confidence", 0.0):
                        assignments[best_pid].remove(curr_best)
                        assignments[best_pid].append(det_dict)

        return assignments

    def evaluate_multi_person_frame(
        self,
        persons: List[Dict[str, Any]],
        frame_detections: List[Any],
        required_ppe: Optional[List[str]] = None,
        active_supported_class_ids: Optional[Set[str]] = None
    ) -> MultiPersonEvaluationResult:
        """
        Evaluates an entire multi-person frame with global competition resolution.
        """
        assignments = self.associate_frame_ppe(persons, frame_detections)
        results: List[TrackPPEEvaluation] = []

        for p in persons:
            p_id = p.get("track_id", "P-UNKNOWN")
            p_box = p.get("bbox", [0, 0, 0, 0])
            p_conf = p.get("confidence", p.get("score", 1.0))
            assigned = assignments.get(p_id, [])

            eval_res = self.evaluate_track_ppe(
                track_id=p_id,
                person_bbox=p_box,
                person_confidence=p_conf,
                frame_detections=frame_detections,
                required_ppe=required_ppe,
                active_supported_class_ids=active_supported_class_ids,
                all_persons=persons,
                assigned_items=assigned
            )
            results.append(eval_res)

        return MultiPersonEvaluationResult(results)

    def evaluate_track_ppe(
        self,
        track_id: str,
        person_bbox: List[float],
        person_confidence: float,
        frame_detections: List[Dict[str, Any]],
        required_ppe: Optional[List[str]] = None,
        active_supported_class_ids: Optional[Set[str]] = None,
        all_persons: Optional[List[Dict[str, Any]]] = None,
        assigned_items: Optional[List[Dict[str, Any]]] = None
    ) -> TrackPPEEvaluation:
        """
        frame_detections: list of dicts with:
          - 'class_name': str (e.g. 'helmet', 'head', 'safety-vest', 'gloves', 'shoes', etc.)
          - 'bbox': [ymin, xmin, ymax, xmax]
          - 'confidence': float
          - 'safe_vision_class_id': Optional[str]
        """
        ymin, xmin, ymax, xmax = person_bbox
        height = max(1e-4, ymax - ymin)
        width = max(1e-4, xmax - xmin)

        # Anatomical sub-regions within person bounding box (compact & anatomically centered)
        head_region = [
            round(ymin + 0.02 * height, 2),
            round(xmin + 0.15 * width, 2),
            round(min(100.0, ymin + 0.24 * height), 2),
            round(xmax - 0.15 * width, 2)
        ]
        torso_region = [
            round(max(0.0, ymin + 0.22 * height), 2),
            round(xmin + 0.10 * width, 2),
            round(min(100.0, ymin + 0.58 * height), 2),
            round(xmax - 0.10 * width, 2)
        ]
        feet_region = [
            round(max(0.0, ymin + 0.75 * height), 2),
            round(xmin + 0.10 * width, 2),
            round(ymax, 2),
            round(xmax - 0.10 * width, 2)
        ]

        def _norm_det(d: Any, default_class: str = "") -> Dict[str, Any]:
            if isinstance(d, dict):
                res = dict(d)
            elif hasattr(d, "model_dump"):
                res = d.model_dump()
            else:
                res = {}
                for k in ["class_name", "confidence", "bbox", "box_2d", "safe_vision_class_id"]:
                    if hasattr(d, k):
                        res[k] = getattr(d, k)
            c = (res.get("class_name") or default_class or "").lower().replace("_", "-")
            res["norm_class"] = c
            if "bbox" not in res or not res["bbox"]:
                res["bbox"] = res.get("box_2d", [0, 0, 0, 0])
            return res

        # Resolve assigned PPE detections
        if assigned_items is not None:
            associated_items = [_norm_det(d) for d in assigned_items]
        elif all_persons and len(all_persons) > 1:
            global_assignments = self.associate_frame_ppe(all_persons, frame_detections)
            matched = global_assignments.get(track_id, [])
            associated_items = [_norm_det(d) for d in matched]
        else:
            # Single-person context with anatomical plausibility filtering
            associated_items = []
            for det in frame_detections:
                cls = (det.get('class_name') if hasattr(det, 'get') else getattr(det, 'class_name', '')).lower().replace('_', '-')
                sv_id = det.get('safe_vision_class_id') if hasattr(det, 'get') else getattr(det, 'safe_vision_class_id', None)
                if cls in ['person', 'worker'] or sv_id == 'SV-PPE-001':
                    continue
                box = (det.get('bbox') or det.get('box_2d')) if hasattr(det, 'get') else (getattr(det, 'bbox', None) or getattr(det, 'box_2d', [0, 0, 0, 0]))
                t_reg = self.get_target_region_for_class(cls, sv_id)
                score = self.compute_association_score(
                    person_bbox=person_bbox,
                    ppe_bbox=box,
                    target_region_name=t_reg,
                    person_conf=person_confidence,
                    ppe_conf=det.get('confidence', 1.0) if hasattr(det, 'get') else getattr(det, 'confidence', 1.0)
                )
                if float(score) >= 0.50:
                    associated_items.append(_norm_det(det, cls))
                elif box_center_in(box, person_bbox) and t_reg == "BODY":
                    associated_items.append(_norm_det(det, cls))

        detected_ppe_names: List[str] = [d['norm_class'] for d in associated_items]

        # Active supported classes for positive model detection
        current_supported_ids = active_supported_class_ids if active_supported_class_ids is not None else self.supported_class_ids

        # Anatomical observation helpers
        heads = [d for d in associated_items if d['norm_class'] in ['head', 'face', 'face-guard', 'ear-mufs', 'earmuffs', 'glasses', 'helmet', 'hard-hat', 'safety-helmet']]
        hands = [d for d in associated_items if d['norm_class'] in ['hands', 'hand']]
        feet = [d for d in associated_items if d['norm_class'] in ['foot', 'feet']]

        is_top_truncated = ymin <= 2.0
        is_bottom_truncated = ymax >= 98.0
        is_head_visible = (len(heads) > 0 or (height >= 20.0 and width >= 10.0 and not is_top_truncated and person_confidence >= 0.50))
        is_torso_visible = (height >= 25.0 and width >= 12.0 and ymin > 2.0 and ymax < 98.0 and person_confidence >= 0.50)

        # 1. HELMET ASSESSMENT
        helmets = [d for d in associated_items if d['norm_class'] in ['helmet', 'hard-hat', 'safety-helmet']]
        best_helmet = max(helmets, key=lambda x: x['confidence']) if helmets else None

        no_helmets = [d for d in associated_items if d['norm_class'] in ['nohelmet', 'no-helmet', 'no_helmet', 'missing-helmet']]
        best_no_helmet = max(no_helmets, key=lambda x: x['confidence']) if no_helmets else None

        helmet_state: PPEState
        if best_helmet and (not best_no_helmet or best_helmet['confidence'] >= best_no_helmet['confidence']):
            helmet_state = PPEState(
                status="PRESENT",
                confidence=round(best_helmet['confidence'], 3),
                detected_item="helmet",
                observation_notes="Safety helmet detected in head region"
            )
        elif best_no_helmet:
            helmet_state = PPEState(
                status="MISSING",
                confidence=round(best_no_helmet['confidence'], 3),
                detected_item="no_helmet",
                observation_notes="Worker observed without safety helmet (NoHelmet detected)"
            )
        elif len(heads) > 0:
            best_head = max(heads, key=lambda x: x['confidence'])
            if is_top_truncated or height < 15.0:
                helmet_state = PPEState(
                    status="UNKNOWN",
                    confidence=0.0,
                    observation_notes="Head region truncated or resolution too low for definitive helmet inspection"
                )
            else:
                helmet_state = PPEState(
                    status="MISSING",
                    confidence=round(best_head['confidence'], 3),
                    detected_item="unprotected_head",
                    observation_notes="Worker head/face clearly observed without mandatory safety helmet"
                )
        elif is_head_visible:
            if is_top_truncated or height < 15.0:
                helmet_state = PPEState(
                    status="UNKNOWN",
                    confidence=0.0,
                    observation_notes="Head region truncated or resolution too low for definitive helmet inspection"
                )
            else:
                helmet_state = PPEState(
                    status="MISSING",
                    confidence=round(person_confidence, 3),
                    detected_item="unprotected_head",
                    observation_notes="Worker head region observed without mandatory safety helmet"
                )
        else:
            helmet_state = PPEState(
                status="UNKNOWN",
                confidence=0.0,
                observation_notes="Head region not clearly resolved or occluded. Cannot verify helmet status."
            )

        # 2. SAFETY VEST ASSESSMENT
        vests = [d for d in associated_items if d['norm_class'] in ['vest', 'safety-vest', 'safety-suit', 'medical-suit', 'hi-vis-vest']]
        best_vest = max(vests, key=lambda x: x['confidence']) if vests else None

        no_vests = [d for d in associated_items if d['norm_class'] in ['novest', 'no-vest', 'no_vest', 'missing-vest']]
        best_no_vest = max(no_vests, key=lambda x: x['confidence']) if no_vests else None

        vest_state: PPEState
        if best_vest and (not best_no_vest or best_vest['confidence'] >= best_no_vest['confidence']):
            vest_state = PPEState(
                status="PRESENT",
                confidence=round(best_vest['confidence'], 3),
                detected_item="safety-vest",
                observation_notes="High-visibility safety vest detected"
            )
        elif best_no_vest:
            vest_state = PPEState(
                status="MISSING",
                confidence=round(best_no_vest['confidence'], 3),
                detected_item="no_vest",
                observation_notes="Worker observed without safety vest (NoVest detected)"
            )
        elif is_torso_visible:
            vest_state = PPEState(
                status="MISSING",
                confidence=round(person_confidence, 3),
                detected_item="unprotected_torso",
                observation_notes="Worker torso observed without mandatory high-visibility safety vest"
            )
        else:
            vest_state = PPEState(
                status="UNKNOWN",
                confidence=0.0,
                observation_notes="Torso visibility insufficient or occluded. Cannot verify vest status."
            )

        # 3. GLOVES ASSESSMENT
        gloves = [d for d in associated_items if d['norm_class'] in ['gloves', 'glove', 'safety-gloves']]
        best_glove = max(gloves, key=lambda x: x['confidence']) if gloves else None

        gloves_state: PPEState
        if best_glove:
            gloves_state = PPEState(
                status="PRESENT",
                confidence=round(best_glove['confidence'], 3),
                detected_item="gloves",
                observation_notes="Protective gloves detected on worker hands"
            )
        elif len(hands) > 0:
            best_hand = max(hands, key=lambda x: x['confidence'])
            gloves_state = PPEState(
                status="MISSING",
                confidence=round(best_hand['confidence'], 3),
                detected_item="bare_hands",
                observation_notes="Bare hands observed without protective gloves"
            )
        else:
            gloves_state = PPEState(
                status="UNKNOWN",
                confidence=0.0,
                observation_notes="Hands not currently visible or occluded"
            )

        # 4. SAFETY SHOES ASSESSMENT
        shoes = [d for d in associated_items if d['norm_class'] in ['shoes', 'shoe', 'safety-shoes', 'boots', 'boot']]
        best_shoe = max(shoes, key=lambda x: x['confidence']) if shoes else None

        shoes_state: PPEState
        if best_shoe:
            shoes_state = PPEState(
                status="PRESENT",
                confidence=round(best_shoe['confidence'], 3),
                detected_item="shoes",
                observation_notes="Protective safety shoes detected"
            )
        elif len(feet) > 0:
            best_foot = max(feet, key=lambda x: x['confidence'])
            shoes_state = PPEState(
                status="MISSING",
                confidence=round(best_foot['confidence'], 3),
                detected_item="unprotected_foot",
                observation_notes="Bare or non-standard footwear detected"
            )
        else:
            shoes_state = PPEState(
                status="NOT_ASSESSABLE" if is_bottom_truncated else "UNKNOWN",
                confidence=0.0,
                observation_notes="Lower body/feet truncated or outside frame" if is_bottom_truncated else "Footwear not observed"
            )

        # 5. GLASSES ASSESSMENT
        glasses_items = [d for d in associated_items if d['norm_class'] in ['glasses', 'safety-glasses', 'eye-protection']]
        best_glasses = max(glasses_items, key=lambda x: x['confidence']) if glasses_items else None

        glasses_state: PPEState
        if best_glasses:
            glasses_state = PPEState(
                status="PRESENT",
                confidence=round(best_glasses['confidence'], 3),
                detected_item="glasses",
                observation_notes="Protective safety glasses detected on worker"
            )
        elif len(heads) > 0:
            if is_top_truncated or height < 15.0:
                glasses_state = PPEState(
                    status="UNKNOWN",
                    confidence=0.0,
                    observation_notes="Facial region truncated or resolution too low for definitive glasses inspection"
                )
            else:
                best_head = max(heads, key=lambda x: x['confidence'])
                glasses_state = PPEState(
                    status="MISSING",
                    confidence=round(best_head['confidence'], 3),
                    detected_item="unprotected_eyes",
                    observation_notes="Face clearly observed without mandatory safety glasses"
                )
        elif is_head_visible:
            if is_top_truncated or height < 15.0:
                glasses_state = PPEState(
                    status="UNKNOWN",
                    confidence=0.0,
                    observation_notes="Facial region truncated or resolution too low for definitive glasses inspection"
                )
            else:
                glasses_state = PPEState(
                    status="MISSING",
                    confidence=round(person_confidence, 3),
                    detected_item="unprotected_eyes",
                    observation_notes="Face clearly observed without mandatory safety glasses"
                )
        else:
            glasses_state = PPEState(
                status="UNKNOWN",
                confidence=0.0,
                observation_notes="Facial region not observed or occluded"
            )

        # 6. FACE MASK ASSESSMENT
        masks = [d for d in associated_items if d['norm_class'] in ['face-mask']]
        best_mask = max(masks, key=lambda x: x['confidence']) if masks else None

        mask_state: PPEState
        if best_mask:
            mask_state = PPEState(
                status="PRESENT",
                confidence=round(best_mask['confidence'], 3),
                detected_item="face-mask",
                observation_notes="Protective face mask detected"
            )
        elif len(heads) > 0:
            if is_top_truncated or height < 15.0:
                mask_state = PPEState(
                    status="UNKNOWN",
                    confidence=0.0,
                    observation_notes="Facial region truncated or resolution too low for definitive mask inspection"
                )
            else:
                best_head = max(heads, key=lambda x: x['confidence'])
                mask_state = PPEState(
                    status="MISSING",
                    confidence=round(best_head['confidence'], 3),
                    detected_item="uncovered_face",
                    observation_notes="Face clearly observed without protective mask"
                )
        else:
            mask_state = PPEState(
                status="UNKNOWN",
                confidence=0.0,
                observation_notes="Facial region not observed or occluded"
            )

        # 7. FACE GUARD ASSESSMENT
        guards = [d for d in associated_items if d['norm_class'] in ['face-guard']]
        best_guard = max(guards, key=lambda x: x['confidence']) if guards else None

        guard_state: PPEState
        if best_guard:
            guard_state = PPEState(
                status="PRESENT",
                confidence=round(best_guard['confidence'], 3),
                detected_item="face-guard",
                observation_notes="Protective face guard / shield detected"
            )
        elif len(heads) > 0:
            if is_top_truncated or height < 15.0:
                guard_state = PPEState(
                    status="UNKNOWN",
                    confidence=0.0,
                    observation_notes="Head region truncated or resolution too low for face guard inspection"
                )
            else:
                best_head = max(heads, key=lambda x: x['confidence'])
                guard_state = PPEState(
                    status="MISSING",
                    confidence=round(best_head['confidence'], 3),
                    detected_item="unshielded_face",
                    observation_notes="Head clearly observed without protective face shield"
                )
        else:
            guard_state = PPEState(
                status="UNKNOWN",
                confidence=0.0,
                observation_notes="Head region not observed or occluded"
            )

        # 8. SAFETY SUIT ASSESSMENT
        suits = [d for d in associated_items if d['norm_class'] in ['safety-suit', 'medical-suit']]
        best_suit = max(suits, key=lambda x: x['confidence']) if suits else None

        suit_state: PPEState
        if best_suit:
            suit_state = PPEState(
                status="PRESENT",
                confidence=round(best_suit['confidence'], 3),
                detected_item="safety-suit",
                observation_notes="Full-body safety / protective suit detected"
            )
        else:
            if is_torso_visible:
                suit_state = PPEState(
                    status="MISSING",
                    confidence=round(person_confidence, 3),
                    detected_item="standard_clothing",
                    observation_notes="Worker visible in standard clothing without required full safety suit"
                )
            else:
                suit_state = PPEState(
                    status="UNKNOWN",
                    confidence=0.0,
                    observation_notes="Torso visibility insufficient for definitive suit verification"
                )

        additional_ppe = {
            "glasses": glasses_state,
            "face-mask": mask_state,
            "face-guard": guard_state,
            "safety-suit": suit_state
        }

        # Resolution of Required PPE against SafeVision Registry & Ontology
        req = required_ppe or ["helmet", "safety-vest"]
        violations: List[str] = []
        assessments: List[PPEAssessmentItem] = []
        expected_regions: List[ExpectedRegion] = []

        resolved_req: List[Dict[str, Any]] = []
        for item in req:
            item_str = str(item).strip()
            item_norm = item_str.lower().replace("_", "-")
            reg_entry = None
            if item_str.upper().startswith("SV-PPE-"):
                reg_entry = self.ppe_registry.get_class_by_id(item_str)
            if not reg_entry:
                reg_entry = self.ppe_registry.get_class_by_name(item_norm)
            if not reg_entry:
                reg_entry = self.ppe_registry.resolve_alias(item_norm)

            sv_id = reg_entry.get("id") if reg_entry else None
            display_name = reg_entry.get("displayName") if reg_entry else item_norm.replace("-", " ").title()
            norm_name = reg_entry.get("name") if reg_entry else item_norm

            resolved_req.append({
                "raw": item_str,
                "norm": norm_name,
                "entry": reg_entry,
                "sv_id": sv_id,
                "displayName": display_name
            })

        # Process each required item
        for r in resolved_req:
            sv_id = r["sv_id"]
            norm_name = r["norm"]
            disp_name = r["displayName"]
            entry = r["entry"]

            # Check if class is unknown/unregistered in ontology
            if not entry and not sv_id:
                asst = PPEAssessmentItem(
                    item_name=norm_name,
                    display_name=disp_name,
                    safe_vision_class_id=None,
                    status="UNSUPPORTED",
                    confidence=0.0,
                    evidence=None,
                    association=None,
                    reason=f"Category '{r['raw']}' is unsupported or unregistered in SafeVision ontology.",
                    is_expected_region=False
                )
                assessments.append(asst)
                additional_ppe[norm_name] = PPEState(
                    status="UNSUPPORTED",
                    confidence=0.0,
                    observation_notes=asst.reason
                )
                continue

            # Check Active Model Support (Phase 12.3 Rule: Registered is NOT automatically trained)
            # A class must be in current_supported_ids to be model-supported
            is_model_supported = bool(sv_id and sv_id in current_supported_ids)

            if not is_model_supported:
                # Untrained class (e.g. SV-PPE-018 lab-coat with NO_TRAINING_DATA)
                asst = PPEAssessmentItem(
                    item_name=norm_name,
                    display_name=disp_name,
                    safe_vision_class_id=sv_id,
                    status="NOT_ASSESSABLE",
                    confidence=0.0,
                    evidence=None,
                    association=entry.get("subCategory") if entry else None,
                    reason="Active model does not support this class.",
                    is_expected_region=False
                )
                assessments.append(asst)
                state = PPEState(
                    status="NOT_ASSESSABLE",
                    confidence=0.0,
                    observation_notes="Active model does not support this class."
                )
                if sv_id:
                    additional_ppe[sv_id] = state
                additional_ppe[norm_name] = state
                continue

            # Class IS supported by active model: evaluate positive evidence or missing
            # 1. Helmet
            if sv_id == "SV-PPE-002" or norm_name in ["helmet", "hard-hat", "safety-helmet"]:
                if helmet_state.status == "PRESENT":
                    asst = PPEAssessmentItem(
                        item_name="helmet",
                        display_name="Safety Helmet",
                        safe_vision_class_id="SV-PPE-002",
                        status="PRESENT",
                        confidence=helmet_state.confidence,
                        evidence="detected PPE bbox",
                        association="head region",
                        reason=helmet_state.observation_notes,
                        bbox=best_helmet['bbox'] if best_helmet else None,
                        is_expected_region=False
                    )
                elif helmet_state.status == "MISSING":
                    violations.append("missing_helmet")
                    asst = PPEAssessmentItem(
                        item_name="helmet",
                        display_name="Safety Helmet",
                        safe_vision_class_id="SV-PPE-002",
                        status="MISSING",
                        confidence=helmet_state.confidence,
                        evidence="detected NoHelmet bbox" if best_no_helmet else "expected head region",
                        association="head region",
                        reason=helmet_state.observation_notes,
                        bbox=best_no_helmet['bbox'] if best_no_helmet else head_region,
                        is_expected_region=False if best_no_helmet else True
                    )
                    expected_regions.append(ExpectedRegion(
                        item_name="helmet",
                        safe_vision_class_id="SV-PPE-002",
                        target_region_name="head_region",
                        bbox=best_no_helmet['bbox'] if best_no_helmet else head_region,
                        is_detector_box=False,
                        annotation_type="MISSING_PPE_EXPECTED_REGION",
                        label="HELMET — MISSING",
                        description="Worker observed without safety helmet (NoHelmet detected)" if best_no_helmet else "Expected head region"
                    ))
                else:
                    asst = PPEAssessmentItem(
                        item_name="helmet",
                        display_name="Safety Helmet",
                        safe_vision_class_id="SV-PPE-002",
                        status="UNKNOWN",
                        confidence=0.0,
                        evidence=None,
                        association="head region",
                        reason=helmet_state.observation_notes,
                        is_expected_region=False
                    )
                assessments.append(asst)

            # 2. Safety Vest
            elif sv_id == "SV-PPE-003" or norm_name in ["safety-vest", "vest"]:
                if vest_state.status == "PRESENT":
                    asst = PPEAssessmentItem(
                        item_name="safety-vest",
                        display_name="Safety Vest",
                        safe_vision_class_id="SV-PPE-003",
                        status="PRESENT",
                        confidence=vest_state.confidence,
                        evidence="detected PPE bbox",
                        association="torso region",
                        reason=vest_state.observation_notes,
                        bbox=best_vest['bbox'] if best_vest else None,
                        is_expected_region=False
                    )
                elif vest_state.status == "MISSING":
                    violations.append("missing_vest")
                    asst = PPEAssessmentItem(
                        item_name="safety-vest",
                        display_name="Safety Vest",
                        safe_vision_class_id="SV-PPE-003",
                        status="MISSING",
                        confidence=vest_state.confidence,
                        evidence="detected NoVest bbox" if best_no_vest else "expected torso region",
                        association="torso region",
                        reason=vest_state.observation_notes,
                        bbox=best_no_vest['bbox'] if best_no_vest else torso_region,
                        is_expected_region=False if best_no_vest else True
                    )
                    expected_regions.append(ExpectedRegion(
                        item_name="safety-vest",
                        safe_vision_class_id="SV-PPE-003",
                        target_region_name="torso_region",
                        bbox=best_no_vest['bbox'] if best_no_vest else torso_region,
                        is_detector_box=False,
                        annotation_type="MISSING_PPE_EXPECTED_REGION",
                        label="SAFETY VEST — MISSING",
                        description="Worker observed without safety vest (NoVest detected)" if best_no_vest else "Expected torso region"
                    ))
                else:
                    asst = PPEAssessmentItem(
                        item_name="safety-vest",
                        display_name="Safety Vest",
                        safe_vision_class_id="SV-PPE-003",
                        status="UNKNOWN",
                        confidence=0.0,
                        evidence=None,
                        association="torso region",
                        reason=vest_state.observation_notes,
                        is_expected_region=False
                    )
                assessments.append(asst)

            # 3. Gloves
            elif sv_id == "SV-PPE-004" or norm_name in ["gloves", "glove"]:
                if gloves_state.status == "PRESENT":
                    asst = PPEAssessmentItem(
                        item_name="gloves",
                        display_name="Protective Gloves",
                        safe_vision_class_id="SV-PPE-004",
                        status="PRESENT",
                        confidence=gloves_state.confidence,
                        evidence="detected PPE bbox",
                        association="hand region",
                        reason=gloves_state.observation_notes,
                        bbox=best_glove['bbox'] if best_glove else None,
                        is_expected_region=False
                    )
                elif gloves_state.status == "MISSING":
                    violations.append("no_gloves")
                    best_h_box = max(hands, key=lambda x: x['confidence'])['bbox'] if hands else torso_region
                    asst = PPEAssessmentItem(
                        item_name="gloves",
                        display_name="Protective Gloves",
                        safe_vision_class_id="SV-PPE-004",
                        status="MISSING",
                        confidence=gloves_state.confidence,
                        evidence="expected hand region",
                        association="hand region",
                        reason=gloves_state.observation_notes,
                        bbox=best_h_box,
                        is_expected_region=True
                    )
                    expected_regions.append(ExpectedRegion(
                        item_name="gloves",
                        safe_vision_class_id="SV-PPE-004",
                        target_region_name="hand_region",
                        bbox=best_h_box,
                        is_detector_box=False,
                        annotation_type="MISSING_PPE_EXPECTED_REGION",
                        label="GLOVES — MISSING",
                        description="Expected hand region"
                    ))
                else:
                    asst = PPEAssessmentItem(
                        item_name="gloves",
                        display_name="Protective Gloves",
                        safe_vision_class_id="SV-PPE-004",
                        status="NOT_ASSESSABLE",
                        confidence=0.0,
                        evidence=None,
                        association="hand region",
                        reason=gloves_state.observation_notes,
                        is_expected_region=False
                    )
                assessments.append(asst)

            # 4. Shoes
            elif sv_id == "SV-PPE-005" or norm_name in ["shoes", "boots", "safety-shoes"]:
                if shoes_state.status == "PRESENT":
                    asst = PPEAssessmentItem(
                        item_name="shoes",
                        display_name="Safety Shoes",
                        safe_vision_class_id="SV-PPE-005",
                        status="PRESENT",
                        confidence=shoes_state.confidence,
                        evidence="detected PPE bbox",
                        association="foot region",
                        reason=shoes_state.observation_notes,
                        bbox=best_shoe['bbox'] if best_shoe else None,
                        is_expected_region=False
                    )
                elif shoes_state.status == "MISSING":
                    violations.append("no_safety_footwear")
                    asst = PPEAssessmentItem(
                        item_name="shoes",
                        display_name="Safety Shoes",
                        safe_vision_class_id="SV-PPE-005",
                        status="MISSING",
                        confidence=shoes_state.confidence,
                        evidence="expected foot region",
                        association="foot region",
                        reason=shoes_state.observation_notes,
                        bbox=feet_region,
                        is_expected_region=True
                    )
                    expected_regions.append(ExpectedRegion(
                        item_name="shoes",
                        safe_vision_class_id="SV-PPE-005",
                        target_region_name="foot_region",
                        bbox=feet_region,
                        is_detector_box=False,
                        annotation_type="MISSING_PPE_EXPECTED_REGION",
                        label="SAFETY SHOES — MISSING",
                        description="Expected foot region"
                    ))
                else:
                    asst = PPEAssessmentItem(
                        item_name="shoes",
                        display_name="Safety Shoes",
                        safe_vision_class_id="SV-PPE-005",
                        status="NOT_ASSESSABLE",
                        confidence=0.0,
                        evidence=None,
                        association="foot region",
                        reason=shoes_state.observation_notes,
                        is_expected_region=False
                    )
                assessments.append(asst)

            # 5. Glasses
            elif sv_id == "SV-PPE-006" or norm_name in ["glasses", "eye-protection"]:
                if glasses_state.status == "PRESENT":
                    asst = PPEAssessmentItem(
                        item_name="glasses",
                        display_name="Safety Glasses",
                        safe_vision_class_id="SV-PPE-006",
                        status="PRESENT",
                        confidence=glasses_state.confidence,
                        evidence="detected PPE bbox",
                        association="eye region",
                        reason=glasses_state.observation_notes,
                        bbox=best_glasses['bbox'] if best_glasses else None,
                        is_expected_region=False
                    )
                elif glasses_state.status == "MISSING":
                    violations.append("missing_glasses")
                    asst = PPEAssessmentItem(
                        item_name="glasses",
                        display_name="Safety Glasses",
                        safe_vision_class_id="SV-PPE-006",
                        status="MISSING",
                        confidence=glasses_state.confidence,
                        evidence="expected eye region",
                        association="eye region",
                        reason=glasses_state.observation_notes,
                        bbox=head_region,
                        is_expected_region=True
                    )
                    expected_regions.append(ExpectedRegion(
                        item_name="glasses",
                        safe_vision_class_id="SV-PPE-006",
                        target_region_name="head_region",
                        bbox=head_region,
                        is_detector_box=False,
                        annotation_type="MISSING_PPE_EXPECTED_REGION",
                        label="SAFETY GLASSES — MISSING",
                        description="Expected eye region"
                    ))
                else:
                    asst = PPEAssessmentItem(
                        item_name="glasses",
                        display_name="Safety Glasses",
                        safe_vision_class_id="SV-PPE-006",
                        status="NOT_ASSESSABLE",
                        confidence=0.0,
                        evidence=None,
                        association="eye region",
                        reason=glasses_state.observation_notes,
                        is_expected_region=False
                    )
                assessments.append(asst)

            # 6. Face Mask
            elif sv_id == "SV-PPE-007" or norm_name in ["face-mask", "mask"]:
                if mask_state.status == "PRESENT":
                    asst = PPEAssessmentItem(
                        item_name="face-mask",
                        display_name="Face Mask",
                        safe_vision_class_id="SV-PPE-007",
                        status="PRESENT",
                        confidence=mask_state.confidence,
                        evidence="detected PPE bbox",
                        association="face region",
                        reason=mask_state.observation_notes,
                        bbox=best_mask['bbox'] if best_mask else None,
                        is_expected_region=False
                    )
                elif mask_state.status == "MISSING":
                    violations.append("missing_mask")
                    asst = PPEAssessmentItem(
                        item_name="face-mask",
                        display_name="Face Mask",
                        safe_vision_class_id="SV-PPE-007",
                        status="MISSING",
                        confidence=mask_state.confidence,
                        evidence="expected face region",
                        association="face region",
                        reason=mask_state.observation_notes,
                        bbox=head_region,
                        is_expected_region=True
                    )
                    expected_regions.append(ExpectedRegion(
                        item_name="face-mask",
                        safe_vision_class_id="SV-PPE-007",
                        target_region_name="head_region",
                        bbox=head_region,
                        is_detector_box=False,
                        annotation_type="MISSING_PPE_EXPECTED_REGION",
                        label="FACE MASK — MISSING",
                        description="Expected face region"
                    ))
                else:
                    asst = PPEAssessmentItem(
                        item_name="face-mask",
                        display_name="Face Mask",
                        safe_vision_class_id="SV-PPE-007",
                        status="NOT_ASSESSABLE",
                        confidence=0.0,
                        evidence=None,
                        association="face region",
                        reason=mask_state.observation_notes,
                        is_expected_region=False
                    )
                assessments.append(asst)

            # 7. Face Guard
            elif sv_id == "SV-PPE-009" or norm_name in ["face-guard"]:
                if guard_state.status == "PRESENT":
                    asst = PPEAssessmentItem(
                        item_name="face-guard",
                        display_name="Face Guard",
                        safe_vision_class_id="SV-PPE-009",
                        status="PRESENT",
                        confidence=guard_state.confidence,
                        evidence="detected PPE bbox",
                        association="face region",
                        reason=guard_state.observation_notes,
                        bbox=best_guard['bbox'] if best_guard else None,
                        is_expected_region=False
                    )
                elif guard_state.status == "MISSING":
                    violations.append("missing_face_guard")
                    asst = PPEAssessmentItem(
                        item_name="face-guard",
                        display_name="Face Guard",
                        safe_vision_class_id="SV-PPE-009",
                        status="MISSING",
                        confidence=guard_state.confidence,
                        evidence="expected face region",
                        association="face region",
                        reason=guard_state.observation_notes,
                        bbox=head_region,
                        is_expected_region=True
                    )
                    expected_regions.append(ExpectedRegion(
                        item_name="face-guard",
                        safe_vision_class_id="SV-PPE-009",
                        target_region_name="head_region",
                        bbox=head_region,
                        is_detector_box=False,
                        annotation_type="MISSING_PPE_EXPECTED_REGION",
                        label="FACE GUARD — MISSING",
                        description="Expected face region"
                    ))
                else:
                    asst = PPEAssessmentItem(
                        item_name="face-guard",
                        display_name="Face Guard",
                        safe_vision_class_id="SV-PPE-009",
                        status="NOT_ASSESSABLE",
                        confidence=0.0,
                        evidence=None,
                        association="face region",
                        reason=guard_state.observation_notes,
                        is_expected_region=False
                    )
                assessments.append(asst)

            # 8. Safety Suit
            elif sv_id in ["SV-PPE-010", "SV-PPE-011"] or norm_name in ["safety-suit", "medical-suit"]:
                if suit_state.status == "PRESENT":
                    asst = PPEAssessmentItem(
                        item_name="safety-suit",
                        display_name="Safety Suit",
                        safe_vision_class_id=sv_id or "SV-PPE-010",
                        status="PRESENT",
                        confidence=suit_state.confidence,
                        evidence="detected PPE bbox",
                        association="full body region",
                        reason=suit_state.observation_notes,
                        bbox=best_suit['bbox'] if best_suit else None,
                        is_expected_region=False
                    )
                elif suit_state.status == "MISSING":
                    violations.append("missing_safety_suit")
                    asst = PPEAssessmentItem(
                        item_name="safety-suit",
                        display_name="Safety Suit",
                        safe_vision_class_id=sv_id or "SV-PPE-010",
                        status="MISSING",
                        confidence=suit_state.confidence,
                        evidence="expected torso region",
                        association="full body region",
                        reason=suit_state.observation_notes,
                        bbox=torso_region,
                        is_expected_region=True
                    )
                    expected_regions.append(ExpectedRegion(
                        item_name="safety-suit",
                        safe_vision_class_id=sv_id or "SV-PPE-010",
                        target_region_name="torso_region",
                        bbox=torso_region,
                        is_detector_box=False,
                        annotation_type="MISSING_PPE_EXPECTED_REGION",
                        label="SAFETY SUIT — MISSING",
                        description="Expected torso region"
                    ))
                else:
                    asst = PPEAssessmentItem(
                        item_name="safety-suit",
                        display_name="Safety Suit",
                        safe_vision_class_id=sv_id or "SV-PPE-010",
                        status="NOT_ASSESSABLE",
                        confidence=0.0,
                        evidence=None,
                        association="full body region",
                        reason=suit_state.observation_notes,
                        is_expected_region=False
                    )
                assessments.append(asst)

            # 9. Generic Custom Class supported by an active model module
            else:
                matching_items = [
                    d for d in associated_items
                    if (sv_id and d.get("safe_vision_class_id") == sv_id) or d.get("norm_class") == norm_name
                ]
                sub_cat = entry.get("subCategory", "") if entry else ""

                if len(matching_items) > 0:
                    best_m = max(matching_items, key=lambda x: x["confidence"])
                    asst = PPEAssessmentItem(
                        item_name=norm_name,
                        display_name=disp_name,
                        safe_vision_class_id=sv_id,
                        status="PRESENT",
                        confidence=round(best_m["confidence"], 3),
                        evidence="detected PPE bbox",
                        association=sub_cat or "body region",
                        reason=f"{disp_name} detected on worker",
                        bbox=best_m["bbox"],
                        is_expected_region=False
                    )
                    additional_ppe[norm_name] = PPEState(
                        status="PRESENT",
                        confidence=round(best_m["confidence"], 3),
                        detected_item=norm_name,
                        observation_notes=asst.reason
                    )
                else:
                    # Check anatomical visibility for this sub-category
                    if "Head" in sub_cat:
                        is_reg_vis = is_head_visible
                        reg_box = head_region
                    elif "Hand" in sub_cat:
                        is_reg_vis = len(hands) > 0
                        reg_box = torso_region
                    elif "Foot" in sub_cat:
                        is_reg_vis = len(feet) > 0 and not is_bottom_truncated
                        reg_box = feet_region
                    else:
                        is_reg_vis = is_torso_visible
                        reg_box = torso_region

                    if is_reg_vis:
                        viol_key = f"missing_{norm_name}"
                        violations.append(viol_key)
                        asst = PPEAssessmentItem(
                            item_name=norm_name,
                            display_name=disp_name,
                            safe_vision_class_id=sv_id,
                            status="MISSING",
                            confidence=round(person_confidence, 3),
                            evidence=f"expected {sub_cat or 'body region'}",
                            association=sub_cat or "body region",
                            reason=f"Required {disp_name} missing on observed worker body",
                            bbox=reg_box,
                            is_expected_region=True
                        )
                        expected_regions.append(ExpectedRegion(
                            item_name=norm_name,
                            safe_vision_class_id=sv_id,
                            target_region_name=sub_cat or "body_region",
                            bbox=reg_box,
                            is_detector_box=False,
                            annotation_type="MISSING_PPE_EXPECTED_REGION",
                            label=f"{disp_name.upper()} — MISSING",
                            description=f"Expected {sub_cat or 'body region'}"
                        ))
                        additional_ppe[norm_name] = PPEState(
                            status="MISSING",
                            confidence=round(person_confidence, 3),
                            detected_item=f"missing_{norm_name}",
                            observation_notes=asst.reason
                        )
                    else:
                        asst = PPEAssessmentItem(
                            item_name=norm_name,
                            display_name=disp_name,
                            safe_vision_class_id=sv_id,
                            status="NOT_ASSESSABLE",
                            confidence=0.0,
                            evidence=None,
                            association=sub_cat or "body region",
                            reason=f"Worker body region occluded or truncated for {disp_name} verification",
                            is_expected_region=False
                        )
                        additional_ppe[norm_name] = PPEState(
                            status="UNKNOWN",
                            confidence=0.0,
                            observation_notes=asst.reason
                        )
                assessments.append(asst)

        # Check combined violation
        if "missing_helmet" in violations and "missing_vest" in violations and "no_helmet_and_no_vest" not in violations:
            violations.append("no_helmet_and_no_vest")

        # Compute authoritative compliance state
        if len(violations) > 0:
            compliance_state = "NON-COMPLIANT"
        elif any(a.status == "NOT_ASSESSABLE" for a in assessments):
            compliance_state = "NOT_ASSESSABLE"
        elif any(a.status in ["UNKNOWN", "UNSUPPORTED"] for a in assessments):
            compliance_state = "UNKNOWN"
        else:
            compliance_state = "COMPLIANT"

        return TrackPPEEvaluation(
            track_id=track_id,
            person_bbox=person_bbox,
            person_confidence=person_confidence,
            helmet=helmet_state,
            vest=vest_state,
            gloves=gloves_state,
            shoes=shoes_state,
            additional_ppe=additional_ppe,
            violations=violations,
            is_compliant=(compliance_state == "COMPLIANT"),
            compliance_state=compliance_state,
            assessments=assessments,
            expected_regions=expected_regions,
            detected_ppe_items=detected_ppe_names,
            required_ppe_items=[r["norm"] for r in resolved_req]
        )


_default_engine: Optional[PPEAssociationEngine] = None

def get_default_engine() -> PPEAssociationEngine:
    global _default_engine
    if _default_engine is None:
        _default_engine = PPEAssociationEngine()
    return _default_engine

def get_target_region_for_class(class_name: str, safe_vision_class_id: Optional[str] = None) -> str:
    return get_default_engine().get_target_region_for_class(class_name, safe_vision_class_id)

def compute_association_score(
    arg1: Any,
    arg2: Any,
    target_region_name: Optional[str] = None,
    person_conf: float = 1.0,
    ppe_conf: float = 1.0
) -> AssociationScore:
    engine = get_default_engine()
    
    def _extract_bbox_and_det(val: Any) -> Tuple[List[float], Dict[str, Any]]:
        if isinstance(val, (list, tuple)) and len(val) == 4 and all(isinstance(x, (int, float)) for x in val):
            return [float(x) for x in val], {}
        if isinstance(val, dict):
            b = val.get("bbox") or val.get("box_2d") or [0.0, 0.0, 0.0, 0.0]
            return [float(x) for x in b], val
        if hasattr(val, "bbox"):
            b = getattr(val, "bbox") or [0.0, 0.0, 0.0, 0.0]
            d = val.__dict__ if hasattr(val, "__dict__") else {}
            return [float(x) for x in b], d
        if hasattr(val, "box_2d"):
            b = getattr(val, "box_2d") or [0.0, 0.0, 0.0, 0.0]
            d = val.__dict__ if hasattr(val, "__dict__") else {}
            return [float(x) for x in b], d
        return [0.0, 0.0, 0.0, 0.0], {}

    b1, d1 = _extract_bbox_and_det(arg1)
    b2, d2 = _extract_bbox_and_det(arg2)

    cn1 = (d1.get("class_name") or "").lower().replace("_", "-")
    if cn1 and cn1 not in ["person", "worker"]:
        person_bbox = b2
        ppe_bbox = b1
        sv_id = d1.get("safe_vision_class_id")
        t_name = target_region_name or engine.get_target_region_for_class(cn1, sv_id)
        p_c = person_conf
        ppe_c = d1.get("confidence", ppe_conf) or ppe_conf
    else:
        person_bbox = b1
        ppe_bbox = b2
        cn2 = (d2.get("class_name") or "").lower().replace("_", "-")
        sv_id = d2.get("safe_vision_class_id")
        t_name = target_region_name or (engine.get_target_region_for_class(cn2, sv_id) if cn2 else "BODY")
        p_c = person_conf
        ppe_c = d2.get("confidence", ppe_conf) if d2 else ppe_conf

    return engine.compute_association_score(person_bbox, ppe_bbox, t_name, person_conf=p_c, ppe_conf=ppe_c)

def associate_frame_ppe(
    persons: List[Dict[str, Any]],
    frame_detections: List[Any]
) -> Dict[str, List[Any]]:
    return get_default_engine().associate_frame_ppe(persons, frame_detections)

def evaluate_multi_person_frame(
    persons: List[Dict[str, Any]],
    frame_detections: List[Any],
    required_ppe: Optional[List[str]] = None,
    active_supported_class_ids: Optional[Set[str]] = None
) -> MultiPersonEvaluationResult:
    return get_default_engine().evaluate_multi_person_frame(
        persons=persons,
        frame_detections=frame_detections,
        required_ppe=required_ppe,
        active_supported_class_ids=active_supported_class_ids
    )

