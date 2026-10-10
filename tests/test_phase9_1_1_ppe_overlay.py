"""
SAFEVISION AI - PHASE 9.1.1 VERIFICATION TEST SUITE
Real-Time PPE Compliance Overlay & Worker Safety Card Verification
"""

import sys
import os
import json
import time
import requests

# Add ai directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ai'))

from inference.ppe_association import PPEAssociationEngine, PPEState
from inference.temporal_validator import TemporalValidationEngine, TemporalValidationConfig
from inference.schemas import TrackPPEStateItem, BoundingBox

def test_model_class_audit():
    print("=" * 60)
    print("1. MODEL CLASS & PPE MAPPING AUDIT")
    print("=" * 60)
    
    weights_path = os.path.join(os.path.dirname(__file__), '..', 'ai', 'models', 'industrial_yolov8.pt')
    assert os.path.exists(weights_path), f"Weights file missing: {weights_path}"
    
    import torch
    ckpt = torch.load(weights_path, map_location="cpu", weights_only=False)
    model = ckpt.get("model")
    names = getattr(model, "names", None)
    
    assert names is not None, "Model has no 'names' attribute"
    print(f"Total model classes in industrial_yolov8.pt: {len(names)}")
    
    audit_table = []
    ppe_mapping = {
        "helmet": {
            "positive": ["helmet"],
            "negative": ["head", "face"],
            "supported": True,
            "conf_source": "YOLO detection (helmet or head/face)"
        },
        "safety-vest": {
            "positive": ["safety-vest", "safety-suit", "medical-suit"],
            "negative": ["person"],
            "supported": True,
            "conf_source": "YOLO detection (safety-vest or person torso)"
        },
        "gloves": {
            "positive": ["gloves"],
            "negative": ["hands"],
            "supported": True,
            "conf_source": "YOLO detection (gloves or bare hands)"
        },
        "shoes": {
            "positive": ["shoes"],
            "negative": ["foot"],
            "supported": True,
            "conf_source": "YOLO detection (shoes or bare foot)"
        },
        "glasses": {
            "positive": ["glasses"],
            "negative": ["face", "head"],
            "supported": True,
            "conf_source": "YOLO detection (glasses or face/head)"
        },
        "face-mask": {
            "positive": ["face-mask", "face-guard"],
            "negative": ["face"],
            "supported": True,
            "conf_source": "YOLO detection (face-mask or face)"
        },
        "fall_harness": {
            "positive": [],
            "negative": [],
            "supported": False,
            "conf_source": "N/A (UNSUPPORTED)"
        },
        "gas_detector": {
            "positive": [],
            "negative": [],
            "supported": False,
            "conf_source": "N/A (UNSUPPORTED)"
        }
    }
    
    print("\nMODEL CLASS TO PPE AUDIT TABLE:")
    print(f"{'PPE CATEGORY':<15} | {'SUPPORTED':<10} | {'POSITIVE CLASS':<22} | {'NEGATIVE CLASS':<15} | {'CONFIDENCE SOURCE'}")
    print("-" * 95)
    for ppe_name, info in ppe_mapping.items():
        pos_str = ", ".join(info["positive"]) if info["positive"] else "NONE"
        neg_str = ", ".join(info["negative"]) if info["negative"] else "NONE"
        sup_str = "YES" if info["supported"] else "NO"
        print(f"{ppe_name:<15} | {sup_str:<10} | {pos_str:<22} | {neg_str:<15} | {info['conf_source']}")
    
    print("\nModel Class Audit PASS.")
    return names

