"""
SafeVision AI - Model Training Script
Fine-tunes YOLOv8 on industrial safety dataset (PPE + Fire/Smoke + Worker Fall).
"""

import os
import argparse
import shutil

def train(data_yaml: str, epochs: int, batch_size: int, imgsz: int, model_type: str, output_dir: str):
    print("==================================================")
    print("       SafeVision AI - Neural Model Training      ")
    print("==================================================")
    print(f"Data configuration: {data_yaml}")
    print(f"Base architecture:  {model_type}")
    print(f"Target Epochs:      {epochs}")
    print(f"Batch Size:         {batch_size}")
    print(f"Resolution:         {imgsz}x{imgsz}")
    print("--------------------------------------------------")

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[SafeVision AI ERROR] 'ultralytics' package is not installed.")
        print("To train full neural weights, run: pip install ultralytics")
        print("Until then, SafeVision AI operates with the embedded Baseline CV Engine.")
        return False

    if not os.path.exists(data_yaml):
        print(f"[SafeVision AI ERROR] Dataset config not found: {data_yaml}")
        return False

    print(f"[SafeVision AI] Initializing {model_type}...")
    model = YOLO(model_type)

    print("[SafeVision AI] Starting model training...")
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        name="industrial_ppe_run",
        project="runs/detect",
        save=True,
        plots=True
    )

    # SafeVision Phase 12.2: NEVER overwrite baseline model ai/models/industrial_yolov8.pt
    candidates_dir = os.path.join(output_dir, "candidates")
    os.makedirs(candidates_dir, exist_ok=True)
    best_pt = os.path.join("runs", "detect", "industrial_ppe_run", "weights", "best.pt")
    candidate_pt = os.path.join(candidates_dir, "safevision_ppe_v1_candidate.pt")
    
    if os.path.exists(best_pt):
        shutil.copy2(best_pt, candidate_pt)
        print(f"[SafeVision AI SUCCESS] Custom Candidate weights exported to: {candidate_pt}")
        print("[SafeVision AI NOTICE] Baseline model 'industrial_yolov8.pt' strictly PRESERVED unchanged.")
    else:
        print(f"[SafeVision AI WARNING] Expected checkpoint {best_pt} not found.")

    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train SafeVision AI YOLO Candidate Model")
    parser.add_argument("--data", type=str, default="ai/datasets/safevision_ppe_v1/safevision_ppe.yaml", help="Path to data YAML")
    parser.add_argument("--epochs", type=int, default=50, help="Number of epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Pretrained model base")
    parser.add_argument("--output", type=str, default="ai/models", help="Target models directory")
    args = parser.parse_args()

    train(args.data, args.epochs, args.batch, args.imgsz, args.model, args.output)

