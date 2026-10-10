import numpy as np
from typing import List, Dict, Tuple, Optional, Any
import time

def box_iou(box1: List[float], box2: List[float]) -> float:
    """
    Computes Intersection over Union (IoU) of two bounding boxes in [ymin, xmin, ymax, xmax] format.
    """
    y1 = max(box1[0], box2[0])
    x1 = max(box1[1], box2[1])
    y2 = min(box1[2], box2[2])
    x2 = min(box1[3], box2[3])

    inter_area = max(0.0, y2 - y1) * max(0.0, x2 - x1)
    if inter_area == 0.0:
        return 0.0

    area1 = max(0.0, box1[2] - box1[0]) * max(0.0, box1[3] - box1[1])
    area2 = max(0.0, box2[2] - box2[0]) * max(0.0, box2[3] - box2[1])
    union_area = area1 + area2 - inter_area

    if union_area <= 0.0:
        return 0.0
    return float(inter_area / union_area)

class STrack:
    def __init__(self, track_id: int, bbox: List[float], score: float):
        self.track_id = track_id
        self.track_label = f"TRACK-{track_id:06d}"
        self.bbox = bbox  # [ymin, xmin, ymax, xmax]
        self.score = score
        self.state = "TRACKED"  # "TRACKED", "LOST", "REMOVED"
        self.is_activated = True
        self.frame_id = 0
        self.tracklet_len = 1
        self.time_since_update = 0
        self.history: List[List[float]] = [bbox]
        self.created_at = time.time()
        self.last_updated = self.created_at

    def update(self, new_bbox: List[float], new_score: float, frame_id: int):
        self.bbox = new_bbox
        self.score = new_score
        self.tracklet_len += 1
        self.time_since_update = 0
        self.state = "TRACKED"
        self.frame_id = frame_id
        self.last_updated = time.time()
        self.history.append(new_bbox)
        if len(self.history) > 30:
            self.history.pop(0)

    def mark_missed(self):
        self.time_since_update += 1
        if self.time_since_update > 2:
            self.state = "LOST"

