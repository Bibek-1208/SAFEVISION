#!/usr/bin/env python3
"""
=============================================================================
SafeVision AI — Frame Extraction & Selection Pipeline (Phase 12.2)
=============================================================================
Reproducible, configurable extraction of industrial video frames with:
- Configurable sampling rate (--fps or --every-n-frames)
- Forensic frame metadata (timestamp, frame index, resolution)
- Comprehensive brightness & contrast statistics for low-light analysis
- Near-duplicate detection to eliminate redundant adjacent frames
- Manifest generation preserving source video and sequence provenance
=============================================================================
"""

import os
import sys
import json
import argparse
import cv2
import numpy as np
from pathlib import Path
from typing import Dict, List, Any

# Map known raw videos to sequence IDs
SEQUENCE_MAP = {
    "348897.mp4": {"seq_id": "SEQ-01-HEAVY-INDUSTRIAL-4K", "scene": "heavy_machinery_floor"},
    "5434223-hd_1920_1080_24fps.mp4": {"seq_id": "SEQ-02-LOGISTICS-1080P", "scene": "logistics_warehouse"},
    "8965526-uhd_2160_3840_25fps.mp4": {"seq_id": "SEQ-03-PORTRAIT-UHD", "scene": "industrial_vertical_uhd"},
    "stock-footage-vertical-video-warehouse-employee-checks-construction-tools-near-heavy-metal-equipment-managing.webm": {
        "seq_id": "SEQ-04-DIM-TOOL-INSPECT", "scene": "dim_equipment_maintenance"
    }
}

