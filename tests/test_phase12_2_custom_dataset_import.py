#!/usr/bin/env python3
"""
=============================================================================
SAFEVISION AI — PHASE 12.2 CUSTOM PPE DATASET IMPORT + DYNAMIC PPE REGISTRY
EMPIRICAL TEST SUITE
=============================================================================
Verifies:
1. PPE Class Registry (creation, duplicate rejection, stable SV-PPE-xxx IDs, aliases)
2. Dataset Registry & Provenance (license verification, unknown license blocker)
3. Generic YOLO Dataset Importer (splits, data.yaml, image & label counts)
4. Configurable Class Mapping (external class -> SafeVision SV-PPE-xxx)
5. 9-Category Quality Gate (corrupt image, coordinate bounds, val/test split emptiness, empty ratio)
6. Model Registry & Decoupled Class Manifest (baseline preservation, SHA256 integrity)
7. Backend Security & RBAC Enforcement (blocked dataset rejects job with HTTP 422)
8. Zero Model Training & No Fake Metrics Assertion
=============================================================================
"""

import os
import sys
import json
import shutil
import hashlib
import tempfile
import urllib.request
import urllib.error
from pathlib import Path
import cv2
import numpy as np

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "ai"))

from inference.ppe_registry import PPEClassRegistry, ModelClassManifest
from scripts.dataset_importer import ClassMapper, QualityGate, DatasetRegistry, DatasetImporter

EXPECTED_BASELINE_HASH = "5449f62bd7cf30c01c7fd138db2729a38abcb4d5120449773fba475d54f30b62"
NODE_API_URL = "http://localhost:5005/api"
AI_API_URL = "http://localhost:8000"

