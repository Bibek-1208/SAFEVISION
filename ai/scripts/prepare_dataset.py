"""
SafeVision AI - Dataset Preparation Script
Prepares, validates, and partitions industrial PPE datasets for YOLOv8 training.
"""

import os
import random
import shutil
import argparse
import yaml
from pathlib import Path

# Official SH17 17-Class Taxonomy
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

def create_dataset_structure(base_dir: str):
    """Creates directory structure for train, val, and test splits."""
    dirs = [
        os.path.join(base_dir, "images", "train"),
        os.path.join(base_dir, "images", "val"),
        os.path.join(base_dir, "images", "test"),
        os.path.join(base_dir, "labels", "train"),
        os.path.join(base_dir, "labels", "val"),
        os.path.join(base_dir, "labels", "test"),
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    print(f"[SafeVision AI] Created dataset directory hierarchy under: {base_dir}")

def validate_and_split(source_images_dir: str, source_labels_dir: str, output_dir: str, train_ratio=0.8, val_ratio=0.15):
    """Partitions raw images and YOLO labels into train/val/test splits."""
    create_dataset_structure(output_dir)

    if not os.path.exists(source_images_dir):
        print(f"[SafeVision AI] Source images directory not found: {source_images_dir}")
        print("[SafeVision AI] Initializing template empty splits ready for dataset ingestion.")
        return

    image_extensions = {".jpg", ".jpeg", ".png", ".bmp"}
    images = [f for f in os.listdir(source_images_dir) if Path(f).suffix.lower() in image_extensions]
    random.seed(42)
    random.shuffle(images)

    total = len(images)
    if total == 0:
        print("[SafeVision AI] No image files found in source folder.")
        return

    train_end = int(total * train_ratio)
    val_end = train_end + int(total * val_ratio)

    splits = {
        "train": images[:train_end],
        "val": images[train_end:val_end],
        "test": images[val_end:]
    }

    for split_name, file_list in splits.items():
        count = 0
        for img_name in file_list:
            base_stem = Path(img_name).stem
            label_name = f"{base_stem}.txt"

            src_img = os.path.join(source_images_dir, img_name)
            src_lbl = os.path.join(source_labels_dir, label_name)

            dst_img = os.path.join(output_dir, "images", split_name, img_name)
            dst_lbl = os.path.join(output_dir, "labels", split_name, label_name)

            shutil.copy2(src_img, dst_img)
            if os.path.exists(src_lbl):
                shutil.copy2(src_lbl, dst_lbl)
            count += 1
        print(f"[SafeVision AI] Split '{split_name}': Copied {count} images/labels.")

def generate_yaml_config(output_yaml_path: str, dataset_dir: str):
    """Generates YOLO data.yaml configuration file."""
    config = {
        "path": os.path.abspath(dataset_dir),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {i: name for i, name in enumerate(CLASSES)}
    }
    with open(output_yaml_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    print(f"[SafeVision AI] Generated dataset YAML configuration at: {output_yaml_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare SafeVision AI Industrial Dataset")
    parser.add_argument("--source-images", type=str, default="datasets/raw/images", help="Path to raw source images")
    parser.add_argument("--source-labels", type=str, default="datasets/raw/labels", help="Path to raw source YOLO labels")
    parser.add_argument("--output", type=str, default="datasets/industrial_ppe", help="Output dataset path")
    parser.add_argument("--yaml-config", type=str, default="configs/industrial_ppe.yaml", help="Output config path")
    args = parser.parse_args()

    validate_and_split(args.source_images, args.source_labels, args.output)
    generate_yaml_config(args.yaml_config, args.output)
