"""
SafeVision AI - Real PPE Model Validation Script
Validates industrial YOLOv8 weights on physical images against SH17 taxonomy.
"""

import os
import sys
import time
import hashlib
import argparse
import cv2
import numpy as np

# Ensure ai directory is on path
current_dir = os.path.dirname(os.path.abspath(__file__))
ai_root = os.path.dirname(current_dir)
if ai_root not in sys.path:
    sys.path.insert(0, ai_root)

from inference.provenance import ModelRegistry, SH17_CLASSES

SH17_CLASSES = [
    "person", "ear", "ear-mufs", "face", "face-guard",
    "face-mask", "foot", "tool", "glasses", "gloves",
    "helmet", "hands", "head", "medical-suit", "shoes",
    "safety-suit", "safety-vest"
]

def compute_sha256(filepath: str) -> str:
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    return f"sha256:{sha.hexdigest().lower()}"

def validate_image_model(
    image_path: str,
    weights_path: str = os.path.join(ai_root, "models", "industrial_yolov8.pt"),
    output_path: str = "annotated_real_image.jpg",
    conf_thresh: float = 0.25
):
    print("==================================================")
    print("      SAFEVISION AI — REAL MODEL VALIDATION       ")
    print("==================================================")
    print(f"Target Image:   {image_path}")
    print(f"Target Weights: {weights_path}")
    print("--------------------------------------------------")

    # 1. Verify weights file exists
    if not os.path.exists(weights_path):
        print(f"[FAIL] Physical weights file missing: {weights_path}")
        sys.exit(1)

    file_size_bytes = os.path.getsize(weights_path)
    print(f"[OK] Weights file found: {file_size_bytes:,} bytes")

    # 2. Checksum verification
    actual_checksum = compute_sha256(weights_path)
    reg = ModelRegistry()
    model_record = reg.get_model("MODEL-PPE-SH17-001")
    expected_checksum = model_record.weightsChecksum if model_record else None

    print(f"Registered Checksum: {expected_checksum}")
    print(f"Actual Checksum:     {actual_checksum}")

    if not expected_checksum or actual_checksum.lower() != expected_checksum.lower():
        print("[FAIL] CHECKSUM_MISMATCH: Model weights do not match registered SHA-256 hash.")
        sys.exit(1)
    print("[OK] Checksum verified: SHA-256 matches model registry.")

    # 3. Detect hardware
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda:0"
            gpu_name = torch.cuda.get_device_name(0)
            cuda_ver = torch.version.cuda
            print(f"[OK] Acceleration: NVIDIA GPU ({gpu_name}, CUDA {cuda_ver}) on device '{device}'")
        else:
            device = "cpu"
            print("[INFO] Acceleration: Running on CPU (CUDA not available)")
    except Exception as e:
        device = "cpu"
        print(f"[WARN] Hardware check fallback to CPU: {e}")

    # 4. Load weights & verify classes
    try:
        from ultralytics import YOLO
        model = YOLO(weights_path)
        print("[OK] Ultralytics YOLO model loaded successfully.")
    except Exception as e:
        print(f"[FAIL] LOAD_FAILED: Could not load model: {e}")
        sys.exit(1)

    model_classes = {}
    if hasattr(model, "names") and isinstance(model.names, dict):
        model_classes = {k: v.lower().replace('_', '-') for k, v in model.names.items()}

    print(f"[OK] Model declared {len(model_classes)} classes:")
    for k, v in model_classes.items():
        print(f"     [{k}] {v}")

    # Contract check: essential SH17 classes must be present
    required_classes = ["person", "helmet", "safety-vest", "head"]
    missing = [c for c in required_classes if c not in model_classes.values()]
    if missing:
        print(f"[FAIL] MODEL CLASS CONTRACT MISMATCH! Missing essential classes: {missing}")
        sys.exit(1)
    print("[OK] SH17 Class Contract verified.")

    # 5. Load real image
    if not os.path.exists(image_path):
        print(f"[FAIL] Image file not found: {image_path}")
        sys.exit(1)

    img = cv2.imread(image_path)
    if img is None:
        print(f"[FAIL] OpenCV could not decode image: {image_path}")
        sys.exit(1)

    h, w = img.shape[:2]
    # Check if image is completely black / synthetic placeholder
    if np.max(img) == 0:
        print("[FAIL] Image is completely black/empty. Real image required for validation.")
        sys.exit(1)

    print(f"[OK] Real image decoded: {w}x{h} ({img.shape[2]} channels)")

    # 6. Run real inference
    t0 = time.perf_counter()
    results = model.predict(img, conf=conf_thresh, verbose=False, device=device)
    inference_latency_ms = (time.perf_counter() - t0) * 1000.0

    print("--------------------------------------------------")
    print(f"Device Used:        {device}")
    print(f"Inference Latency:  {inference_latency_ms:.2f} ms")
    print("--------------------------------------------------")
    print("REAL DETECTIONS FOUND:")

    detections = []
    boxes = results[0].boxes
    annotated_img = img.copy()

    for idx, box in enumerate(boxes):
        xyxy = box.xyxy[0].cpu().numpy().astype(int)
        cls_id = int(box.cls[0].cpu().numpy())
        conf = float(box.conf[0].cpu().numpy())
        cls_name = model.names.get(cls_id, f"class_{cls_id}").lower().replace('_', '-')

        x1, y1, x2, y2 = xyxy
        detections.append({
            "class": cls_name,
            "confidence": round(conf, 4),
            "bbox": [int(y1), int(x1), int(y2), int(x2)]
        })

        print(f" [{idx + 1:2d}] {cls_name:<16} | Conf: {conf * 100:5.1f}% | BBox: [y1={y1}, x1={x1}, y2={y2}, x2={x2}]")

        # Draw box on annotated image
        color = (0, 255, 0) if "helmet" in cls_name or "vest" in cls_name else (255, 140, 0)
        cv2.rectangle(annotated_img, (x1, y1), (x2, y2), color, 2)
        label = f"{cls_name} {conf:.2f}"
        cv2.putText(annotated_img, label, (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)

    print(f"Total Detections:   {len(detections)}")

    # 7. Save annotated image
    cv2.imwrite(output_path, annotated_img)
    print(f"[OK] Annotated output saved to: {output_path}")
    print("==================================================")
    print(">> REAL MODEL VALIDATION COMPLETED SUCCESSFULLY <<")
    print("==================================================")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate SafeVision AI Model on Real Image")
    parser.add_argument("--image", type=str, required=True, help="Path to real image file")
    parser.add_argument("--weights", type=str, default=os.path.join(ai_root, "models", "industrial_yolov8.pt"), help="Model weights path")
    parser.add_argument("--output", type=str, default="annotated_real_image.jpg", help="Path to save annotated output")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()

    validate_image_model(args.image, args.weights, args.output, args.conf)