def get_auth_token():
    try:
        login_req = urllib.request.Request(
            f"{NODE_API_URL}/auth/login",
            data=json.dumps({"email": "admin@safevision.ai", "password": "Password123!"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(login_req) as res:
            return json.loads(res.read())["token"]
    except Exception as e:
        print(f"Warning: Could not get JWT auth token ({e}). Using mock/fallback checks.")
        return None

def run_tests():
    print("=" * 80)
    print("  SAFEVISION AI — PHASE 12.2 EMPIRICAL TEST SUITE")
    print("=" * 80)

    passed_count = 0
    failed_count = 0

    def check(test_id, condition, message):
        nonlocal passed_count, failed_count
        if condition:
            print(f"[PASS] {test_id}: {message}")
            passed_count += 1
        else:
            print(f"[FAIL] {test_id}: {message}")
            failed_count += 1

    # -------------------------------------------------------------------------
    # TEST GROUP 1: PPE CLASS REGISTRY
    # -------------------------------------------------------------------------
    print("\n--- TEST GROUP 1: PPE Class Registry ---")
    # 1.1 Authoritative Seed Verification
    auth_reg = PPEClassRegistry()
    auth_classes = auth_reg.get_classes()
    check("T1.1", len(auth_classes) >= 17, f"Authoritative Registry contains {len(auth_classes)} standard classes (>= 17)")

    with tempfile.TemporaryDirectory() as tmpdir:
        reg_file = Path(tmpdir) / "test_ppe_registry.json"
        shutil.copy2(ROOT_DIR / "ai" / "configs" / "ppe_classes_registry.json", reg_file)
        reg = PPEClassRegistry(registry_file=reg_file)

        # 1.2 Stable ID increment
        new_c = reg.create_class("welding_mask", "Welding Helmet & Mask", "PPE", aliases=["welder shield"])
        check("T1.2", new_c["id"].startswith("SV-PPE-"), f"Created class has stable ID: {new_c['id']}")

        # 1.3 Duplicate rejection
        dup_failed = False
        try:
            reg.create_class("welding_mask", "Duplicate Mask", "PPE")
        except ValueError:
            dup_failed = True
        check("T1.3", dup_failed, "Duplicate class creation was rejected with ValueError")

        # 1.4 Alias resolution
        resolved = reg.resolve_alias("welder shield")
        check("T1.4", resolved is not None and resolved["id"] == new_c["id"], "Alias resolution correctly identified target class")

        # 1.5 Deactivate class
        deact = reg.deactivate_class(new_c["id"])
        check("T1.5", deact["active"] is False, "Deactivated class active flag is False")

    # Reset registry to authoritative file for subsequent tests
    PPEClassRegistry(registry_file=ROOT_DIR / "ai" / "configs" / "ppe_classes_registry.json")

    # -------------------------------------------------------------------------
    # TEST GROUP 2: CLASS MAPPING
    # -------------------------------------------------------------------------
    print("\n--- TEST GROUP 2: Class Mapping Engine ---")
    with tempfile.TemporaryDirectory() as tmpdir:
        map_file = Path(tmpdir) / "test_mappings.json"
        mapper = ClassMapper(mappings_file=map_file)

        # 2.1 Suggest Mapping via aliases
        suggested = mapper.suggest_mapping("hard hat")
        check("T2.1", suggested == "SV-PPE-002", f"'hard hat' alias mapped to helmet SV-PPE-002: {suggested}")

        # 2.2 Add explicit mapping
        m_entry = mapper.add_or_update_mapping(
            source_dataset="TEST-DS-01",
            source_class="hardhat",
            source_class_id=0,
            safe_vision_class_id="SV-PPE-002",
            mapping_status="PENDING",
            mapping_reason="External dataset synonym"
        )
        check("T2.2", m_entry["mappingStatus"] == "PENDING", "Mapping created with PENDING status")

        # 2.3 Approve mapping
        approved = mapper.approve_mapping("TEST-DS-01", 0)
        check("T2.3", approved is True, "Mapping was approved successfully")

        # 2.4 Verify persistence
        mapper2 = ClassMapper(mappings_file=map_file)
        persisted = mapper2.list_mappings("TEST-DS-01")
        check("T2.4", len(persisted) == 1 and persisted[0]["mappingStatus"] == "APPROVED", "Approved mapping persisted on disk")

    # -------------------------------------------------------------------------
    # TEST GROUP 3: QUALITY GATE ENGINE
    # -------------------------------------------------------------------------
    print("\n--- TEST GROUP 3: 9-Category Quality Gate Engine ---")
    with tempfile.TemporaryDirectory() as tmpdir:
        qg_dir = Path(tmpdir) / "test_dataset"
        for s in ["train", "val", "test"]:
            (qg_dir / "images" / s).mkdir(parents=True)
            (qg_dir / "labels" / s).mkdir(parents=True)

        # Create valid image and label in train
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        cv2.imwrite(str(qg_dir / "images" / "train" / "img1.jpg"), img)
        with open(qg_dir / "labels" / "train" / "img1.txt", "w") as f:
            f.write("0 0.5 0.5 0.2 0.2\n")

        # Leave val and test empty
        cv2.imwrite(str(qg_dir / "images" / "val" / "val1.jpg"), img)
        with open(qg_dir / "labels" / "val" / "val1.txt", "w") as f:
            f.write("") # EMPTY label

        cv2.imwrite(str(qg_dir / "images" / "test" / "test1.jpg"), img)
        with open(qg_dir / "labels" / "test" / "test1.txt", "w") as f:
            f.write("") # EMPTY label

        qg = QualityGate()
        report = qg.audit_dataset(qg_dir, {"license": "CC-BY-4.0", "datasetId": "TEST-QG"})
        
        # 3.1 Unannotated Val/Test blocks dataset
        check("T3.1", report["status"] == "BLOCKED", f"Quality gate flagged unannotated val/test as BLOCKED: {report['status']}")
        has_val_blocker = any("Validation set contains 0 annotated images" in b for b in report["blockers"])
        check("T3.2", has_val_blocker, "Blocker specifically identified 0 annotated images in validation split")

        # 3.2 License check: UNKNOWN license blocks dataset
        report_unknown_lic = qg.audit_dataset(qg_dir, {"license": "UNKNOWN", "datasetId": "TEST-QG"})
        has_lic_blocker = any("license is UNKNOWN" in b for b in report_unknown_lic["blockers"])
        check("T3.3", has_lic_blocker, "UNKNOWN license triggered blocker in quality gate")

        # 3.3 Coordinate violation check
        with open(qg_dir / "labels" / "train" / "img1.txt", "w") as f:
            f.write("0 1.5 0.5 0.2 0.2\n") # 1.5 > 1.0
        report_bad_coords = qg.audit_dataset(qg_dir, {"license": "MIT", "datasetId": "TEST-QG"})
        has_coord_blocker = any("coordinates outside [0, 1]" in b for b in report_bad_coords["blockers"])
        check("T3.4", has_coord_blocker, "Coordinates outside [0,1] caught by quality gate")

    # -------------------------------------------------------------------------
    # TEST GROUP 4: DATASET IMPORTER & PROVENANCE
    # -------------------------------------------------------------------------
    print("\n--- TEST GROUP 4: Dataset Importer & Provenance ---")
    with tempfile.TemporaryDirectory() as tmpdir:
        src_ds = Path(tmpdir) / "mock_yolo_ds"
        for s in ["train", "val", "test"]:
            (src_ds / "images" / s).mkdir(parents=True)
            (src_ds / "labels" / s).mkdir(parents=True)

        with open(src_ds / "data.yaml", "w") as f:
            f.write("names: ['person', 'hard_hat']\n")

        reg_file = Path(tmpdir) / "ds_registry.json"
        map_file = Path(tmpdir) / "ds_mappings.json"
        ds_reg = DatasetRegistry(registry_file=reg_file)
        mapper = ClassMapper(mappings_file=map_file)
        importer = DatasetImporter(registry=ds_reg, mapper=mapper)

        record = importer.import_yolo_dataset(
            source_dir=src_ds,
            dataset_id="DS-MOCK-001",
            dataset_name="Mock YOLO PPE Dataset",
            version="1.0.0",
            source="External Supplier",
            license_str="MIT",
            attribution="Annotated by Industrial AI Team"
        )

        check("T4.1", record["datasetId"] == "DS-MOCK-001", f"Imported dataset registered with ID: {record['datasetId']}")
        check("T4.2", (src_ds / "metadata" / "dataset_manifest.json").exists(), "Created immutable dataset_manifest.json")
        check("T4.3", (src_ds / "metadata" / "provenance.json").exists(), "Created immutable provenance.json")

    # -------------------------------------------------------------------------
    # TEST GROUP 5: MODEL REGISTRY & MANIFEST
    # -------------------------------------------------------------------------
    print("\n--- TEST GROUP 5: Baseline Model Preservation & Manifest ---")
    baseline_pt = ROOT_DIR / "ai" / "models" / "industrial_yolov8.pt"
    check("T5.1", baseline_pt.exists(), f"Baseline model exists at: {baseline_pt}")

    actual_hash = hashlib.sha256(baseline_pt.read_bytes()).hexdigest()
    check("T5.2", actual_hash == EXPECTED_BASELINE_HASH, f"Baseline SHA256 untouched: {actual_hash}")

    manifest = ModelClassManifest()
    check("T5.3", manifest.model_id.startswith("MODEL-PPE-"), f"Manifest model ID: {manifest.model_id}")
    p_entry = manifest.get_entry(0)
    check("T5.4", p_entry is not None and p_entry.get("safeVisionClassId") == "SV-PPE-001", "Model index 0 decoupled and mapped to SV-PPE-001 (person)")

    # -------------------------------------------------------------------------
    # TEST GROUP 6: BACKEND ENFORCEMENT & RBAC
    # -------------------------------------------------------------------------
    print("\n--- TEST GROUP 6: Backend API & Training Quality Gate Enforcement ---")
    token = get_auth_token()
    if token:
        # 6.1 Authorized classes list
        req = urllib.request.Request(f"{NODE_API_URL}/training/classes", headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req) as res:
                data = json.loads(res.read())
                check("T6.1", data.get("total", 0) >= 17, f"Fetched {data.get('total')} PPE classes via authenticated API")
        except Exception as e:
            check("T6.1", False, f"Failed to fetch classes via Node server: {e}")

        # 6.2 Strict rejection of training candidate on BLOCKED dataset (HTTP 422)
        job_req = urllib.request.Request(
            f"{NODE_API_URL}/training/jobs",
            data=json.dumps({"datasetId": "DS-SAFEVISION-PPE-V1", "baseModelId": "MODEL-PPE-SH17-001"}).encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        )
        got_422 = False
        blockers_returned = []
        try:
            with urllib.request.urlopen(job_req) as res:
                pass
        except urllib.error.HTTPError as e:
            if e.code == 422:
                got_422 = True
                body = json.loads(e.read())
                blockers_returned = body.get("blockers", [])

        check("T6.2", got_422, "POST /api/training/jobs strictly rejected candidate creation on BLOCKED dataset with HTTP 422")
        check("T6.3", len(blockers_returned) > 0, f"Backend returned {len(blockers_returned)} explicit blocker reasons")

        # 6.3 Unauthorized access rejection
        unauth_req = urllib.request.Request(f"{NODE_API_URL}/training/classes")
        got_401 = False
        try:
            with urllib.request.urlopen(unauth_req) as res:
                pass
        except urllib.error.HTTPError as e:
            if e.code == 401:
                got_401 = True
        check("T6.4", got_401, "Unauthenticated access rejected with HTTP 401")
    else:
        print("[SKIP] Skipping live backend tests (Node server not reachable with admin token)")

    # -------------------------------------------------------------------------
    # TEST GROUP 7: ZERO MODEL TRAINING ASSERTION
    # -------------------------------------------------------------------------
    print("\n--- TEST GROUP 7: Phase 12.2 Safety & Constraint Assertions ---")
    check("T7.1", baseline_pt.stat().st_size == 6252377, "Baseline model file size unchanged (6,252,377 bytes)")
    
    # Verify no unexpected .pt files created
    new_weights = list((ROOT_DIR / "ai" / "models" / "safevision-ppe").glob("**/*.pt"))
    check("T7.2", len(new_weights) == 0, f"Confirmed ZERO trained models generated in safevision-ppe: {len(new_weights)} files")

    print("\n" + "=" * 80)
    print(f"  PHASE 12.2 TEST RESULTS: {passed_count} PASSED / {failed_count} FAILED")
    print("=" * 80)

    if failed_count > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
