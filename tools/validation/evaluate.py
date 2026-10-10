"""
SafeVision AI - Root Runner for Real Model Evaluation Script
Delegates to ai/scripts/evaluate.py
"""

import os
import sys

root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ai_dir = os.path.join(root_dir, "ai")
if ai_dir not in sys.path:
    sys.path.insert(0, ai_dir)

from scripts.evaluate import evaluate_model
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate SafeVision AI Model")
    parser.add_argument("--model", type=str, default=os.path.join(ai_dir, "models", "industrial_yolov8.pt"), help="Model weights path")
    parser.add_argument("--data", type=str, default=os.path.join(ai_dir, "configs", "sh17_ppe.yaml"), help="Dataset configuration path")
    parser.add_argument("--output", type=str, default=os.path.join(root_dir, "docs", "reports", "evaluation_report.json"), help="Output report path")
    args = parser.parse_args()

    evaluate_model(args.model, args.data, args.output)
