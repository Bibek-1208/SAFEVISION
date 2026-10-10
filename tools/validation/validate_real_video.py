"""
SafeVision AI - Root Runner for Real Video Validation Script
Delegates to ai/scripts/validate_real_video.py
"""

import os
import sys

root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ai_dir = os.path.join(root_dir, "ai")
if ai_dir not in sys.path:
    sys.path.insert(0, ai_dir)

from scripts.validate_real_video import validate_video
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate SafeVision AI on Real Video")
    parser.add_argument("--source", type=str, required=True, help="Path to input video file")
    parser.add_argument("--weights", type=str, default=os.path.join(ai_dir, "models", "industrial_yolov8.pt"), help="Model weights path")
    parser.add_argument("--output_video", type=str, default="annotated_real_video.mp4", help="Path to save annotated video")
    parser.add_argument("--output_json", type=str, default=os.path.join(root_dir, "docs", "reports", "video_validation_analytics.json"), help="Path to save JSON analytics")
    parser.add_argument("--max_frames", type=int, default=150, help="Maximum number of frames to process")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()

    validate_video(
        source_video=args.source,
        weights_path=args.weights,
        output_video_path=args.output_video,
        output_json_path=args.output_json,
        max_frames=args.max_frames,
        conf_thresh=args.conf
    )