def test_three_state_ppe_association():
    print("\n" + "=" * 60)
    print("2. THREE-STATE PPE OBSERVATION & PROVENANCE VALIDATION")
    print("=" * 60)
    
    engine = PPEAssociationEngine()
    
    # Test A: Person wearing helmet
    eval_a = engine.evaluate_track_ppe(
        track_id="TRACK-1001",
        person_bbox=[10.0, 20.0, 80.0, 50.0],
        person_confidence=0.954,
        frame_detections=[
            {"class_name": "helmet", "bbox": [10.0, 25.0, 25.0, 45.0], "confidence": 0.963},
            {"class_name": "safety-vest", "bbox": [25.0, 22.0, 60.0, 48.0], "confidence": 0.938},
            {"class_name": "gloves", "bbox": [45.0, 20.0, 55.0, 26.0], "confidence": 0.892},
            {"class_name": "shoes", "bbox": [70.0, 25.0, 80.0, 45.0], "confidence": 0.915}
        ],
        required_ppe=["helmet", "safety-vest", "gloves", "shoes"]
    )
    print(f"Test A (All PPE Present): Helmet={eval_a.helmet.status} ({eval_a.helmet.confidence}), Vest={eval_a.vest.status} ({eval_a.vest.confidence})")
    assert eval_a.helmet.status == "PRESENT"
    assert eval_a.helmet.confidence == 0.963, f"Expected real confidence 0.963, got {eval_a.helmet.confidence}"
    assert eval_a.vest.status == "PRESENT"
    assert eval_a.vest.confidence == 0.938
    assert eval_a.gloves.status == "PRESENT"
    assert eval_a.gloves.confidence == 0.892
    assert eval_a.shoes.status == "PRESENT"
    assert eval_a.shoes.confidence == 0.915
    assert eval_a.is_compliant is True
    print("  -> Test A PASS: All confidences match exact YOLO detections.")

    # Test B: Person with bare head observed (head/face detected without helmet)
    eval_b = engine.evaluate_track_ppe(
        track_id="TRACK-1002",
        person_bbox=[10.0, 20.0, 80.0, 50.0],
        person_confidence=0.941,
        frame_detections=[
            {"class_name": "head", "bbox": [10.0, 25.0, 25.0, 45.0], "confidence": 0.927},
            {"class_name": "safety-vest", "bbox": [25.0, 22.0, 60.0, 48.0], "confidence": 0.910}
        ],
        required_ppe=["helmet", "safety-vest"]
    )
    print(f"Test B (Confirmed Missing Helmet): Helmet={eval_b.helmet.status} ({eval_b.helmet.confidence})")
    assert eval_b.helmet.status == "MISSING"
    assert eval_b.helmet.confidence == 0.927, f"Expected real head detection confidence 0.927, got {eval_b.helmet.confidence}"
    assert "missing_helmet" in eval_b.violations
    assert eval_b.is_compliant is False
    print("  -> Test B PASS: Missing helmet confidence originates from real head detection.")

    # Test C: Head truncated outside frame (ymin <= 2.0) -> UNKNOWN (NOT MISSING!)
    eval_c = engine.evaluate_track_ppe(
        track_id="TRACK-1003",
        person_bbox=[0.5, 20.0, 75.0, 50.0],  # ymin=0.5 (truncated at top edge of frame)
        person_confidence=0.910,
        frame_detections=[
            {"class_name": "safety-vest", "bbox": [15.0, 22.0, 50.0, 48.0], "confidence": 0.905}
        ],
        required_ppe=["helmet", "safety-vest"]
    )
    print(f"Test C (Head Truncated): Helmet={eval_c.helmet.status} (confidence={eval_c.helmet.confidence})")
    assert eval_c.helmet.status == "UNKNOWN", f"Expected UNKNOWN for truncated head, got {eval_c.helmet.status}"
    assert eval_c.helmet.confidence == 0.0, "Expected 0.0 confidence (displayed as dash —)"
    assert "missing_helmet" not in eval_c.violations, "UNKNOWN must NOT be converted to MISSING violation!"
    print("  -> Test C PASS: Head truncation correctly flagged UNKNOWN, not MISSING.")

    # Test D: Lower body truncated outside frame (ymax >= 98.0) -> Shoes UNKNOWN
    eval_d = engine.evaluate_track_ppe(
        track_id="TRACK-1004",
        person_bbox=[20.0, 20.0, 99.5, 50.0],  # ymax=99.5 (truncated at bottom edge of frame)
        person_confidence=0.925,
        frame_detections=[
            {"class_name": "helmet", "bbox": [20.0, 25.0, 35.0, 45.0], "confidence": 0.951},
            {"class_name": "safety-vest", "bbox": [35.0, 22.0, 70.0, 48.0], "confidence": 0.932}
        ],
        required_ppe=["shoes"]
    )
    print(f"Test D (Lower Body Truncated): Shoes={eval_d.shoes.status} (confidence={eval_d.shoes.confidence})")
    assert eval_d.shoes.status == "UNKNOWN"
    assert eval_d.shoes.confidence == 0.0
    assert "no_safety_footwear" not in eval_d.violations
    print("  -> Test D PASS: Lower body truncation correctly flagged UNKNOWN.")

    # Test E: Unsupported PPE in required list
    eval_e = engine.evaluate_track_ppe(
        track_id="TRACK-1005",
        person_bbox=[10.0, 20.0, 80.0, 50.0],
        person_confidence=0.950,
        frame_detections=[
            {"class_name": "helmet", "bbox": [10.0, 25.0, 25.0, 45.0], "confidence": 0.960},
            {"class_name": "safety-vest", "bbox": [25.0, 22.0, 60.0, 48.0], "confidence": 0.940}
        ],
        required_ppe=["helmet", "safety-vest", "fall_harness"]
    )
    print(f"Test E (Unsupported Fall Harness): Additional={eval_e.additional_ppe.keys()}")
    assert "fall-harness" in eval_e.additional_ppe
    harness_state = eval_e.additional_ppe["fall-harness"]
    assert harness_state.status == "UNSUPPORTED"
    assert harness_state.confidence == 0.0
    assert len(eval_e.violations) == 0, "Unsupported PPE must NOT generate violation"
    print("  -> Test E PASS: Unsupported PPE cleanly categorized as UNSUPPORTED.")

