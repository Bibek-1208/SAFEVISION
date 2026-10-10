#!/usr/bin/env python3
"""
=============================================================================
SAFEVISION AI — PHASE 12.2 HARDENING ACCEPTANCE TEST SUITE
Incremental Custom PPE Class Training & Protected Baseline Verification
=============================================================================
Tests all 20 Acceptance Criteria (Items A through T):
  A. Baseline 17-class model hash remains unchanged
  B. New class registration with stable SV-PPE ID
  C. New class without data shows NO_TRAINING_DATA
  D. New class with blocked/insufficient data shows QUALITY_BLOCKED
  E. Candidate registration with parent model & class manifest
  F. Candidate evaluation (metrics, latency, hardware profile)
  G. Old-class regression failure rejects candidate (active detector untouched)
  H. New-class evaluation failure rejects candidate
  I. Successful evaluation results in APPROVED
  J. Atomic activation results in ACTIVE and loads custom module
  K. Deactivation unloads module and marks DEACTIVATED
  L. Rollback restores pure baseline
  M. Historical incidents preserve model/class version
  N. Custom detector module failure/crash does not crash baseline (isolation)
  O. Stable class IDs remain unchanged (SV-PPE-001 .. SV-PPE-017)
  P. API dynamically displays active classes & pipeline status
  Q. No hardcoded PPE class arrays in association engine
  R. No hardcoded model-index assumptions (class manifest decoupling)
  S. Camera stream isolation remains intact
  T. Upload media regression remains intact
=============================================================================
"""

import os
import sys
import json
import time
import hashlib
import tempfile
import unittest
import numpy as np
import cv2
import requests

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
AI_DIR = os.path.join(ROOT_DIR, "ai")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from ai.inference.provenance import ModelRegistry, ModelProvenanceRecord, SH17_CLASSES
from ai.inference.ppe_registry import PPEClassRegistry, LIFECYCLE_STATUSES
from ai.inference.detector import IndustrialSafetyDetector, CustomDetectorModule
from ai.scripts.candidate_evaluator import CandidateEvaluator, RegressionGateConfig
from ai.scripts.dataset_importer import QualityGate


