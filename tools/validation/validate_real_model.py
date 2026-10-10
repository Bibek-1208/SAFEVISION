"""
SafeVision AI - Root Runner for Real Model Validation Script
Delegates to ai/scripts/validate_real_model.py
"""

import os
import sys

# Add ai directory to sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ai_dir = os.path.join(root_dir, "ai")
if ai_dir not in sys.path:
    sys.path.insert(0, ai_dir)

from scripts.validate_real_model import validate_image_model, ai_root
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate SafeVision AI Model on Real Image")
    parser.add_argument("--image", type=str, required=True, help="Path to real image file")
    parser.add_argument("--weights", type=str, default=os.path.join(ai_dir, "models", "industrial_yolov8.pt"), help="Model weights path")
    parser.add_argument("--output", type=str, default="annotated_real_image.jpg", help="Path to save annotated output")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()

    validate_image_model(args.image, args.weights, args.output, args.conf)
