"""
Sends continuous real-time detection telemetry for VHJV and TRY cameras
for live visual validation in the browser.
"""

import time
import requests

BACKEND_URL = "http://127.0.0.1:5005"

def run_telemetry(duration_sec=30):
    t0 = time.time()
    hb_url = f"{BACKEND_URL}/api/detection/camera-heartbeat"
    det_url = f"{BACKEND_URL}/api/detection/camera-detections"
    
    # 1. Send heartbeat to set camera LIVE
    requests.post(hb_url, json={
        "cameraId": "VHJV",
        "status": "LIVE",
        "fps": 24.0,
        "processedFps": 24.0,
        "latencyMs": 42.0,
        "frameAgeMs": 15.0
    }, timeout=1.0)
    
    print(f"Streaming live PPE compliance telemetry to {det_url} for {duration_sec}s...")
    
    while time.time() - t0 < duration_sec:
        elapsed = round(time.time() - t0, 1)
        # Worker 1: TRACK-1042 (Confirmed Missing Vest)
        # Worker 2: TRACK-1043 (Compliant)
        payload = {
            "cameraId": "VHJV",
            "timestamp": "2026-10-02T02:00:00.000Z",
            "frameWidth": 1280,
            "frameHeight": 720,
            "detections": [
                {
                    "trackId": "TRACK-1042",
                    "employeeId": None,
                    "employeeName": None,
                    "identityStatus": "UNCONFIRMED",
                    "className": "person",
                    "confidence": 0.94,
                    "personConfidence": 0.941,
                    "bbox": {
                        "ymin": 20.0,
                        "xmin": 15.0,
                        "ymax": 80.0,
                        "xmax": 42.0,
                        "label": "TRACK-1042",
                        "color": "#EF4444"
                    },
                    "ppe": {
                        "helmet": "PRESENT",
                        "vest": "MISSING",
                        "gloves": "PRESENT",
                        "shoes": "UNKNOWN",
                        "glasses": "PRESENT"
                    },
                    "ppeDetails": {
                        "helmet": {"status": "PRESENT", "confidence": 0.963, "durationSec": 0.0},
                        "vest": {"status": "MISSING", "confidence": 0.912, "durationSec": 24.0 + elapsed},
                        "gloves": {"status": "PRESENT", "confidence": 0.890, "durationSec": 0.0},
                        "shoes": {"status": "UNKNOWN", "confidence": 0.0, "durationSec": 0.0},
                        "glasses": {"status": "PRESENT", "confidence": 0.904, "durationSec": 0.0}
                    },
                    "overallCompliance": "NON-COMPLIANT",
                    "complianceDurationSec": 24.0 + elapsed,
                    "temporalState": "TEMPORALLY_CONFIRMED",
                    "violations": ["missing_vest"]
                },
                {
                    "trackId": "TRACK-1043",
                    "employeeId": "EMP-2041",
                    "employeeName": "Rajesh Kumar",
                    "identityStatus": "CONFIRMED",
                    "className": "person",
                    "confidence": 0.96,
                    "personConfidence": 0.962,
                    "bbox": {
                        "ymin": 22.0,
                        "xmin": 55.0,
                        "ymax": 82.0,
                        "xmax": 82.0,
                        "label": "TRACK-1043",
                        "color": "#10B981"
                    },
                    "ppe": {
                        "helmet": "PRESENT",
                        "vest": "PRESENT",
                        "gloves": "PRESENT",
                        "shoes": "PRESENT",
                        "glasses": "PRESENT"
                    },
                    "ppeDetails": {
                        "helmet": {"status": "PRESENT", "confidence": 0.975, "durationSec": 0.0},
                        "vest": {"status": "PRESENT", "confidence": 0.948, "durationSec": 0.0},
                        "gloves": {"status": "PRESENT", "confidence": 0.915, "durationSec": 0.0},
                        "shoes": {"status": "PRESENT", "confidence": 0.932, "durationSec": 0.0},
                        "glasses": {"status": "PRESENT", "confidence": 0.920, "durationSec": 0.0}
                    },
                    "overallCompliance": "COMPLIANT",
                    "complianceDurationSec": 0.0,
                    "temporalState": "OBSERVING",
                    "violations": []
                }
            ]
        }
        
        try:
            requests.post(det_url, json=payload, timeout=0.5)
        except Exception:
            pass
        time.sleep(0.15)

if __name__ == "__main__":
    run_telemetry(180)