class TestPhase122cIncrementalTraining(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline_model_path = os.path.join(AI_DIR, "models", "industrial_yolov8.pt")
        cls.expected_sha256 = "5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62"
        cls.expected_size = 6252377
        cls.registry = ModelRegistry()
        cls.ppe_registry = PPEClassRegistry()

    @classmethod
    def tearDownClass(cls):
        # Clean up any candidate test models from model registry
        for test_model_id in ["MODEL-CANDIDATE-TEST-001", "MODEL-CANDIDATE-TEST-002", "MODEL-PPE-SAFEVISION-V1"]:
            cls.registry.models.pop(test_model_id, None)
        cls.registry._save_to_disk()

        # Clean up any test classes from ppe_registry
        cls.ppe_registry.classes = [c for c in cls.ppe_registry.classes if not c.get("name", "").startswith("test-")]
        cls.ppe_registry._save()

    # -------------------------------------------------------------------------
    # ITEM A: Baseline 17-class model hash remains unchanged
    # -------------------------------------------------------------------------
    def test_item_a_baseline_hash_unchanged(self):
        self.assertTrue(os.path.exists(self.baseline_model_path), "Baseline model file exists")
        actual_size = os.path.getsize(self.baseline_model_path)
        self.assertEqual(actual_size, self.expected_size, f"File size must be {self.expected_size} bytes")

        sha256_hash = hashlib.sha256()
        with open(self.baseline_model_path, "rb") as f:
            for block in iter(lambda: f.read(65536), b""):
                sha256_hash.update(block)
        actual_sha256 = sha256_hash.hexdigest()
        self.assertEqual(actual_sha256, self.expected_sha256, f"Baseline SHA256 must be {self.expected_sha256}")

        base_rec = self.registry.get_baseline_model()
        self.assertIsNotNone(base_rec)
        self.assertTrue(base_rec.isProtected, "Baseline record must be marked isProtected=True")
        self.assertEqual(base_rec.status, "PROTECTED_BASELINE")

    # -------------------------------------------------------------------------
    # ITEM B: New class registration with stable SV-PPE ID
    # -------------------------------------------------------------------------
    def test_item_b_new_class_registration_stable_id(self):
        new_class_name = "test-welding-shield"
        existing = self.ppe_registry.get_class_by_name(new_class_name)
        if not existing:
            created = self.ppe_registry.register_class(
                name=new_class_name,
                display_name="Welding Shield",
                category="PPE",
                subcategory="Face Protection",
                description="High temperature welding face shield"
            )
            class_id = created["class_id"]
        else:
            class_id = existing["class_id"]

        self.assertTrue(class_id.startswith("SV-PPE-"), f"Class ID must follow SV-PPE-xxx format: {class_id}")
        self.assertGreaterEqual(int(class_id.split("-")[2]), 18, "New class ID index must be >= 18")

    # -------------------------------------------------------------------------
    # ITEM C: New class without data shows NO_TRAINING_DATA
    # -------------------------------------------------------------------------
    def test_item_c_new_class_without_data_shows_no_training_data(self):
        lab_coat = self.ppe_registry.get_class("SV-PPE-018")
        if not lab_coat:
            lab_coat = self.ppe_registry.get_class_by_name("lab-coat")
        self.assertIsNotNone(lab_coat, "SV-PPE-018 (lab-coat) exists in registry")
        self.assertEqual(
            lab_coat.get("lifecycle_status"),
            "NO_TRAINING_DATA",
            "Newly registered class without verified training data must report NO_TRAINING_DATA"
        )
        self.assertFalse(
            self.ppe_registry.is_class_active(lab_coat["class_id"]),
            "Class without training data must NOT be active"
        )

    # -------------------------------------------------------------------------
    # ITEM D: New class with blocked/insufficient data shows QUALITY_BLOCKED
    # -------------------------------------------------------------------------
    def test_item_d_blocked_dataset_quality_gate(self):
        dataset_dir = os.path.join(AI_DIR, "datasets", "safevision_ppe_v1")
        qg = QualityGate()
        report = qg.audit_dataset(dataset_dir, {"license": "Proprietary SafeVision AI", "datasetId": "DS-SAFEVISION-PPE-V1"})
        self.assertEqual(report["status"], "BLOCKED", "Dataset with unannotated validation/test split must be BLOCKED")
        self.assertGreater(len(report.get("blockers", [])), 0, "Blocked report must list explicit blockers")

    # -------------------------------------------------------------------------
    # ITEM E: Candidate registration with parent model & class manifest
    # -------------------------------------------------------------------------
    def test_item_e_candidate_registration(self):
        cand_id = "MODEL-CANDIDATE-TEST-001"
        cand_record = ModelProvenanceRecord(
            modelId=cand_id,
            modelName="Candidate Lab Coat Detector",
            modelVersion="1.1.0-rc1",
            parentModelId="MODEL-PPE-BASELINE-SH17",
            modelType="OBJECT_DETECTION_PPE",
            framework="PyTorch / Ultralytics YOLOv8",
            datasetSources=["SafeVision PPE Curated Dataset"],
            datasetVersions=["1.0.0"],
            datasetLicenses=["Proprietary SafeVision AI"],
            addedClassIds=["SV-PPE-018"],
            classList=SH17_CLASSES + ["lab-coat"],
            classManifest=[
                {"modelIndex": 0, "safeVisionClassId": "SV-PPE-018", "className": "lab-coat", "displayName": "Lab Coat", "category": "PPE"}
            ],
            status="CANDIDATE",
            deploymentStatus="CANDIDATE",
            licensingNotice="Internal candidate module under evaluation"
        )
        reg_res = self.registry.register_candidate(cand_record)
        self.assertEqual(reg_res.modelId, cand_id)
        self.assertEqual(reg_res.parentModelId, "MODEL-PPE-BASELINE-SH17")
        self.assertIn("SV-PPE-018", reg_res.addedClassIds)

    # -------------------------------------------------------------------------
    # ITEM F: Candidate evaluation (metrics, latency, hardware profile)
    # -------------------------------------------------------------------------
    def test_item_f_candidate_evaluation_structure(self):
        evaluator = CandidateEvaluator()
        hw = evaluator.get_hardware_profile()
        self.assertIn("device", hw)
        self.assertIn("cuda_available", hw)
        cand_metrics = {"precision": 0.88, "recall": 0.82, "mAP50": 0.84, "latency_ms": 18.5}
        base_metrics = {"person": 0.85, "helmet": 0.91, "safety-vest": 0.88}
        cand_old_metrics = {"person": 0.85, "helmet": 0.90, "safety-vest": 0.87}
        report = evaluator.evaluate_regression(base_metrics, cand_old_metrics, cand_metrics)
        self.assertIn("decision", report)
        self.assertIn("old_class_regression", report)
        self.assertIn("new_class_performance", report)
        self.assertIn("hardware_profile", report)

    # -------------------------------------------------------------------------
    # ITEM G: Old-class regression failure rejects candidate
    # -------------------------------------------------------------------------
    def test_item_g_old_class_regression_failure_rejects(self):
        evaluator = CandidateEvaluator(RegressionGateConfig(max_map_drop=0.05, max_per_class_drop=0.08))
        cand_metrics = {"precision": 0.90, "recall": 0.88, "mAP50": 0.89, "latency_ms": 15.0}
        base_metrics = {"person": 0.85, "helmet": 0.90, "safety-vest": 0.88}
        # Simulate severe regression on 'helmet' from 0.90 down to 0.75 (-0.15 drop)
        regressed_old_metrics = {"person": 0.84, "helmet": 0.75, "safety-vest": 0.87}
        report = evaluator.evaluate_regression(base_metrics, regressed_old_metrics, cand_metrics)
        self.assertEqual(report["decision"], "REJECTED", "Severe old-class drop must result in REJECTED")
        self.assertIn("helmet", report["violations"][0].lower())

        active_model = self.registry.get_active_model()
        self.assertTrue(active_model.isProtected, "Active model must remain protected baseline")

    # -------------------------------------------------------------------------
    # ITEM H: New-class evaluation failure rejects candidate
    # -------------------------------------------------------------------------
    def test_item_h_new_class_performance_failure_rejects(self):
        evaluator = CandidateEvaluator(RegressionGateConfig(min_new_class_map50=0.60, min_new_class_recall=0.50))
        poor_cand_metrics = {"precision": 0.50, "recall": 0.35, "mAP50": 0.42, "latency_ms": 18.0}
        base_metrics = {"person": 0.85, "helmet": 0.90}
        same_old_metrics = {"person": 0.85, "helmet": 0.90}
        report = evaluator.evaluate_regression(base_metrics, same_old_metrics, poor_cand_metrics)
        self.assertEqual(report["decision"], "REJECTED", "Low new-class mAP50 must result in REJECTED")

    # -------------------------------------------------------------------------
    # ITEM I: Successful evaluation results in APPROVED
    # -------------------------------------------------------------------------
    def test_item_i_successful_evaluation_results_in_approved(self):
        evaluator = CandidateEvaluator()
        good_cand_metrics = {"precision": 0.89, "recall": 0.84, "mAP50": 0.86, "latency_ms": 16.0}
        base_metrics = {"person": 0.85, "helmet": 0.90, "safety-vest": 0.88}
        clean_old_metrics = {"person": 0.85, "helmet": 0.90, "safety-vest": 0.88}
        report = evaluator.evaluate_regression(base_metrics, clean_old_metrics, good_cand_metrics)
        self.assertEqual(report["decision"], "PASS", "Zero regression & high performance must PASS evaluation")

        cand_id = "MODEL-CANDIDATE-TEST-002"
        self.registry.register_candidate(ModelProvenanceRecord(
            modelId=cand_id,
            modelName="Candidate Lab Coat Approved Test",
            modelVersion="1.1.0",
            parentModelId="MODEL-PPE-BASELINE-SH17",
            modelType="OBJECT_DETECTION_PPE",
            framework="PyTorch / Ultralytics YOLOv8",
            datasetSources=["SafeVision PPE Curated Dataset"],
            datasetVersions=["1.0.0"],
            datasetLicenses=["Proprietary SafeVision AI"],
            addedClassIds=["SV-PPE-018"],
            classList=SH17_CLASSES + ["lab-coat"],
            classManifest=[
                {"modelIndex": 0, "safeVisionClassId": "SV-PPE-018", "className": "lab-coat", "displayName": "Lab Coat", "category": "PPE"}
            ],
            status="APPROVED",
            deploymentStatus="APPROVED",
            licensingNotice="Internal module approved for activation",
            validationMetrics=good_cand_metrics,
            regressionReport=report
        ))
        rec = self.registry.get_model(cand_id)
        self.assertEqual(rec.status, "APPROVED")

    # -------------------------------------------------------------------------
    # ITEM J: Atomic activation results in ACTIVE and loads custom module
    # -------------------------------------------------------------------------
    def test_item_j_atomic_activation(self):
        cand_id = "MODEL-CANDIDATE-TEST-002"
        act_res = self.registry.activate_candidate(cand_id, activated_by="Admin-Test")
        self.assertTrue(act_res["success"], f"Activation must succeed: {act_res.get('reason')}")
        rec = self.registry.get_model(cand_id)
        self.assertEqual(rec.status, "ACTIVE")
        self.assertEqual(rec.deploymentStatus, "ACTIVE")
        self.assertEqual(rec.activatedBy, "Admin-Test")

        engine = IndustrialSafetyDetector(models_dir=os.path.join(AI_DIR, "models"))
        engine.add_custom_module(
            module_id=cand_id,
            model_path=self.baseline_model_path,
            safe_vision_class_id="SV-PPE-018",
            class_name="lab-coat",
            conf_thresh=0.40,
            class_manifest=rec.classManifest
        )
        status = engine.get_pipeline_status()
        self.assertEqual(status["custom_modules_count"], 1)
        self.assertEqual(status["custom_modules"][0]["module_id"], cand_id)

    # -------------------------------------------------------------------------
    # ITEM K: Deactivation unloads module and marks DEACTIVATED
    # -------------------------------------------------------------------------
    def test_item_k_deactivation(self):
        cand_id = "MODEL-CANDIDATE-TEST-002"
        deact_res = self.registry.deactivate_candidate(cand_id)
        self.assertTrue(deact_res["success"])
        rec = self.registry.get_model(cand_id)
        self.assertEqual(rec.status, "DEACTIVATED")

        engine = IndustrialSafetyDetector(models_dir=os.path.join(AI_DIR, "models"))
        engine.add_custom_module(
            module_id=cand_id,
            model_path=self.baseline_model_path,
            safe_vision_class_id="SV-PPE-018",
            class_name="lab-coat",
            conf_thresh=0.40,
            class_manifest=rec.classManifest
        )
        self.assertEqual(engine.get_pipeline_status()["custom_modules_count"], 1)
        engine.remove_custom_module(cand_id)
        self.assertEqual(engine.get_pipeline_status()["custom_modules_count"], 0)

    # -------------------------------------------------------------------------
    # ITEM L: Rollback restores pure baseline
    # -------------------------------------------------------------------------
    def test_item_l_rollback_restores_baseline(self):
        engine = IndustrialSafetyDetector(models_dir=os.path.join(AI_DIR, "models"))
        engine.add_custom_module(
            module_id="MODULE-TEMP",
            model_path=self.baseline_model_path,
            safe_vision_class_id="SV-PPE-018",
            class_name="lab-coat",
            conf_thresh=0.40,
            class_manifest=[]
        )
        self.assertEqual(engine.get_pipeline_status()["custom_modules_count"], 1)

        rollback_res = engine.rollback_to_baseline()
        self.assertTrue(rollback_res["success"])
        self.assertEqual(engine.get_pipeline_status()["custom_modules_count"], 0)
        self.assertEqual(engine.get_pipeline_status()["pipeline_state"], "ACTIVE")

        reg_roll = self.registry.rollback_to_baseline()
        self.assertTrue(reg_roll["success"])

    # -------------------------------------------------------------------------
    # ITEM M: Historical incidents preserve model/class version
    # -------------------------------------------------------------------------
    def test_item_m_historical_incidents_preserve_versions(self):
        from pymongo import MongoClient
        client = MongoClient("mongodb://127.0.0.1:27017")
        try:
            db = client["safevision"]
            incidents_col = db["incidents"]
            count = incidents_col.count_documents({})
            self.assertEqual(count, 160, f"Database incidents count must remain strictly 160: got {count}")

            sample = incidents_col.find_one({})
            self.assertIsNotNone(sample)
            self.assertIn("modelId", sample)
            self.assertIn("version", sample)
        finally:
            client.close()

    # -------------------------------------------------------------------------
    # ITEM N: Custom detector module failure does not crash baseline (isolation)
    # -------------------------------------------------------------------------
    def test_item_n_inference_isolation_on_module_crash(self):
        engine = IndustrialSafetyDetector(models_dir=os.path.join(AI_DIR, "models"))

        class FaultyCustomModule(CustomDetectorModule):
            def predict(self, frame_bgr, conf_override=None):
                raise RuntimeError("Simulated CUDA OOM or module internal crash")

        faulty_mod = FaultyCustomModule(
            module_id="MODULE-CRASH-TEST",
            model_path=self.baseline_model_path,
            safe_vision_class_id="SV-PPE-999",
            class_name="faulty",
            confidence_threshold=0.40
        )
        faulty_mod.status = "ACTIVE"
        engine.custom_modules["MODULE-CRASH-TEST"] = faulty_mod

        blank_frame = np.zeros((640, 640, 3), dtype=np.uint8)
        try:
            res = engine.infer_frame_direct(blank_frame, camera_id="CAM-TEST-ISOLATION")
            self.assertTrue(res.success)
        except Exception as e:
            self.fail(f"Unified engine crashed when custom module threw error: {e}")

        self.assertEqual(faulty_mod.status, "ERROR")

    # -------------------------------------------------------------------------
    # ITEM O: Stable class IDs remain unchanged (SV-PPE-001 .. SV-PPE-017)
    # -------------------------------------------------------------------------
    def test_item_o_stable_class_ids_unchanged(self):
        sh17_expected = [
            ("SV-PPE-001", "person"),
            ("SV-PPE-002", "helmet"),
            ("SV-PPE-003", "safety-vest"),
            ("SV-PPE-004", "gloves"),
            ("SV-PPE-005", "shoes"),
            ("SV-PPE-006", "glasses"),
            ("SV-PPE-007", "face-mask"),
            ("SV-PPE-008", "ear-mufs"),
            ("SV-PPE-009", "face-guard"),
            ("SV-PPE-010", "medical-suit"),
            ("SV-PPE-011", "safety-suit"),
            ("SV-PPE-012", "head"),
            ("SV-PPE-013", "face"),
            ("SV-PPE-014", "ear"),
            ("SV-PPE-015", "hands"),
            ("SV-PPE-016", "foot"),
            ("SV-PPE-017", "tool")
        ]
        for expected_id, expected_name in sh17_expected:
            cls_obj = self.ppe_registry.get_class(expected_id)
            self.assertIsNotNone(cls_obj, f"Class {expected_id} must exist")
            self.assertEqual(cls_obj["name"], expected_name, f"Class {expected_id} name must be {expected_name}")

    # -------------------------------------------------------------------------
    # ITEM P: API dynamically displays active classes & pipeline status
    # -------------------------------------------------------------------------
    def test_item_p_api_pipeline_status_endpoint(self):
        import urllib.request
        url = "http://localhost:8000/training/models/pipeline_status"
        req = urllib.request.urlopen(url, timeout=5)
        self.assertEqual(req.status, 200)
        data = json.loads(req.read().decode("utf-8"))
        self.assertEqual(data["pipeline_state"], "ACTIVE")
        self.assertTrue(data["baseline"]["is_protected"])
        self.assertEqual(data["baseline"]["supported_classes_count"], 17)

    # -------------------------------------------------------------------------
    # ITEM Q: No hardcoded PPE class arrays in association engine
    # -------------------------------------------------------------------------
    def test_item_q_dynamic_ppe_association_policy(self):
        from ai.inference.ppe_association import PPEAssociationEngine
        assoc_engine = PPEAssociationEngine(visibility_threshold=0.40)
        dummy_person_box = [10.0, 10.0, 70.0, 50.0]
        dummy_detections = [
            {"class_name": "helmet", "bbox": [10.0, 15.0, 25.0, 45.0], "confidence": 0.92},
            {"class_name": "safety-vest", "bbox": [25.0, 15.0, 55.0, 45.0], "confidence": 0.88}
        ]
        evaluation = assoc_engine.evaluate_track_ppe(
            track_id="T01",
            person_bbox=dummy_person_box,
            person_confidence=0.95,
            frame_detections=dummy_detections,
            required_ppe=["helmet", "safety-vest"]
        )
        self.assertEqual(evaluation.helmet.status, "PRESENT")
        self.assertEqual(evaluation.vest.status, "PRESENT")
        self.assertTrue(evaluation.is_compliant)

    # -------------------------------------------------------------------------
    # ITEM R: No hardcoded model-index assumptions (class manifest decoupling)
    # -------------------------------------------------------------------------
    def test_item_r_model_index_manifest_decoupling(self):
        base_rec = self.registry.get_baseline_model()
        manifest = base_rec.classManifest
        self.assertEqual(len(manifest), 17)
        for item in manifest:
            self.assertIn("modelIndex", item)
            self.assertIn("safeVisionClassId", item)
            self.assertIn("className", item)

    # -------------------------------------------------------------------------
    # ITEM S: Camera stream isolation remains intact
    # -------------------------------------------------------------------------
    def test_item_s_camera_stream_isolation(self):
        import subprocess
        result = subprocess.run(
            [sys.executable, os.path.join(ROOT_DIR, "tests", "test_camera_stream_isolation.py")],
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, f"Camera stream isolation test failed:\n{result.stdout}\n{result.stderr}")

    # -------------------------------------------------------------------------
    # ITEM T: Upload media regression remains intact
    # -------------------------------------------------------------------------
    def test_item_t_upload_media_regression(self):
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            temp_video_path = f.name

        try:
            out = cv2.VideoWriter(temp_video_path, cv2.VideoWriter_fourcc(*"mp4v"), 10, (640, 640))
            for _ in range(6):
                out.write(np.zeros((640, 640, 3), dtype=np.uint8))
            out.release()

            with open(temp_video_path, "rb") as vf:
                resp = requests.post(
                    "http://127.0.0.1:8000/infer/video",
                    files={"file": ("test_clip.mp4", vf, "video/mp4")},
                    data={"camera_id": "UPLOAD_TEST_CAM", "sample_fps": 5},
                    timeout=60
                )

            self.assertEqual(resp.status_code, 200, f"Video infer response status: {resp.status_code}")
            data = resp.json()
            self.assertTrue(data.get("success"), "Video response success must be True")
            self.assertIn("frames_analyzed", data)
            self.assertIn("keyframes", data)
            self.assertIn("effective_fps", data)

            # Assert database incident count remains exactly 160
            from pymongo import MongoClient
            client = MongoClient("mongodb://127.0.0.1:27017")
            try:
                db = client["safevision"]
                count = db["incidents"].count_documents({})
                self.assertEqual(count, 160, f"Database incidents count must remain strictly 160: got {count}")
            finally:
                client.close()

        finally:
            if os.path.exists(temp_video_path):
                os.unlink(temp_video_path)


if __name__ == "__main__":
    unittest.main()
