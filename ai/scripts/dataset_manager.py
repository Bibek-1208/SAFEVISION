#!/usr/bin/env python3
"""
=============================================================================
SafeVision AI — Multi-Media Dataset Manager & Dynamic Class Registry
Phase 12.2B Architecture
=============================================================================
Authoritative management of:
1. Dynamic Class Registry (classes.json) with stable, immutable class IDs
2. Multi-Media Library (Images, Videos, Extracted Frames)
3. Traceable Video Ingestion & Configurable Frame Sampling with Quality Filters
4. Mutual Exclusivity Dataset Splits (Train / Validation / Test)
5. 12-Point Dataset Quality Control Audit Engine
=============================================================================
"""

import os
import sys
import json
import uuid
import shutil
import hashlib
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

import cv2
import numpy as np

DEFAULT_DATASET_DIR = "ai/datasets/safevision_ppe_v1"

# Base SH17 / SafeVision Official Seed Classes (IDs 0..16)
SEED_SH17_CLASSES = [
    {"id": 0, "name": "person", "displayName": "Person", "category": "PERSON", "active": True, "description": "Worker / human individual on site"},
    {"id": 1, "name": "ear", "displayName": "Ear", "category": "ANATOMICAL", "active": True, "description": "Human ear"},
    {"id": 2, "name": "ear-mufs", "displayName": "Ear Muffs", "category": "PPE", "active": True, "description": "Noise-reducing ear muffs"},
    {"id": 3, "name": "face", "displayName": "Face", "category": "ANATOMICAL", "active": True, "description": "Human face"},
    {"id": 4, "name": "face-guard", "displayName": "Face Guard", "category": "PPE", "active": True, "description": "Full face protective shield"},
    {"id": 5, "name": "face-mask", "displayName": "Face Mask", "category": "PPE", "active": True, "description": "Protective face/dust mask"},
    {"id": 6, "name": "foot", "displayName": "Foot", "category": "ANATOMICAL", "active": True, "description": "Human foot"},
    {"id": 7, "name": "tool", "displayName": "Tool", "category": "EQUIPMENT", "active": True, "description": "Handheld tool or industrial apparatus"},
    {"id": 8, "name": "glasses", "displayName": "Glasses", "category": "PPE", "active": True, "description": "Safety glasses / protective eyewear"},
    {"id": 9, "name": "gloves", "displayName": "Gloves", "category": "PPE", "active": True, "description": "Protective industrial gloves"},
    {"id": 10, "name": "helmet", "displayName": "Helmet", "category": "PPE", "active": True, "description": "Hard hat / industrial safety helmet"},
    {"id": 11, "name": "hands", "displayName": "Hands", "category": "ANATOMICAL", "active": True, "description": "Human hands"},
    {"id": 12, "name": "head", "displayName": "Head", "category": "ANATOMICAL", "active": True, "description": "Human head"},
    {"id": 13, "name": "medical-suit", "displayName": "Medical Suit", "category": "PPE", "active": True, "description": "Medical / cleanroom coverall"},
    {"id": 14, "name": "shoes", "displayName": "Shoes", "category": "PPE", "active": True, "description": "Safety boots / industrial footwear"},
    {"id": 15, "name": "safety-suit", "displayName": "Safety Suit", "category": "PPE", "active": True, "description": "Full protective hazardous material suit"},
    {"id": 16, "name": "safety-vest", "displayName": "Safety Vest", "category": "PPE", "active": True, "description": "High-visibility reflective safety vest"}
]

ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