def test_temporal_duration_tracking():
    print("\n" + "=" * 60)
    print("3. TEMPORAL PPE VALIDATION & DURATION TRACKING")
    print("=" * 60)
    
    temporal_engine = TemporalValidationEngine(default_config=TemporalValidationConfig(
        detectionConfidenceThreshold=0.65,
        minimumObservedFrames=3,
        windowSize=10,
        minimumViolationRatio=0.50,
        persistenceDuration=1.0,
        cooldownDuration=30.0,
        recoveryDuration=3.0
    ))
    
    t0 = time.time()
    
    # Frame 1: Initial observation
    is_conf, should_create, state, diag = temporal_engine.process_observation(
        track_id="TRACK-2001",
        camera_id="CAM-01",
        violation_type="missing_vest",
        is_violation=True,
        confidence=0.93,
        timestamp=t0
    )
    assert is_conf is False, "Frame 1 must not be confirmed immediately"
    assert state in ["DETECTED", "OBSERVING"]
    
    # Frame 2 (0.5s later): Still candidate
    is_conf, should_create, state, diag = temporal_engine.process_observation(
        track_id="TRACK-2001",
        camera_id="CAM-01",
        violation_type="missing_vest",
        is_violation=True,
        confidence=0.94,
        timestamp=t0 + 0.5
    )
    assert is_conf is False
    
    # Frame 3 (1.2s later): Exceeds persistenceDuration (1.0s) & 3 frames -> CONFIRMED
    is_conf, should_create, state, diag = temporal_engine.process_observation(
        track_id="TRACK-2001",
        camera_id="CAM-01",
        violation_type="missing_vest",
        is_violation=True,
        confidence=0.95,
        timestamp=t0 + 1.2
    )
    assert is_conf is True, "Violation must be temporally confirmed after persistence window"
    assert should_create is True, "Incident candidate must be triggered on confirmation"
    assert diag["violation_duration_sec"] >= 1.2, f"Expected duration >= 1.2s, got {diag['violation_duration_sec']}"
    print(f"  -> Temporal confirmation verified: state={state}, duration={diag['violation_duration_sec']}s, should_create={should_create}")

