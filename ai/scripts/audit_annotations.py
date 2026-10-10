#!/usr/bin/env python3
"""
=============================================================================
SafeVision AI — Annotation Audit & Quality Control Pipeline (Phase 12.2)
=============================================================================
Audits dataset labels and images against industrial QC criteria:
1. Missing images / missing label files
2. Malformed label lines (non-numeric, wrong column count)
3. Invalid class IDs (outside [0, num_classes - 1])
4. Coordinates outside [0.0, 1.0]
5. Zero or negative width / height boxes
6. Duplicate bounding box entries in the same file
7. Image corruption check (cv2.imread verification)
8. Exact class instance distribution & frequency computation
=============================================================================
"""

import os
import sys
import json
import argparse
import cv2
from pathlib import Path
from typing import Dict, List, Any, Tuple

CLASSES = [
    "person",
    "ear",
    "ear-mufs",
    "face",
    "face-guard",
    "face-mask",
    "foot",
    "tool",
    "glasses",
    "gloves",
    "helmet",
    "hands",
    "head",
    "medical-suit",
    "shoes",
    "safety-suit",
    "safety-vest"
]

def audit_dataset(dataset_dir: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Rigorously audits images and annotations across all splits.
    Returns (audit_results, class_distribution).
    """
    splits = ["train", "val", "test"]
    metadata_dir = os.path.join(dataset_dir, "metadata")
    os.makedirs(metadata_dir, exist_ok=True)

    errors = []
    warnings = []

    total_images_checked = 0
    total_labels_checked = 0
    total_instances = 0
    corrupt_images = 0

    class_counts = {c: 0 for c in CLASSES}
    images_per_class = {c: 0 for c in CLASSES}
    split_stats = {s: {"images": 0, "labels": 0, "instances": 0, "empty_labels": 0} for s in splits}

    for split in splits:
        img_dir = os.path.join(dataset_dir, "images", split)
        lbl_dir = os.path.join(dataset_dir, "labels", split)

        if not os.path.exists(img_dir):
            errors.append(f"Directory missing: {img_dir}")
            continue

        img_files = [f for f in os.listdir(img_dir) if Path(f).suffix.lower() in [".jpg", ".jpeg", ".png"]]
        split_stats[split]["images"] = len(img_files)

        for img_name in sorted(img_files):
            total_images_checked += 1
            img_path = os.path.join(img_dir, img_name)

            # 1. Corruption check
            mat = cv2.imread(img_path)
            if mat is None or mat.size == 0:
                corrupt_images += 1
                errors.append(f"Corrupt image file: {img_path}")
                continue

            # 2. Matching label check
            base_stem = Path(img_name).stem
            lbl_name = f"{base_stem}.txt"
            lbl_path = os.path.join(lbl_dir, lbl_name)

            if not os.path.exists(lbl_path):
                warnings.append(f"Missing label file for: {img_name}")
                continue

            total_labels_checked += 1
            split_stats[split]["labels"] += 1

            # 3. Read and parse label lines
            with open(lbl_path, "r", encoding="utf-8") as lf:
                lines = [l.strip() for l in lf.readlines() if l.strip()]

            if len(lines) == 0:
                split_stats[split]["empty_labels"] += 1
                continue

            seen_boxes_in_image = set()
            classes_in_image = set()

            for line_idx, line in enumerate(lines):
                tokens = line.split()
                if len(tokens) != 5:
                    errors.append(f"Malformed label in {lbl_name} line {line_idx + 1}: expected 5 tokens, got {len(tokens)}")
                    continue

                try:
                    cls_id = int(tokens[0])
                    xc = float(tokens[1])
                    yc = float(tokens[2])
                    w = float(tokens[3])
                    h = float(tokens[4])
                except ValueError as e:
                    errors.append(f"Non-numeric label coordinate in {lbl_name} line {line_idx + 1}: {line}")
                    continue

                # Class ID check
                if cls_id < 0 or cls_id >= len(CLASSES):
                    errors.append(f"Invalid class ID {cls_id} in {lbl_name} line {line_idx + 1} (must be 0-{len(CLASSES)-1})")
                    continue

                # Box geometry checks
                if xc < 0.0 or xc > 1.0 or yc < 0.0 or yc > 1.0:
                    errors.append(f"Center out of range [0, 1] in {lbl_name} line {line_idx + 1}: xc={xc}, yc={yc}")
                if w <= 0.0 or h <= 0.0:
                    errors.append(f"Zero or negative box dimension in {lbl_name} line {line_idx + 1}: w={w}, h={h}")
                if (xc - w/2) < -0.05 or (xc + w/2) > 1.05 or (yc - h/2) < -0.05 or (yc + h/2) > 1.05:
                    warnings.append(f"Box extends significantly past image boundary in {lbl_name} line {line_idx + 1}")

                # Duplicate box check
                box_sig = (cls_id, round(xc, 4), round(yc, 4), round(w, 4), round(h, 4))
                if box_sig in seen_boxes_in_image:
                    errors.append(f"Duplicate bounding box in {lbl_name}: {box_sig}")
                seen_boxes_in_image.add(box_sig)

                # Track statistics
                cls_name = CLASSES[cls_id]
                class_counts[cls_name] += 1
                classes_in_image.add(cls_name)
                total_instances += 1
                split_stats[split]["instances"] += 1

            for c in classes_in_image:
                images_per_class[c] += 1

    # Class distribution analysis
    class_distribution = {
        "total_instances": total_instances,
        "classes": {}
    }
    for c in CLASSES:
        cnt = class_counts[c]
        pct = round((cnt / max(1, total_instances)) * 100, 2)
        img_cnt = images_per_class[c]
        class_distribution["classes"][c] = {
            "instances": cnt,
            "images": img_cnt,
            "percentage_of_instances": pct,
            "is_underrepresented": bool(cnt < 5)
        }

    # Identify imbalanced / missing classes
    missing_classes = [c for c, data in class_distribution["classes"].items() if data["instances"] == 0]
    underrepresented_classes = [c for c, data in class_distribution["classes"].items() if 0 < data["instances"] < 5]

    audit_report = {
        "audit_version": "1.0",
        "dataset_name": "SafeVision PPE Dataset v1.0",
        "total_images_checked": total_images_checked,
        "total_labels_checked": total_labels_checked,
        "corrupt_images": corrupt_images,
        "total_instances": total_instances,
        "split_statistics": split_stats,
        "errors_count": len(errors),
        "warnings_count": len(warnings),
        "errors": errors[:50],  # cap at 50 to prevent overflow
        "warnings": warnings[:50],
        "audit_passed": len(errors) == 0 and corrupt_images == 0,
        "missing_classes_count": len(missing_classes),
        "missing_classes": missing_classes,
        "underrepresented_classes": underrepresented_classes,
        "annotation_completeness": {
            "annotated_images": total_images_checked - sum(s["empty_labels"] for s in split_stats.values()),
            "empty_unannotated_images": sum(s["empty_labels"] for s in split_stats.values())
        }
    }

    # Save outputs
    audit_path = os.path.join(metadata_dir, "annotation_audit.json")
    with open(audit_path, "w", encoding="utf-8") as f:
        json.dump(audit_report, f, indent=2)

    dist_path = os.path.join(metadata_dir, "class_distribution.json")
    with open(dist_path, "w", encoding="utf-8") as f:
        json.dump(class_distribution, f, indent=2)

    print("================================================================================")
    print("  SAFEVISION AI — ANNOTATION QUALITY CONTROL AUDIT REPORT")
    print("================================================================================")
    print(f"Total Images Audited:    {total_images_checked}")
    print(f"Corrupt Images:          {corrupt_images}")
    print(f"Total Bounding Boxes:    {total_instances}")
    print(f"Errors Found:            {len(errors)}")
    print(f"Warnings Found:          {len(warnings)}")
    print(f"Empty/Unannotated Images:{audit_report['annotation_completeness']['empty_unannotated_images']}")
    print(f"Audit Status:            {'PASS' if audit_report['audit_passed'] else 'FAIL'}")
    print("--------------------------------------------------------------------------------")
    print(f"Audit report saved to:   {audit_path}")
    print(f"Distribution saved to:   {dist_path}")
    print("================================================================================")

    return audit_report, class_distribution

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit SafeVision AI annotations")
    parser.add_argument("--dataset-dir", type=str, default="ai/datasets/safevision_ppe_v1", help="Dataset directory")
    args = parser.parse_args()

    audit_dataset(args.dataset_dir)