class ClassRegistry:
    """Authoritative Persistent Class Registry for SafeVision."""

    def __init__(self, dataset_dir: str = DEFAULT_DATASET_DIR):
        self.dataset_dir = dataset_dir
        self.metadata_dir = os.path.join(dataset_dir, "metadata")
        self.classes_path = os.path.join(self.metadata_dir, "classes.json")
        os.makedirs(self.metadata_dir, exist_ok=True)
        self._ensure_initialized()

    def _ensure_initialized(self):
        if not os.path.exists(self.classes_path):
            data = {
                "version": 1,
                "dataset": "safevision_ppe_v1",
                "classes": SEED_SH17_CLASSES
            }
            with open(self.classes_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)

    def load_data(self) -> Dict[str, Any]:
        with open(self.classes_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_data(self, data: Dict[str, Any]):
        with open(self.classes_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def get_classes(self, active_only: bool = False) -> List[Dict[str, Any]]:
        classes = self.load_data().get("classes", [])
        if active_only:
            return [c for c in classes if c.get("active", True)]
        return classes

    def get_class_by_id(self, cid: int) -> Optional[Dict[str, Any]]:
        for c in self.get_classes():
            if c["id"] == cid:
                return c
        return None

    def get_class_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        norm = self.normalize_name(name)
        for c in self.get_classes():
            if self.normalize_name(c["name"]) == norm:
                return c
        return None

    @staticmethod
    def normalize_name(raw: str) -> str:
        s = raw.strip().lower().replace(" ", "-").replace("_", "-")
        # Keep alphanumeric and dashes only
        s = "".join(ch for ch in s if ch.isalnum() or ch == "-")
        while "--" in s:
            s = s.replace("--", "-")
        return s.strip("-")

    def add_class(self, name: str, display_name: str = "", category: str = "OTHER", description: str = "", **kwargs) -> Dict[str, Any]:
        if not display_name and "displayName" in kwargs:
            display_name = kwargs["displayName"]
        norm_name = self.normalize_name(name)
        disp = display_name.strip()
        cat = category.strip().upper()

        if not norm_name:
            raise ValueError("Class name cannot be empty or solely invalid characters.")
        if not disp:
            raise ValueError("Display name cannot be empty.")

        valid_categories = {"PPE", "PERSON", "HAZARD", "SAFETY", "ANATOMICAL", "EQUIPMENT", "OTHER"}
        if cat not in valid_categories:
            cat = "OTHER"

        data = self.load_data()
        existing = data.get("classes", [])

        # Prevent duplicate normalized names or display names
        for c in existing:
            if self.normalize_name(c["name"]) == norm_name:
                raise ValueError(f"Class with name '{norm_name}' already exists (ID: {c['id']}).")
            if c.get("displayName", "").strip().lower() == disp.lower():
                raise ValueError(f"Class with display name '{disp}' already exists (ID: {c['id']}).")

        # Stable Monotonic ID Append Rule: max(id) + 1
        max_id = max((c["id"] for c in existing), default=-1)
        new_id = max_id + 1

        new_entry = {
            "id": new_id,
            "name": norm_name,
            "displayName": disp,
            "category": cat,
            "active": True,
            "description": description.strip()
        }
        existing.append(new_entry)
        data["classes"] = existing
        self.save_data(data)
        return new_entry

    def set_class_active(self, cid: int, active: bool) -> Dict[str, Any]:
        data = self.load_data()
        found = None
        for c in data.get("classes", []):
            if c["id"] == cid:
                c["active"] = bool(active)
                found = c
                break
        if not found:
            raise KeyError(f"Class ID {cid} not found in registry.")
        self.save_data(data)
        return found


class MediaManager:
    """Unified Media Library & Traceable Video Ingestion Engine."""

    def __init__(self, dataset_dir: str = DEFAULT_DATASET_DIR):
        self.dataset_dir = dataset_dir
        self.metadata_dir = os.path.join(dataset_dir, "metadata")
        self.sources_dir = os.path.join(dataset_dir, "sources")
        self.videos_dir = os.path.join(self.sources_dir, "videos")
        self.images_src_dir = os.path.join(self.sources_dir, "images")
        self.manifest_path = os.path.join(self.metadata_dir, "media_manifest.json")

        os.makedirs(self.videos_dir, exist_ok=True)
        os.makedirs(self.images_src_dir, exist_ok=True)
        os.makedirs(self.metadata_dir, exist_ok=True)

        self._ensure_initialized()

    def _ensure_initialized(self):
        """Initializes or backfills media_manifest.json with existing frames and dataset videos."""
        if os.path.exists(self.manifest_path):
            return

        manifest = {
            "version": 1,
            "sources": {
                "videos": [],
                "images": []
            },
            "mediaItems": {},
            "rejectedFrames": []
        }

        # Backfill existing videos from ai/datasets
        parent_dir = Path(self.dataset_dir).parent
        for vf in parent_dir.glob("*.*"):
            if vf.suffix.lower() in ALLOWED_VIDEO_EXTS:
                dest = os.path.join(self.videos_dir, vf.name)
                if not os.path.exists(dest):
                    try:
                        shutil.copy2(str(vf), dest)
                    except Exception:
                        pass
                info = self._probe_video(dest if os.path.exists(dest) else str(vf))
                if info:
                    manifest["sources"]["videos"].append(info)

        # Backfill existing images/frames
        for split in ["train", "val", "test"]:
            sdir = os.path.join(self.dataset_dir, "images", split)
            if os.path.exists(sdir):
                for f in sorted(os.listdir(sdir)):
                    if Path(f).suffix.lower() in ALLOWED_IMAGE_EXTS:
                        fpath = os.path.join(sdir, f)
                        w, h = 0, 0
                        try:
                            im = cv2.imread(fpath)
                            if im is not None:
                                h, w = im.shape[:2]
                        except Exception:
                            pass

                        # Determine if this was an extracted video frame
                        is_frame = f.startswith("SEQ-") or "_f" in f
                        item_id = f"FRM-{uuid.uuid4().hex[:6].upper()}" if is_frame else f"IMG-{uuid.uuid4().hex[:6].upper()}"

                        # Check box count
                        stem = Path(f).stem
                        lbl_path = os.path.join(self.dataset_dir, "labels", split, f"{stem}.txt")
                        box_cnt = 0
                        if os.path.exists(lbl_path):
                            with open(lbl_path, "r", encoding="utf-8") as lf:
                                box_cnt = len([ln for ln in lf if ln.strip()])

                        manifest["mediaItems"][f] = {
                            "id": item_id,
                            "filename": f,
                            "sourceType": "video-frame" if is_frame else "image",
                            "sourceVideo": "348897.mp4" if "SEQ-01" in f else ("5434223-hd_1920_1080_24fps.mp4" if "SEQ-02" in f else ("8965526-uhd_2160_3840_25fps.mp4" if "SEQ-03" in f else None)),
                            "sourceFrame": 0,
                            "sourceTimestamp": 0.0,
                            "width": w,
                            "height": h,
                            "split": split,
                            "status": "HUMAN_VERIFIED" if box_cnt > 0 else "UNREVIEWED",
                            "boxCount": box_cnt,
                            "rejectionReason": None
                        }

        with open(self.manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

    def load_manifest(self) -> Dict[str, Any]:
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_manifest(self, data: Dict[str, Any]):
        with open(self.manifest_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _probe_video(self, vpath: str) -> Optional[Dict[str, Any]]:
        cap = cv2.VideoCapture(vpath)
        if not cap.isOpened():
            return None
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration_sec = total_frames / fps if fps > 0 else 0
        cap.release()

        mins = int(duration_sec // 60)
        secs = int(duration_sec % 60)
        dur_str = f"{mins:02d}:{secs:02d}"

        return {
            "id": f"VID-{uuid.uuid4().hex[:4].upper()}",
            "filename": Path(vpath).name,
            "sourcePath": os.path.relpath(vpath, self.dataset_dir),
            "duration": dur_str,
            "durationSec": round(duration_sec, 2),
            "fps": round(fps, 2),
            "totalFrames": total_frames,
            "width": w,
            "height": h,
            "extractedCount": 0
        }

    def import_images(self, files: List[Tuple[str, bytes]], target_split: str = "train") -> List[Dict[str, Any]]:
        """Imports multiple images with collision-safe filenames and metadata."""
        if target_split not in {"train", "val", "test"}:
            target_split = "train"

        manifest = self.load_manifest()
        imported = []

        split_img_dir = os.path.join(self.dataset_dir, "images", target_split)
        split_lbl_dir = os.path.join(self.dataset_dir, "labels", target_split)
        os.makedirs(split_img_dir, exist_ok=True)
        os.makedirs(split_lbl_dir, exist_ok=True)

        for filename, content in files:
            ext = Path(filename).suffix.lower()
            if ext not in ALLOWED_IMAGE_EXTS:
                continue

            stem = Path(filename).stem
            # Collision-safe destination name
            dest_name = f"{stem}{ext}"
            counter = 1
            while os.path.exists(os.path.join(split_img_dir, dest_name)) or dest_name in manifest["mediaItems"]:
                dest_name = f"{stem}_{counter}{ext}"
                counter += 1

            # Save in split images
            dest_path = os.path.join(split_img_dir, dest_name)
            with open(dest_path, "wb") as f:
                f.write(content)

            # Copy to sources/images
            src_copy_path = os.path.join(self.images_src_dir, dest_name)
            with open(src_copy_path, "wb") as f:
                f.write(content)

            # Measure image resolution
            im = cv2.imread(dest_path)
            h, w = (im.shape[:2]) if im is not None else (0, 0)

            # Create empty label file
            dest_stem = Path(dest_name).stem
            lbl_dest = os.path.join(split_lbl_dir, f"{dest_stem}.txt")
            if not os.path.exists(lbl_dest):
                with open(lbl_dest, "w", encoding="utf-8") as lf:
                    pass

            item_entry = {
                "id": f"IMG-{uuid.uuid4().hex[:6].upper()}",
                "filename": dest_name,
                "sourceType": "image",
                "sourceFile": filename,
                "width": w,
                "height": h,
                "split": target_split,
                "status": "UNREVIEWED",
                "boxCount": 0,
                "rejectionReason": None
            }
            manifest["mediaItems"][dest_name] = item_entry
            imported.append(item_entry)

        self.save_manifest(manifest)
        return imported

    def import_videos(self, files: List[Tuple[str, bytes]]) -> List[Dict[str, Any]]:
        """Imports multiple videos to sources/videos/ and updates registry."""
        manifest = self.load_manifest()
        registered = []

        for filename, content in files:
            ext = Path(filename).suffix.lower()
            if ext not in ALLOWED_VIDEO_EXTS:
                continue

            stem = Path(filename).stem
            dest_name = f"{stem}{ext}"
            counter = 1
            while os.path.exists(os.path.join(self.videos_dir, dest_name)):
                dest_name = f"{stem}_{counter}{ext}"
                counter += 1

            dest_path = os.path.join(self.videos_dir, dest_name)
            with open(dest_path, "wb") as f:
                f.write(content)

            info = self._probe_video(dest_path)
            if info:
                manifest["sources"]["videos"].append(info)
                registered.append(info)

        self.save_manifest(manifest)
        return registered

    def extract_video_frames(
        self,
        video_filename: str,
        sample_method: str = "time",
        sample_interval: float = 2.0,
        max_frames: int = 500,
        quality_filter: bool = True,
        target_split: str = "train"
    ) -> Dict[str, Any]:
        """Extracts frames with quality filters (blur, duplicate, low content) and source metadata."""
        if target_split not in {"train", "val", "test"}:
            target_split = "train"

        vpath = os.path.join(self.videos_dir, video_filename)
        if not os.path.exists(vpath):
            parent_vpath = os.path.join(Path(self.dataset_dir).parent, video_filename)
            if os.path.exists(parent_vpath):
                vpath = parent_vpath
            else:
                raise FileNotFoundError(f"Video file not found: {video_filename}")

        cap = cv2.VideoCapture(vpath)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video file: {video_filename}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if sample_method == "frame":
            step = max(1, int(sample_interval))
        else: # "time"
            step = max(1, round(fps * max(0.1, sample_interval)))

        manifest = self.load_manifest()
        split_img_dir = os.path.join(self.dataset_dir, "images", target_split)
        split_lbl_dir = os.path.join(self.dataset_dir, "labels", target_split)
        os.makedirs(split_img_dir, exist_ok=True)
        os.makedirs(split_lbl_dir, exist_ok=True)

        accepted_frames = []
        rejected_frames = []
        prev_gray_small = None
        extracted_count = 0

        frame_idx = 0
        stem = Path(video_filename).stem

        while frame_idx < total_frames and extracted_count < max_frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            h, w = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            timestamp_sec = round(frame_idx / fps, 2)
            frame_name = f"{stem}_f{frame_idx:06d}_t{int(timestamp_sec*1000):06d}.jpg"

            # Quality Filters
            is_rejected = False
            rejection_reason = None

            if quality_filter:
                # 1. Blur detection (Laplacian variance)
                blur_var = cv2.Laplacian(gray, cv2.CV_64F).var()
                if blur_var < 20.0:
                    is_rejected = True
                    rejection_reason = "REJECTED — BLUR"

                # 2. Low visual content / blank frame (standard deviation)
                if not is_rejected:
                    std_dev = float(gray.std())
                    if std_dev < 10.0:
                        is_rejected = True
                        rejection_reason = "REJECTED — LOW CONTENT"

                # 3. Duplicate frame detection (MSE diff with prev accepted)
                if not is_rejected and prev_gray_small is not None:
                    gray_small = cv2.resize(gray, (160, 90))
                    mse = np.mean((gray_small.astype(np.float32) - prev_gray_small.astype(np.float32)) ** 2)
                    if mse < 2.5:
                        is_rejected = True
                        rejection_reason = "REJECTED — DUPLICATE"
                elif not is_rejected:
                    gray_small = cv2.resize(gray, (160, 90))

            if is_rejected:
                rejected_frames.append({
                    "filename": frame_name,
                    "video": video_filename,
                    "frameIdx": frame_idx,
                    "timestamp": timestamp_sec,
                    "reason": rejection_reason
                })
            else:
                # Accept frame
                dest_path = os.path.join(split_img_dir, frame_name)
                cv2.imwrite(dest_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])

                # Empty label file
                lbl_path = os.path.join(split_lbl_dir, f"{Path(frame_name).stem}.txt")
                if not os.path.exists(lbl_path):
                    with open(lbl_path, "w", encoding="utf-8") as lf:
                        pass

                item_entry = {
                    "id": f"FRM-{uuid.uuid4().hex[:6].upper()}",
                    "filename": frame_name,
                    "sourceType": "video-frame",
                    "sourceVideo": video_filename,
                    "sourceFrame": frame_idx,
                    "sourceTimestamp": timestamp_sec,
                    "width": w,
                    "height": h,
                    "split": target_split,
                    "status": "UNREVIEWED",
                    "boxCount": 0,
                    "rejectionReason": None
                }
                manifest["mediaItems"][frame_name] = item_entry
                accepted_frames.append(item_entry)
                prev_gray_small = cv2.resize(gray, (160, 90))
                extracted_count += 1

            frame_idx += step

        cap.release()

        # Update video stats in manifest
        for v in manifest["sources"]["videos"]:
            if v["filename"] == video_filename:
                v["extractedCount"] = v.get("extractedCount", 0) + len(accepted_frames)

        manifest["rejectedFrames"].extend(rejected_frames)
        self.save_manifest(manifest)

        return {
            "video": video_filename,
            "total_sampled": len(accepted_frames) + len(rejected_frames),
            "accepted_count": len(accepted_frames),
            "rejected_count": len(rejected_frames),
            "accepted": accepted_frames,
            "rejected": rejected_frames
        }

    def move_split(self, filename: str, new_split: str) -> Dict[str, Any]:
        """Moves an image/frame between train/val/test maintaining mutual exclusivity."""
        if new_split not in {"train", "val", "test"}:
            raise ValueError(f"Invalid split '{new_split}'. Must be train, val, or test.")

        manifest = self.load_manifest()
        current_split = None
        for s in ["train", "val", "test"]:
            if os.path.exists(os.path.join(self.dataset_dir, "images", s, filename)):
                current_split = s
                break

        if not current_split:
            raise FileNotFoundError(f"File '{filename}' not found in any split.")

        if current_split == new_split:
            return {"status": "unchanged", "filename": filename, "split": new_split}

        # Move image file
        src_img = os.path.join(self.dataset_dir, "images", current_split, filename)
        dst_img = os.path.join(self.dataset_dir, "images", new_split, filename)
        shutil.move(src_img, dst_img)

        # Move label file if exists
        stem = Path(filename).stem
        src_lbl = os.path.join(self.dataset_dir, "labels", current_split, f"{stem}.txt")
        dst_lbl = os.path.join(self.dataset_dir, "labels", new_split, f"{stem}.txt")
        if os.path.exists(src_lbl):
            shutil.move(src_lbl, dst_lbl)

        # Update manifest
        if filename in manifest["mediaItems"]:
            manifest["mediaItems"][filename]["split"] = new_split
            self.save_manifest(manifest)

        # Update split_manifest.json if present
        split_m_path = os.path.join(self.metadata_dir, "split_manifest.json")
        if os.path.exists(split_m_path):
            with open(split_m_path, "r", encoding="utf-8") as sf:
                sm = json.load(sf)
            if "splits" in sm:
                if filename in sm["splits"].get(current_split, {}).get("files", []):
                    sm["splits"][current_split]["files"].remove(filename)
                if filename not in sm["splits"].get(new_split, {}).get("files", []):
                    sm["splits"][new_split].setdefault("files", []).append(filename)
            with open(split_m_path, "w", encoding="utf-8") as sf:
                json.dump(sm, sf, indent=2)

        return {"status": "moved", "filename": filename, "from": current_split, "to": new_split}

    def get_library_items(self, filter_type: str = "all") -> List[Dict[str, Any]]:
        manifest = self.load_manifest()
        items = []

        if filter_type in {"all", "videos"}:
            for v in manifest["sources"].get("videos", []):
                items.append({
                    "id": v["id"],
                    "filename": v["filename"],
                    "type": "VIDEO",
                    "resolution": f"{v['width']}×{v['height']}",
                    "duration": v["duration"],
                    "source": "Direct Upload",
                    "status": "SOURCE_MEDIA",
                    "boxCount": 0,
                    "split": "-",
                    "extractedCount": v.get("extractedCount", 0)
                })

        if filter_type in {"all", "images", "frames"}:
            for fname, meta in manifest.get("mediaItems", {}).items():
                is_frame = meta.get("sourceType") == "video-frame"
                if filter_type == "images" and is_frame:
                    continue
                if filter_type == "frames" and not is_frame:
                    continue

                items.append({
                    "id": meta.get("id", "IMG-UNKNOWN"),
                    "filename": fname,
                    "type": "FRAME" if is_frame else "IMAGE",
                    "resolution": f"{meta.get('width', 0)}×{meta.get('height', 0)}",
                    "source": meta.get("sourceVideo") or meta.get("sourceFile") or "Imported Image",
                    "status": meta.get("status", "UNREVIEWED"),
                    "boxCount": meta.get("boxCount", 0),
                    "split": meta.get("split", "train"),
                    "extractedCount": 0
                })

        return items

    def get_dataset_summary(self) -> Dict[str, Any]:
        manifest = self.load_manifest()
        registry = ClassRegistry(self.dataset_dir)

        train_count = len(os.listdir(os.path.join(self.dataset_dir, "images", "train"))) if os.path.exists(os.path.join(self.dataset_dir, "images", "train")) else 0
        val_count = len(os.listdir(os.path.join(self.dataset_dir, "images", "val"))) if os.path.exists(os.path.join(self.dataset_dir, "images", "val")) else 0
        test_count = len(os.listdir(os.path.join(self.dataset_dir, "images", "test"))) if os.path.exists(os.path.join(self.dataset_dir, "images", "test")) else 0

        total_frames = 0
        annotated = 0
        human_verified = 0
        unreviewed = 0

        for fname, meta in manifest.get("mediaItems", {}).items():
            total_frames += 1
            bc = meta.get("boxCount", 0)
            st = meta.get("status", "UNREVIEWED")
            if bc > 0 or st in {"ANNOTATED", "HUMAN_VERIFIED"}:
                annotated += 1
            if st == "HUMAN_VERIFIED":
                human_verified += 1
            elif st == "UNREVIEWED":
                unreviewed += 1

        rejected_cnt = len(manifest.get("rejectedFrames", []))
        videos_cnt = len(manifest.get("sources", {}).get("videos", []))
        classes_cnt = len(registry.get_classes())

        is_training_ready = (human_verified >= 10 and (train_count + val_count + test_count) >= 10)

        return {
            "total_images": total_frames,
            "videos_count": videos_cnt,
            "extracted_frames": total_frames,
            "annotated_count": annotated,
            "human_verified_count": human_verified,
            "unreviewed_count": unreviewed,
            "rejected_count": rejected_cnt,
            "classes_count": classes_cnt,
            "splits": {
                "train": train_count,
                "val": val_count,
                "test": test_count,
                "total": train_count + val_count + test_count
            },
            "training_readiness": "READY FOR TRAINING" if is_training_ready else "NOT READY"
        }


class DatasetAuditor:
    """12-Point Comprehensive Quality Control Audit Engine for SafeVision."""

    def __init__(self, dataset_dir: str = DEFAULT_DATASET_DIR):
        self.dataset_dir = dataset_dir
        self.registry = ClassRegistry(dataset_dir)

    def run_audit(self) -> Dict[str, Any]:
        classes = self.registry.get_classes()
        valid_class_ids = {c["id"] for c in classes}

        issues: Dict[str, List[str]] = {
            "missing_labels": [],
            "invalid_class_ids": [],
            "invalid_coords_format": [],
            "out_of_bounds_coords": [],
            "non_positive_dimensions": [],
            "duplicate_boxes": [],
            "corrupt_images": [],
            "unsupported_files": [],
            "empty_annotation_files": [],
            "class_registry_mismatch": [],
            "missing_source_metadata": [],
            "split_duplications": []
        }

        all_split_files: Dict[str, str] = {}
        total_images_checked = 0

        # Check manifests
        manifest_p = os.path.join(self.dataset_dir, "metadata", "media_manifest.json")
        manifest_data = {}
        if os.path.exists(manifest_p):
            with open(manifest_p, "r", encoding="utf-8") as f:
                manifest_data = json.load(f).get("mediaItems", {})

        for split in ["train", "val", "test"]:
            img_dir = os.path.join(self.dataset_dir, "images", split)
            lbl_dir = os.path.join(self.dataset_dir, "labels", split)
            if not os.path.exists(img_dir):
                continue

            for fname in os.listdir(img_dir):
                fpath = os.path.join(img_dir, fname)
                ext = Path(fname).suffix.lower()

                # Rule 8: Unsupported files
                if ext not in ALLOWED_IMAGE_EXTS:
                    issues["unsupported_files"].append(f"{split}/{fname}: unsupported extension {ext}")
                    continue

                total_images_checked += 1

                # Rule 12: Split duplication
                if fname in all_split_files:
                    issues["split_duplications"].append(f"{fname} appears in both {all_split_files[fname]} and {split}")
                else:
                    all_split_files[fname] = split

                # Rule 7: Corrupt images
                im = cv2.imread(fpath)
                if im is None or im.size == 0:
                    issues["corrupt_images"].append(f"{split}/{fname}: failed OpenCV decode")
                    continue

                # Rule 11: Missing source metadata
                if fname not in manifest_data:
                    issues["missing_source_metadata"].append(f"{split}/{fname} missing in media_manifest.json")

                # Rule 1: Missing label file
                stem = Path(fname).stem
                lbl_path = os.path.join(lbl_dir, f"{stem}.txt")
                if not os.path.exists(lbl_path):
                    issues["missing_labels"].append(f"{split}/{stem}.txt does not exist")
                    continue

                # Parse labels
                with open(lbl_path, "r", encoding="utf-8") as lf:
                    lines = [ln.strip() for ln in lf if ln.strip()]

                # Rule 9: Empty annotations (only flagged if marked human verified)
                if not lines and manifest_data.get(fname, {}).get("status") == "HUMAN_VERIFIED":
                    issues["empty_annotation_files"].append(f"{split}/{fname} marked HUMAN_VERIFIED but has 0 boxes")

                boxes = []
                for line_idx, line in enumerate(lines):
                    parts = line.split()
                    if len(parts) != 5:
                        issues["invalid_coords_format"].append(f"{split}/{stem}.txt line {line_idx+1}: expected 5 tokens, got {len(parts)}")
                        continue

                    # Class ID parsing
                    try:
                        cid = int(parts[0])
                        # Rule 2: Invalid YOLO class ID
                        if cid not in valid_class_ids:
                            issues["invalid_class_ids"].append(f"{split}/{stem}.txt: class ID {cid} not in registry")
                    except ValueError:
                        issues["invalid_coords_format"].append(f"{split}/{stem}.txt: non-integer class ID '{parts[0]}'")
                        continue

                    # Normalized coords parsing
                    try:
                        xc, yc, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                    except ValueError:
                        issues["invalid_coords_format"].append(f"{split}/{stem}.txt: non-float coordinates")
                        continue

                    # Rule 4: Out of bounds coords
                    if not (0.0 <= xc <= 1.0 and 0.0 <= yc <= 1.0):
                        issues["out_of_bounds_coords"].append(f"{split}/{stem}.txt: center ({xc:.4f}, {yc:.4f}) outside [0,1]")

                    # Rule 5: Non-positive dimensions
                    if w <= 0.0 or h <= 0.0:
                        issues["non_positive_dimensions"].append(f"{split}/{stem}.txt: non-positive box dimension (w={w}, h={h})")

                    box_tuple = (cid, round(xc, 3), round(yc, 3), round(w, 3), round(h, 3))
                    # Rule 6: Duplicate boxes
                    if box_tuple in boxes:
                        issues["duplicate_boxes"].append(f"{split}/{stem}.txt: duplicate box with class {cid}")
                    boxes.append(box_tuple)

        # Rule 10: Class registry mismatch
        if len(valid_class_ids) < 17:
            issues["class_registry_mismatch"].append(f"Registry has fewer than 17 base classes: {len(valid_class_ids)}")

        failed_checks = sum(1 for k, v in issues.items() if len(v) > 0)
        passed_checks = 12 - failed_checks

        return {
            "audit_status": "PASS" if failed_checks == 0 else "FAIL",
            "total_images_audited": total_images_checked,
            "passed_checks": passed_checks,
            "failed_checks": failed_checks,
            "issues": issues,
            "summary": "All 12 dataset quality criteria satisfied." if failed_checks == 0 else f"{failed_checks} checks failed."
        }


if __name__ == "__main__":
    reg = ClassRegistry()
    mm = MediaManager()
    auditor = DatasetAuditor()

    print("Classes count:", len(reg.get_classes()))
    print("Media items count:", len(mm.get_library_items()))
    audit_res = auditor.run_audit()
    print("Audit result:", audit_res["audit_status"], f"({audit_res['passed_checks']}/12 passed)")