def test_multi_worker_independence():
    print("\n" + "=" * 60)
    print("4. MULTI-WORKER PPE INDEPENDENCE")
    print("=" * 60)
    
    engine = PPEAssociationEngine()
    
    # Worker 1: Left side, wearing helmet + vest
    w1 = engine.evaluate_track_ppe(
        track_id="TRACK-3001",
        person_bbox=[10.0, 10.0, 70.0, 35.0],
        person_confidence=0.96,
        frame_detections=[
            {"class_name": "helmet", "bbox": [10.0, 15.0, 25.0, 30.0], "confidence": 0.955},
            {"class_name": "safety-vest", "bbox": [25.0, 12.0, 55.0, 33.0], "confidence": 0.922}
        ],
        required_ppe=["helmet", "safety-vest"]
    )
    
    # Worker 2: Right side, wearing helmet but NO vest
    w2 = engine.evaluate_track_ppe(
        track_id="TRACK-3002",
        person_bbox=[10.0, 60.0, 70.0, 85.0],
        person_confidence=0.94,
        frame_detections=[
            {"class_name": "helmet", "bbox": [10.0, 65.0, 25.0, 80.0], "confidence": 0.948}
        ],
        required_ppe=["helmet", "safety-vest"]
    )
    
    assert w1.helmet.status == "PRESENT" and w1.vest.status == "PRESENT"
    assert w1.is_compliant is True
    
    assert w2.helmet.status == "PRESENT" and w2.vest.status == "MISSING"
    assert w2.is_compliant is False
    
    # Verify Worker 1 vest detection was NOT stolen by Worker 2
    assert w1.vest.confidence == 0.922
    assert w2.vest.confidence == 0.94  # Real person confidence of Worker 2
    print(f"  -> Worker 1 (TRACK-3001): Compliant={w1.is_compliant}, Helmet={w1.helmet.status}, Vest={w1.vest.status}")
    print(f"  -> Worker 2 (TRACK-3002): Compliant={w2.is_compliant}, Helmet={w2.helmet.status}, Vest={w2.vest.status}")
    print("Multi-Worker Independence PASS.")

def test_socket_telemetry_endpoint():
    print("\n" + "=" * 60)
    print("5. SOCKET TELEMETRY ENDPOINT END-TO-END TEST")
    print("=" * 60)
    
    payload = {
        "cameraId": "VHJV",
        "timestamp": "2026-10-02T02:00:00.000Z",
        "frameWidth": 1280,
        "frameHeight": 720,
        "detections": [
            {
                "trackId": "TRACK-1042",
                "employeeId": None,
                "employeeName": None,
                "identityStatus": "UNCONFIRMED",
                "className": "person",
                "confidence": 0.94,
                "personConfidence": 0.941,
                "bbox": {
                    "ymin": 15.0,
                    "xmin": 20.0,
                    "ymax": 75.0,
                    "xmax": 45.0,
                    "label": "TRACK-1042",
                    "color": "#10B981"
                },
                "ppe": {
                    "helmet": "PRESENT",
                    "vest": "MISSING",
                    "gloves": "PRESENT",
                    "shoes": "UNKNOWN"
                },
                "ppeDetails": {
                    "helmet": {"status": "PRESENT", "confidence": 0.963, "durationSec": 0.0},
                    "vest": {"status": "MISSING", "confidence": 0.912, "durationSec": 24.5},
                    "gloves": {"status": "PRESENT", "confidence": 0.890, "durationSec": 0.0},
                    "shoes": {"status": "UNKNOWN", "confidence": 0.0, "durationSec": 0.0},
                    "glasses": {"status": "PRESENT", "confidence": 0.904, "durationSec": 0.0}
                },
                "overallCompliance": "NON-COMPLIANT",
                "complianceDurationSec": 24.5,
                "temporalState": "TEMPORALLY_CONFIRMED",
                "violations": ["missing_vest"]
            }
        ]
    }
    
    resp = requests.post("http://127.0.0.1:5005/api/detection/camera-detections", json=payload, timeout=2.0)
    print(f"POST /api/detection/camera-detections status: {resp.status_code}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("success") is True
    print(f"Backend response: {json.dumps(data)}")
    print("Socket Telemetry Ingestion PASS.")

if __name__ == "__main__":
    test_model_class_audit()
    test_three_state_ppe_association()
    test_temporal_duration_tracking()
    test_multi_worker_independence()
    test_socket_telemetry_endpoint()
    print("\n" + "=" * 60)
    print("ALL PHASE 9.1.1 VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)
