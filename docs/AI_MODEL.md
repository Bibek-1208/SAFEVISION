# SafeVision AI — Industrial PPE Model Specification & Integration Guide

> **Data-Truth Policy**: A generic 80-class COCO model (which only detects chairs, dogs, cars, and general persons) is **NOT** sufficient for industrial safety monitoring. SafeVision AI refuses to falsely claim YOLO is running when trained weights are missing.

---

## 1. Current Active Inference Engine (Baseline CV)

Until custom weights are placed in the models directory, the Python AI microservice (`ai/server.py` on port 8000) operates in an honest, verified **Baseline Computer Vision Mode**:

- **Engine**: `OpenCV HOG Person Detector + Spectral Color Analysis`
- **Health Response**:
  ```json
  {
    "status": "healthy",
    "ai_engine": "OpenCV HOG Person Detector + Color Analysis (Baseline CV)",
    "model_status": "unconfigured",
    "model_name": "None (Awaiting Trained Weights)"
  }
  ```
- **Capabilities**:
  - **Worker Detection**: OpenCV Histogram of Oriented Gradients (HOG) default human pedestrian detector.
  - **Reflective Vest Detection**: HSV spectral analysis isolating fluorescent yellow/green and high-vis orange wavelengths ($20 \le H \le 40$ and $5 \le H \le 18$) across the upper-torso region of interest (ROI).
  - **Hardhat / Helmet Detection**: Circular contour and high-contrast color segmentation across the head ROI.
  - **Fire / Hotspot Detection**: High-luminosity thresholding ($V \ge 245$, $S \le 30$) in combustion areas.
  - **Worker Fall**: Bounding-box aspect ratio collapse ($\text{width} > 1.4 \times \text{height}$) on floor coordinates.

---

## 2. Required Industrial PPE Model Weights

To upgrade SafeVision AI from the baseline OpenCV detector to a deep learning neural network, trained weights must be supplied:

### Model Metadata
- **Recommended Model**: `yolov8n-ppe.pt` (or `yolov8s-ppe.pt`, `yolov8m-ppe.pt`)
- **Format**: PyTorch Checkpoint (`.pt`), ONNX (`.onnx`), or OpenVINO / TensorRT engine
- **Input Resolution**: $640 \times 640$ pixels (RGB)
- **Target Location**: `ai/models/best.pt` or `ai/models/yolov8n-ppe.pt`

### Required Detection Classes
The model must be trained to recognize the following industrial safety classes:

| Class Index | Class Name | Statutory Reference | Standard Action |
| :--- | :--- | :--- | :--- |
| `0` | `person` | General Worker Tracking | Baseline identification & bounding box |
| `1` | `helmet` | OSHA 1910.135 / DGFASLI R.65 | Verified head protection |
| `2` | `no_helmet` | OSHA 1910.135 / DGFASLI R.65 | Critical violation; incident created |
| `3` | `safety_vest` | ISO 20471 / EN 471 | High-visibility compliance |
| `4` | `no_safety_vest` | ISO 20471 / EN 471 | Critical violation; horn sounded |
| `5` | `gloves` | OSHA 1910.138 | Chemical/hot metal handling |
| `6` | `no_gloves` | OSHA 1910.138 | Warning notification to supervisor |
| `7` | `safety_shoes` | ASTM F2413 / OSHA 1910.136 | Toe/crush hazard protection |
| `8` | `no_safety_shoes` | ASTM F2413 / OSHA 1910.136 | Area entry restricted |
| `9` | `fire` | NFPA 10 / Factories Act 1948 | Immediate plant-wide acoustic alert |
| `10` | `smoke` | NFPA 72 | Early thermal detection |
| `11` | `worker_fall` | OSHA 1926 Subpart M | Man-down emergency escalation |

---

## 3. How to Install and Activate Custom Weights

1. Place your trained `.pt` weights into:
   ```
   c:\Users\bibek\Desktop\SAFEVISION\ai\models\best.pt
   ```
2. Update the environment variable in `ai/.env` (or `server/.env`):
   ```env
   YOLO_MODEL_PATH=models/best.pt
   ```
3. Trigger dynamic model reload without restarting the server:
   ```bash
   curl -X POST http://localhost:8000/reload-model
   ```
4. Verify updated status:
   ```bash
   curl http://localhost:8000/health
   ```
   *Expected Response*:
   ```json
   {
     "status": "healthy",
     "ai_engine": "Ultralytics YOLOv8 PyTorch Pipeline",
     "model_status": "loaded",
     "model_name": "best.pt",
     "classes": ["helmet", "no_helmet", "safety_vest", "no_safety_vest", "gloves", "no_gloves", "safety_shoes", "no_safety_shoes", "fire", "smoke", "worker_fall"]
   }
   ```

---

## 4. Training Your Own Custom Model

The repository includes complete scripts in `ai/scripts/` to train and evaluate custom YOLOv8 models:
- **`prepare_dataset.py`**: Validates YOLO format labels (`images/` and `labels/`) and partitions into 70% train / 20% val / 10% test.
- **`train.py`**: Executes transfer learning from `yolov8n.pt`:
  ```bash
  cd ai && python scripts/train.py --data configs/ppe_data.yaml --epochs 50 --batch 16
  ```
- **`evaluate.py`**: Computes mAP@50 and mAP@50-95 metrics.
- **`export.py`**: Converts the final weights to ONNX or TensorRT for ultra-low latency edge deployment.