def compute_frame_statistics(frame: np.ndarray) -> Dict[str, Any]:
    """Computes photometric and visual quality statistics for a frame."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_val = float(np.mean(gray))
    std_val = float(np.std(gray))
    min_val = int(np.min(gray))
    max_val = int(np.max(gray))
    
    # Low-light definition: average luminance < 80.0 on [0, 255] scale
    is_low_light = bool(mean_val < 80.0)
    # High-contrast / glare: max - min > 220 and mean > 150
    is_high_glare = bool(mean_val > 150.0 and (max_val - min_val) > 220)
    
    # Laplacian variance as sharpness/blur metric
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    is_blurry = bool(laplacian_var < 50.0)
    
    return {
        "mean_luminance": round(mean_val, 2),
        "std_luminance": round(std_val, 2),
        "min_luminance": min_val,
        "max_luminance": max_val,
        "is_low_light": is_low_light,
        "is_high_glare": is_high_glare,
        "sharpness_laplacian_var": round(laplacian_var, 2),
        "is_blurry": is_blurry
    }

def compute_histogram_difference(img1: np.ndarray, img2: np.ndarray) -> float:
    """Computes correlation between grayscale histograms of two images (1.0 = identical)."""
    h1 = cv2.calcHist([cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)], [0], None, [64], [0, 256])
    h2 = cv2.calcHist([cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)], [0], None, [64], [0, 256])
    cv2.normalize(h1, h1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(h2, h2, 0, 1, cv2.NORM_MINMAX)
    return float(cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL))

def extract_candidate_frames(
    video_dir: str,
    output_dir: str,
    target_fps: float = 1.0,
    every_n_frames: int = None,
    duplicate_threshold: float = 0.99
) -> Dict[str, Any]:
    """
    Extracts frames from video files according to sampling criteria,
    performs quality auditing, and writes the frame selection manifest.
    """
    os.makedirs(output_dir, exist_ok=True)
    manifest_dir = os.path.join(os.path.dirname(output_dir), "metadata")
    os.makedirs(manifest_dir, exist_ok=True)

    video_files = [
        f for f in os.listdir(video_dir)
        if Path(f).suffix.lower() in [".mp4", ".webm", ".avi", ".mkv"]
    ]
    video_files.sort()

    all_frames_manifest = []
    video_summaries = {}
    prev_frame = None
    total_candidates = 0
    total_near_duplicates = 0
    low_light_candidates = 0

    print(f"[SafeVision Extract] Processing {len(video_files)} video files from: {video_dir}")
    print(f"[SafeVision Extract] Target sampling: {target_fps} FPS (or every {every_n_frames} frames)")

    for vid_name in video_files:
        vid_path = os.path.join(video_dir, vid_name)
        cap = cv2.VideoCapture(vid_path)
        if not cap.isOpened():
            print(f"[SafeVision Extract ERROR] Could not open video: {vid_path}")
            continue

        native_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        native_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        native_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_s = total_frames / native_fps if native_fps > 0 else 0

        seq_info = SEQUENCE_MAP.get(vid_name, {
            "seq_id": f"SEQ-{Path(vid_name).stem.upper()[:16]}",
            "scene": "industrial_general"
        })
        seq_id = seq_info["seq_id"]

        # Determine frame stride
        if every_n_frames is not None and every_n_frames > 0:
            step = every_n_frames
        else:
            step = max(1, int(round(native_fps / target_fps)))

        vid_extracted_count = 0
        vid_near_dup_count = 0
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            if frame_idx % step == 0:
                total_candidates += 1
                stats = compute_frame_statistics(frame)
                timestamp_s = round(frame_idx / native_fps, 3)

                # Near-duplicate check with previous frame from the SAME video
                is_near_dup = False
                hist_corr = 0.0
                if prev_frame is not None and prev_frame.shape == frame.shape:
                    hist_corr = compute_histogram_difference(prev_frame, frame)
                    if hist_corr >= duplicate_threshold:
                        is_near_dup = True
                        total_near_duplicates += 1
                        vid_near_dup_count += 1

                prev_frame = frame.copy()

                if stats["is_low_light"]:
                    low_light_candidates += 1

                out_filename = f"{seq_id}_f{frame_idx:05d}_t{int(timestamp_s * 1000):06d}.jpg"
                out_filepath = os.path.join(output_dir, out_filename)
                
                # Write frame to disk
                cv2.imwrite(out_filepath, frame, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
                vid_extracted_count += 1

                frame_entry = {
                    "source_video": vid_name,
                    "source_sequence_id": seq_id,
                    "scene_type": seq_info["scene"],
                    "source_frame_number": frame_idx,
                    "timestamp_seconds": timestamp_s,
                    "output_image": out_filename,
                    "file_path": os.path.relpath(out_filepath, start=os.path.dirname(output_dir)),
                    "resolution": [native_w, native_h],
                    "aspect_ratio": round(native_w / native_h, 3),
                    "statistics": stats,
                    "near_duplicate_of_previous": is_near_dup,
                    "histogram_correlation": round(hist_corr, 4),
                    "annotation_status": "UNANNOTATED"
                }
                all_frames_manifest.append(frame_entry)

            frame_idx += 1

        cap.release()
        prev_frame = None  # Reset for next video to avoid cross-video comparison

        video_summaries[vid_name] = {
            "sequence_id": seq_id,
            "scene_type": seq_info["scene"],
            "resolution": f"{native_w}x{native_h}",
            "native_fps": round(native_fps, 2),
            "total_raw_frames": total_frames,
            "duration_seconds": round(duration_s, 2),
            "extracted_frames": vid_extracted_count,
            "near_duplicates_flagged": vid_near_dup_count,
            "sampling_step": step
        }
        print(f"  -> Extracted {vid_extracted_count} frames from {vid_name} (near-duplicates: {vid_near_dup_count})")

    # Generate overarching manifest
    manifest_data = {
        "manifest_version": "1.0",
        "description": "SafeVision AI Phase 12.2 Frame Extraction & Selection Manifest",
        "total_source_videos": len(video_files),
        "total_candidate_frames": total_candidates,
        "total_near_duplicates_flagged": total_near_duplicates,
        "total_unique_candidate_frames": total_candidates - total_near_duplicates,
        "low_light_candidate_frames": low_light_candidates,
        "sampling_parameters": {
            "target_fps": target_fps,
            "every_n_frames": every_n_frames,
            "duplicate_threshold": duplicate_threshold
        },
        "video_summaries": video_summaries,
        "frames": all_frames_manifest
    }

    manifest_path = os.path.join(manifest_dir, "frame_selection_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)
    print(f"[SafeVision Extract SUCCESS] Manifest written to: {manifest_path}")

    # Generate diversity report
    diversity_report = {
        "candidate_frames": total_candidates,
        "usable_frames_non_duplicate": total_candidates - total_near_duplicates,
        "usable_ratio": round((total_candidates - total_near_duplicates) / max(1, total_candidates), 4),
        "low_light_count": low_light_candidates,
        "low_light_ratio": round(low_light_candidates / max(1, total_candidates), 4),
        "resolutions_present": list({f"{v['resolution']}" for v in video_summaries.values()}),
        "sequences_present": [v["sequence_id"] for v in video_summaries.values()],
        "data_sufficiency_assessment": {
            "total_frames_extracted": total_candidates,
            "minimum_recommended_for_17_classes": 1000,
            "assessment": "INSUFFICIENT_FOR_RESPONSIBLE_FULL_17_CLASS_TRAINING_FROM_SCRATCH",
            "justification": (
                f"Sampling at {target_fps} FPS across 4 raw videos yields {total_candidates} frames. "
                "While highly representative of specific industrial environments (4K floor, vertical UHD, "
                "dim warehouse maintenance), training 17 multi-scale classes from scratch requires orders of "
                "magnitude more data. For candidate fine-tuning, targeted anchor classes (person, helmet, vest) "
                "with human-reviewed annotations and sequence-isolated test evaluation are required."
            )
        }
    }
    diversity_report_path = os.path.join(manifest_dir, "frame_diversity_report.json")
    with open(diversity_report_path, "w", encoding="utf-8") as f:
        json.dump(diversity_report, f, indent=2)
    print(f"[SafeVision Extract SUCCESS] Diversity report written to: {diversity_report_path}")

    return manifest_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract and select candidate frames for SafeVision AI")
    parser.add_argument("--video-dir", type=str, default="ai/datasets", help="Directory containing raw videos")
    parser.add_argument("--output-dir", type=str, default="ai/datasets/safevision_ppe_v1/extracted_frames", help="Target extracted frames directory")
    parser.add_argument("--fps", type=float, default=1.0, help="Target extraction FPS")
    parser.add_argument("--every-n-frames", type=int, default=None, help="Explicit frame interval override")
    parser.add_argument("--duplicate-threshold", type=float, default=0.99, help="Histogram correlation threshold for duplicate detection")
    args = parser.parse_args()

    extract_candidate_frames(
        video_dir=args.video_dir,
        output_dir=args.output_dir,
        target_fps=args.fps,
        every_n_frames=args.every_n_frames,
        duplicate_threshold=args.duplicate_threshold
    )
