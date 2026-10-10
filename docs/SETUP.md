# SafeVision AI — Complete Local Setup & Deployment Guide

Follow this step-by-step guide to configure and launch the SafeVision AI industrial safety monitoring platform.

---

## 1. System Requirements

- **Operating System**: Windows 10/11, macOS, or Linux (Ubuntu 20.04+)
- **Node.js**: `v18.0.0` or higher
- **Python**: `3.10` or `3.11`
- **RAM**: Minimum 8 GB (16 GB recommended for multi-camera feeds)
- **Port Availability**:
  - `5005`: Node.js Core Backend & WebSocket server
  - `5173` / `5174`: Web Command Center (Vite dev server)
  - `8000`: Python AI Inference microservice
  - `8554`: RTSP streaming gateway (MediaMTX)
  - `8888` / `8889`: HLS / WebRTC WHEP media streams

---

## 2. Step-by-Step Installation

### Step 1: Python AI Microservice Setup
```bash
# Navigate to AI microservice
cd ai

# Create Python virtual environment (if not already created)
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

# Install required CV and API dependencies
pip install -r requirements.txt
```

### Step 2: Node.js Backend Setup
```bash
# Navigate to backend directory
cd ../server

# Install dependencies
npm install

# Configure environment file
# If .env does not exist, copy from .env.example:
cp .env.example .env
```

### Step 3: Web Command Center Setup
```bash
# Navigate to frontend directory
cd ../client

# Install dependencies
npm install
```

### Step 4: React Native Mobile Field Ops Setup
```bash
# Navigate to mobile directory
cd ../mobile

# Install dependencies
npm install
```

---

## 3. Environment Variables Configuration

### Backend (`server/.env`)
```env
PORT=5005
NODE_ENV=development
JWT_SECRET=safevision-enterprise-jwt-secret-key-2026-production
AI_SERVICE_URL=http://localhost:8000
MONGODB_URI=mongodb://127.0.0.1:27017/safevision
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```
*Note: If MongoDB is offline, the backend automatically activates resilient embedded in-memory persistence.*

### Frontend (`client/.env`)
```env
VITE_API_URL=http://localhost:5005
VITE_SOCKET_URL=http://localhost:5005
```

---

## 4. Starting the Microservices

Open 3 separate terminal sessions (or run using Docker Compose):

### Terminal 1: Python AI Inference Service
```bash
cd ai
.venv\Scripts\activate
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```
*Verify*: Open `http://localhost:8000/health` in browser.

### Terminal 2: Node.js Core Backend
```bash
cd server
npm run dev
```
*Verify*: Backend announces:
`[SafeVision Server] Running on port 5005`
`[SystemHealth] Health endpoints mounted at /api/health`

### Terminal 3: Web Command Center
```bash
cd client
npm run dev
```
*Verify*: Access `http://localhost:5173`.

---

## 5. Industrial RTSP Gateway Setup (MediaMTX)

For live hardware IP cameras streaming RTSP:
1. Download MediaMTX binary matching your OS from [bluenviron/mediamtx](https://github.com/bluenviron/mediamtx/releases).
2. Place executable in project root alongside `mediamtx.yml`.
3. Launch gateway:
   ```bash
   ./mediamtx mediamtx.yml
   ```
4. Feeds are automatically transcoded to ultra-low latency WebRTC (WHEP) on port `8889` and HLS on port `8888`.

---

## 6. Corporate Seed Accounts

All accounts use standard corporate password: **`Password123!`**

| Email | Role | Authorized Scope | Primary Dashboard |
| :--- | :--- | :--- | :--- |
| `admin@safevision.ai` | `ADMIN` | All Sites & Zones (`*`) | Enterprise Systems, Users, Shifts, Rules, Audit |
| `manager@safevision.ai` | `PLANT_MANAGER` | Site `site-rsp-1` | Plant Executive, Compliance, Analytics |
| `safety@safevision.ai` | `SAFETY_OFFICER` | Site `site-rsp-1` (All Zones) | Command Center, Live Feeds, Dispatch, Incident Resolution |
| `supervisor@safevision.ai` | `SUPERVISOR` | Scoped: Furnace Bay, Assembly & Deck B | Floor Ops, Acknowledge Incidents, Team Safety |
| `employee@safevision.ai` | `EMPLOYEE` | Scoped: Own Worker ID (`0112-WK`) | Personal Safety, Hazard Reporting, Profile |
