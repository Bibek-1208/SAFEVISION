# SafeVision AI — System Dependencies & Environment Matrix

This document provides a comprehensive, transparent inventory of all dependencies across SafeVision AI microservices. No simulated or hidden components exist.

---

## 1. Core Runtime Prerequisites

| Component | Minimum Version | Verified Active | Purpose | Required / Optional |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` | Node v20+ | Backend runtime & Vite frontend build | **Required** |
| **npm** | `>= 9.0.0` | npm v10+ | Package manager | **Required** |
| **Python** | `3.10` or `3.11` | Python 3.11 (`ai/.venv`) | AI microservice runtime | **Required** |
| **MongoDB** | `>= 6.0` | Mongoose 8.9 (Embedded Fallback Active) | Enterprise audit & incident persistence | **Optional (Auto-Fallback)** |
| **MediaMTX** | `>= 1.5.0` | Configured in `mediamtx.yml` | Industrial RTSP-to-WebRTC/HLS Gateway | **Optional for live RTSP** |
| **FFmpeg** | `>= 4.4` | System path | Hardware transcoder for RTSP streams | **Optional for RTSP** |

---

## 2. Python AI Microservice (`ai/requirements.txt`)

Location: `ai/`  
Virtualenv: `ai/.venv`

### Installed Packages

1. **`fastapi`**
   - **Version**: `0.110.0+`
   - **Purpose**: High-performance asynchronous REST API framework serving `/health`, `/infer/frame`, `/infer/image`.
   - **Installation**: `pip install fastapi`
   - **Verification**: `python -c "import fastapi; print(fastapi.__version__)"`
   - **Human Configuration**: No

2. **`uvicorn[standard]`**
   - **Version**: `0.28.0+`
   - **Purpose**: ASGI web server hosting the FastAPI inference service on port 8000.
   - **Installation**: `pip install "uvicorn[standard]"`
   - **Verification**: `python -m uvicorn --version`
   - **Human Configuration**: No

3. **`opencv-python-headless`**
   - **Version**: `4.9.0+`
   - **Purpose**: Core computer vision engine executing HOG person tracking, HSV color thresholding for vests and hardhats, edge gradient calculation, and luminosity extraction.
   - **Installation**: `pip install opencv-python-headless`
   - **Verification**: `python -c "import cv2; print(cv2.__version__)"`
   - **Human Configuration**: No

4. **`numpy`**
   - **Version**: `1.26.0+`
   - **Purpose**: N-dimensional matrix operations for raw frame arrays and spatial coordinate math.
   - **Installation**: `pip install numpy`
   - **Verification**: `python -c "import numpy; print(numpy.__version__)"`
   - **Human Configuration**: No

5. **`pillow`**
   - **Version**: `10.2.0+`
   - **Purpose**: Image decode, byte stream serialization, and JPEG resizing.
   - **Installation**: `pip install pillow`
   - **Verification**: `python -c "import PIL; print(PIL.__version__)"`
   - **Human Configuration**: No

6. **`python-multipart`**
   - **Version**: `0.0.9+`
   - **Purpose**: Multipart form-data parser for multipart image and video file uploads.
   - **Installation**: `pip install python-multipart`
   - **Verification**: `python -c "import multipart; print(multipart.__version__)"`
   - **Human Configuration**: No

7. **`torch` & `ultralytics` (Conditional / Custom Weights)**
   - **Version**: `torch>=2.0.0`, `ultralytics>=8.1.0`
   - **Purpose**: Deep learning inference for custom fine-tuned YOLOv8 industrial safety weights (`.pt`).
   - **Installation**: `pip install ultralytics torch torchvision`
   - **Verification**: `python -c "import ultralytics; print(ultralytics.__version__)"`
   - **Human Configuration Required**: **YES**. User must supply custom industrial PPE model weights (e.g. `yolov8n-ppe.pt`) placed in `ai/models/`. When absent, the system honestly reports `model_status: "unconfigured"`.

---

## 3. Node.js Core Backend (`server/package.json`)

Location: `server/`

### Key Production Dependencies

1. **`express`** (`^4.18.2`)
   - **Purpose**: Core HTTP server routing, REST API controllers, and middleware.
   - **Verification**: `node -e "require('express')"`

2. **`socket.io`** (`^4.8.1`)
   - **Purpose**: Real-time bi-directional WebSocket transport broadcasting incidents, telemetry, and health states.
   - **Verification**: `node -e "require('socket.io')"`

3. **`jsonwebtoken`** (`^9.0.2`)
   - **Purpose**: Cryptographically signed SHA-256 JWT tokens encoding authoritative user roles, sites, and zone IDs.
   - **Verification**: `node -e "require('jsonwebtoken')"`

4. **`bcryptjs`** (`^2.4.3`)
   - **Purpose**: Salted password hashing for corporate seed accounts.
   - **Verification**: `node -e "require('bcryptjs')"`

5. **`cors`** (`^2.8.5`)
   - **Purpose**: Cross-origin resource sharing policy restricting API access.

6. **`dotenv`** (`^16.4.5`)
   - **Purpose**: Safe environment variable configuration loading.

7. **`multer`** (`^1.4.5-lts.1`)
   - **Purpose**: Streaming disk storage for evidence snapshots and uploaded inspection media.

8. **`mongoose`** (`^8.9.0`)
   - **Purpose**: MongoDB Object Modeling for persistence. Built with automatic, transparent fallback to in-memory `DataStore` with zero crashing if MongoDB is offline.

---

## 4. Web Command Center (`client/package.json`)

Location: `client/`

### Core Dependencies

1. **`react`** (`^19.0.0`) & **`react-dom`** (`^19.0.0`)
   - **Purpose**: Reactive UI library for component composition.

2. **`react-router-dom`** (`^7.0.0`)
   - **Purpose**: Single-page application route management with exact active path matching.

3. **`socket.io-client`** (`^4.8.1`)
   - **Purpose**: Client-side WebSocket subscriber receiving real-time incidents.

4. **`lucide-react`** (`^1.16.0`)
   - **Purpose**: Vector iconography for industrial command center UI.

5. **`clsx` & `tailwind-merge`**
   - **Purpose**: Style token utilities and conditional CSS classes.

---

## 5. Mobile Field Operations (Web-Integrated)

Location: `client/src/pages/MobileFieldOpsPage.tsx` (Route: `/mobile`)

Mobile field operations are integrated natively into the responsive Web Command Center (`client/`), serving floor supervisors and safety officers directly without requiring a separate standalone native application bundle.

---

## 6. Verification Commands Quick Reference

```bash
# Verify Backend
cd server && node -e "console.log('Node modules OK')"

# Run 30-Step Full Platform Verification
cd server && node test_full_platform.js

# Run RBAC/SBAC Security Verification
node tests/test_rbac_sbac.js

# Verify Frontend Build
cd client && npm run build

# Verify Python AI Service Health
curl http://localhost:8000/health
```
