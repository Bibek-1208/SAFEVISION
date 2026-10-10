"""
SafeVision AI - Real Model Evaluation Suite
Strict Rule: NO HARDCODED METRICS.
Calculates mAP50, mAP50-95, precision, recall, and per-class metrics
ONLY when genuine validation dataset and ground-truth annotations are present.
If unavailable: returns status = "NOT_VALIDATED".
"""

import os
import sys
import time
import json
import hashlib
import argparse
import yaml

current_dir = os.path.dirname(os.path.abspath(__file__))
ai_root = os.path.dirname(current_dir)
if ai_root not in sys.path:
    sys.path.insert(0, ai_root)

def compute_sha256(filepath: str) -> str:
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    return f"sha256:{sha.hexdigest().lower()}"

def evaluate_model(
    model_path: str = os.path.join(ai_root, "models", "industrial_yolov8.pt"),
    data_yaml: str = os.path.join(ai_root, "configs", "sh17_ppe.yaml"),
    output_report: str = "evaluation_report.json"
):
    print("==================================================")
    print("      SAFEVISION AI — REAL MODEL EVALUATION       ")
    print("==================================================")
    print(f"Target Model:  {model_path}")
    print(f"Dataset YAML:  {data_yaml}")
    print("--------------------------------------------------")

    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # 1. Model existence & physical checksum
    if not os.path.exists(model_path):
        print(f"[FAIL] Model weights missing at {model_path}")
        report = {
            "timestamp": timestamp,
            "status": "NOT_VALIDATED",
            "model_path": model_path,
            "model_checksum": None,
            "dataset_path": data_yaml,
            "reason": "Model weights file physically missing",
            "metrics": None
        }
        with open(output_report, "w") as f:
            json.dump(report, f, indent=2)
        return report

    model_checksum = compute_sha256(model_path)
    print(f"[OK] Model weights present. SHA-256: {model_checksum}")

    # 2. Check dataset YAML and validation images/labels existence
    val_dataset_exists = False
    val_images_path = None

    if os.path.exists(data_yaml):
        try:
            with open(data_yaml, "r") as f:
                data_config = yaml.safe_load(f)
            val_path_rel = data_config.get("val")
            if val_path_rel:
                # If relative, resolve against yaml directory or ai_root
                base_dir = data_config.get("path", os.path.dirname(data_yaml))
                candidate_path = os.path.join(base_dir, val_path_rel)
                if os.path.exists(candidate_path) and os.path.isdir(candidate_path):
                    # Check if there are actual images
                    img_files = [f for f in os.listdir(candidate_path) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
                    if len(img_files) > 0:
                        val_dataset_exists = True
                        val_images_path = candidate_path
                        print(f"[OK] Validation dataset found at: {val_images_path} ({len(img_files)} images)")
        except Exception as e:
            print(f"[WARN] Error reading dataset config: {e}")

    if not val_dataset_exists:
        print("[SafeVision AI] Real validation dataset not physically present.")
        print("STRICT RULE: Returning status = NOT_VALIDATED. Zero hardcoded metrics fabricated.")
        report = {
            "timestamp": timestamp,
            "status": "NOT_VALIDATED",
            "model_path": model_path,
            "model_checksum": model_checksum,
            "dataset_path": data_yaml,
            "reason": "Validation dataset and ground-truth labels are not physically available on host.",
            "metrics": None,
            "guidance": "To run full evaluation, place official SH17 val split in datasets directory and configure configs/sh17_ppe.yaml."
        }
        with open(output_report, "w") as f:
            json.dump(report, f, indent=2)
        print(f"[SafeVision AI] Report saved to {output_report}")
        return report

    # 3. Validation dataset IS present - run real evaluation with YOLO
    try:
        from ultralytics import YOLO
        import torch

        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        print(f"[SafeVision AI] Executing validation on device: {device}...")
        model = YOLO(model_path)
        metrics = model.val(data=data_yaml, device=device, verbose=False)

        # Extract genuine calculated metrics directly from YOLO validation results
        mAP50 = float(metrics.box.map50)
        mAP50_95 = float(metrics.box.map)
        precision = float(metrics.box.mp)
        recall = float(metrics.box.mr)

        per_class = {}
        if hasattr(metrics.box, "maps") and metrics.box.maps is not None:
            names = model.names
            for idx, c_map in enumerate(metrics.box.maps):
                c_name = names.get(idx, f"class_{idx}")
                per_class[c_name] = float(c_map)

        report = {
            "timestamp": timestamp,
            "status": "EVALUATED",
            "model_path": model_path,
            "model_checksum": model_checksum,
            "dataset_path": data_yaml,
            "device": device,
            "metrics": {
                "mAP50": round(mAP50, 4),
                "mAP50-95": round(mAP50_95, 4),
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "per_class_mAP50": per_class
            }
        }
        print("--------------------------------------------------")
        print("REAL EVALUATION RESULTS:")
        print(f" mAP@0.50:    {mAP50:.4f}")
        print(f" mAP@0.50:95: {mAP50_95:.4f}")
        print(f" Precision:   {precision:.4f}")
        print(f" Recall:      {recall:.4f}")
        print("--------------------------------------------------")
    except Exception as e:
        print(f"[FAIL] Evaluation error: {e}")
        report = {
            "timestamp": timestamp,
            "status": "EVALUATION_FAILED",
            "model_path": model_path,
            "model_checksum": model_checksum,
            "dataset_path": data_yaml,
            "error": str(e),
            "metrics": None
        }

    with open(output_report, "w") as f:
        json.dump(report, f, indent=2)
    print(f"[SafeVision AI] Evaluation report saved to {output_report}")
    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate SafeVision AI Model on Real Dataset")
    parser.add_argument("--model", type=str, default=os.path.join(ai_root, "models", "industrial_yolov8.pt"), help="Model weights path")
    parser.add_argument("--data", type=str, default=os.path.join(ai_root, "configs", "sh17_ppe.yaml"), help="Dataset configuration path")
    parser.add_argument("--output", type=str, default="evaluation_report.json", help="Output report path")
    args = parser.parse_args()

    evaluate_model(args.model, args.data, args.output)
