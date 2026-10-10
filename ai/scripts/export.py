"""
SafeVision AI - Edge Model Export
Exports trained YOLO checkpoints to ONNX, TensorRT, or CoreML formats for low-latency edge deployment.
"""

import os
import argparse

def export_model(model_path: str, export_format: str = "onnx", imgsz: int = 640):
    print("==================================================")
    print("       SafeVision AI - Edge Model Export Engine   ")
    print("==================================================")
    print(f"Model path:    {model_path}")
    print(f"Target format: {export_format}")
    print(f"Input size:    {imgsz}x{imgsz}")
    print("--------------------------------------------------")

    if not os.path.exists(model_path):
        print(f"[SafeVision AI ERROR] Model file not found: {model_path}")
        return

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[SafeVision AI ERROR] 'ultralytics' package not installed.")
        return

    model = YOLO(model_path)
    output_path = model.export(format=export_format, imgsz=imgsz)
    print(f"[SafeVision AI SUCCESS] Model successfully exported to: {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export SafeVision AI Model to Edge Formats")
    parser.add_argument("--model", type=str, default="models/industrial_yolov8.pt", help="Path to .pt weights")
    parser.add_argument("--format", type=str, default="onnx", choices=["onnx", "engine", "torchscript", "tflite"], help="Target format")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image dimension")
    args = parser.parse_args()

    export_model(args.model, args.format, args.imgsz)