class ByteTracker:
    """
    ByteTrack implementation for multi-person worker tracking.
    Uses two-stage association (high-confidence then low-confidence) with IoU distance matching.
    Worker tracking IDs are temporary track IDs (e.g. TRACK-000102), NOT employee IDs.
    """
    def __init__(
        self,
        high_thresh: float = 0.5,
        low_thresh: float = 0.1,
        match_thresh: float = 0.7,
        max_time_lost: int = 30,
        track_id_offset: int = 1000
    ):
        self.high_thresh = high_thresh
        self.low_thresh = low_thresh
        self.match_thresh = match_thresh
        self.max_time_lost = max_time_lost

        self.tracked_stracks: List[STrack] = []
        self.lost_stracks: List[STrack] = []
        self.removed_stracks: List[STrack] = []

        self.frame_id = 0
        self.next_id = track_id_offset

    def update(self, detections: List[Dict[str, Any]]) -> List[STrack]:
        """
        detections: List of dicts with:
          - 'bbox': [ymin, xmin, ymax, xmax]
          - 'score': float confidence
        Returns list of active tracked STracks for this frame.
        """
        self.frame_id += 1
        activated_stracks: List[STrack] = []
        refind_stracks: List[STrack] = []
        lost_stracks: List[STrack] = []
        removed_stracks: List[STrack] = []

        # Split detections into high confidence and low confidence
        det_high = []
        det_low = []
        for det in detections:
            bbox = det['bbox']
            score = float(det['score'])
            if score >= self.high_thresh:
                det_high.append((bbox, score))
            elif score >= self.low_thresh:
                det_low.append((bbox, score))

        # Track pool for first matching: currently tracked + recently lost
        pool_stracks = [t for t in self.tracked_stracks if t.state == "TRACKED"]
        pool_stracks += [t for t in self.lost_stracks if t.state == "LOST"]

        # Stage 1: Associate high confidence detections with track pool
        unmatched_tracks = list(range(len(pool_stracks)))
        unmatched_dets_high = list(range(len(det_high)))
        matched_pairs_1: List[Tuple[int, int]] = []

        if len(pool_stracks) > 0 and len(det_high) > 0:
            iou_matrix = np.zeros((len(pool_stracks), len(det_high)), dtype=np.float32)
            for t_idx, track in enumerate(pool_stracks):
                for d_idx, (d_box, _) in enumerate(det_high):
                    iou_matrix[t_idx, d_idx] = box_iou(track.bbox, d_box)

            # Greedy matching for high IoU
            while True:
                max_val = np.max(iou_matrix) if iou_matrix.size > 0 else 0.0
                if max_val < (1.0 - self.match_thresh):  # using IoU threshold (0.3 minimum overlap)
                    break
                t_idx, d_idx = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
                matched_pairs_1.append((t_idx, d_idx))
                iou_matrix[t_idx, :] = -1.0
                iou_matrix[:, d_idx] = -1.0
                if t_idx in unmatched_tracks:
                    unmatched_tracks.remove(t_idx)
                if d_idx in unmatched_dets_high:
                    unmatched_dets_high.remove(d_idx)

        # Update stage 1 matches
        for t_idx, d_idx in matched_pairs_1:
            track = pool_stracks[t_idx]
            d_box, d_score = det_high[d_idx]
            track.update(d_box, d_score, self.frame_id)
            activated_stracks.append(track)
            if track in self.lost_stracks:
                self.lost_stracks.remove(track)
            if track not in self.tracked_stracks:
                self.tracked_stracks.append(track)

        # Stage 2: Associate remaining unmatched tracks with low confidence detections
        remain_tracks = [pool_stracks[i] for i in unmatched_tracks if pool_stracks[i].state == "TRACKED"]
        matched_pairs_2: List[Tuple[int, int]] = []
        unmatched_remain_tracks = list(range(len(remain_tracks)))

        if len(remain_tracks) > 0 and len(det_low) > 0:
            iou_matrix_2 = np.zeros((len(remain_tracks), len(det_low)), dtype=np.float32)
            for t_idx, track in enumerate(remain_tracks):
                for d_idx, (d_box, _) in enumerate(det_low):
                    iou_matrix_2[t_idx, d_idx] = box_iou(track.bbox, d_box)

            while True:
                max_val = np.max(iou_matrix_2) if iou_matrix_2.size > 0 else 0.0
                if max_val < 0.25:  # lower threshold for recovering tracklet
                    break
                t_idx, d_idx = np.unravel_index(np.argmax(iou_matrix_2), iou_matrix_2.shape)
                matched_pairs_2.append((t_idx, d_idx))
                iou_matrix_2[t_idx, :] = -1.0
                iou_matrix_2[:, d_idx] = -1.0
                if t_idx in unmatched_remain_tracks:
                    unmatched_remain_tracks.remove(t_idx)

        for t_idx, d_idx in matched_pairs_2:
            track = remain_tracks[t_idx]
            d_box, d_score = det_low[d_idx]
            track.update(d_box, d_score, self.frame_id)
            activated_stracks.append(track)

        # Handle tracks still unmatched after both stages
        for t_idx in unmatched_remain_tracks:
            track = remain_tracks[t_idx]
            track.mark_missed()
            if track.time_since_update > self.max_time_lost:
                track.state = "REMOVED"
                removed_stracks.append(track)
            else:
                track.state = "LOST"
                lost_stracks.append(track)

        # Stage 3: Initiate new tracks for unmatched high-confidence detections
        for d_idx in unmatched_dets_high:
            d_box, d_score = det_high[d_idx]
            self.next_id += 1
            new_track = STrack(self.next_id, d_box, d_score)
            new_track.frame_id = self.frame_id
            self.tracked_stracks.append(new_track)
            activated_stracks.append(new_track)

        # Clean up tracked and lost lists
        self.tracked_stracks = [t for t in self.tracked_stracks if t.state == "TRACKED"]
        self.lost_stracks = [t for t in self.lost_stracks + lost_stracks if t.state == "LOST" and t.time_since_update <= self.max_time_lost]
        self.removed_stracks += removed_stracks

        return activated_stracks
