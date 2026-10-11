# ==============================================================================
# SafeVision AI — Master Automation Makefile
# Industrial Safety Monitoring & Computer Vision Intelligence Platform
# ==============================================================================
# Compatible with: Windows (PowerShell / Git Bash / CMD), Linux, and macOS
# Prerequisites: Docker Desktop, Python 3.11, Node.js (v18+)
# ==============================================================================

.DEFAULT_GOAL := help
.PHONY: help setup install env-init install-python install-node \
	docker-up docker-down docker-stop docker-status docker-logs \
	run-ai run-backend run-server run-frontend run-client run-mediamtx \
	dev dev-terminals stop stop-all down down-all build clean clean-all check-prereqs check-ai

# ------------------------------------------------------------------------------
# Environment & OS Detection
# ------------------------------------------------------------------------------
ifeq ($(OS),Windows_NT)
DETECTED_OS := Windows
PYTHON ?= python
VENV_DIR := ai\.venv311
VENV_PY := $(VENV_DIR)\Scripts\python.exe
VENV_PIP := $(VENV_DIR)\Scripts\pip.exe
AI_RUN_CMD := cd ai && .venv311\Scripts\python.exe server.py
MEDIAMTX_CMD := .\mediamtx.exe .\mediamtx.yml
else
DETECTED_OS := $(shell uname -s)
PYTHON ?= python3
VENV_DIR := ai/.venv311
VENV_PY := $(VENV_DIR)/bin/python
VENV_PIP := $(VENV_DIR)/bin/pip
AI_RUN_CMD := cd ai && ./.venv311/bin/python server.py
MEDIAMTX_CMD := ./mediamtx ./mediamtx.yml
endif

COMPOSE_DEV := docker compose -f docker-compose.dev.yml
COMPOSE_PROD := docker compose -f docker-compose.yml

# ------------------------------------------------------------------------------
# Help Menu
# ------------------------------------------------------------------------------
help:
	@echo ================================================================================
	@echo                       SafeVision AI - Command Hub                               
	@echo ================================================================================
	@echo Detected OS : $(DETECTED_OS)
	@echo Python      : $(PYTHON)
	@echo Venv Path   : $(VENV_DIR)
	@echo.
	@echo FIRST-TIME SETUP (Run once after git clone):
	@echo   make setup            Complete setup: configures .env, venv, and npm packages
	@echo   make env-init         Initialize .env files from templates
	@echo   make install-python   Create Python virtual env and install AI requirements (FastAPI, YOLO)
	@echo   make install-node     Install npm dependencies for backend (server) and client
	@echo   make check-ai         Verify FastAPI and AI models in virtual environment
	@echo   make check-prereqs    Verify Docker, Python, Node, and npm availability
	@echo.
	@echo DOCKER INFRASTRUCTURE (MongoDB rs0 and MediaMTX):
	@echo   make docker-up        Start MongoDB replica set and MediaMTX background services
	@echo   make docker-down      Stop and remove local development Docker containers
	@echo   make docker-stop      Stop Docker containers without removing database volumes
	@echo   make docker-status    Show status of running Docker services
	@echo   make docker-logs      Follow logs from Docker containers
	@echo.
	@echo RUN INDIVIDUAL SERVICES:
	@echo   make run-ai           Start FastAPI AI Computer Vision service (port 8000)
	@echo   make run-backend      Start Express.js backend server (port 5005)
	@echo   make run-frontend     Start React Vite frontend client (port 5173)
	@echo   make run-mediamtx     Start standalone MediaMTX binary
	@echo.
	@echo DEVELOPMENT AND ORCHESTRATION:
	@echo   make dev              Start Docker services and launch all application terminals
	@echo   make stop             Close all application servers, free ports, and pause Docker
	@echo   make stop-all         Alias for 'make stop' (closes everything)
	@echo   make down             Close all servers and tear down Docker containers
	@echo   make build            Build backend TypeScript and frontend Vite bundle
	@echo.
	@echo CLEANUP:
	@echo   make clean            Remove build artifacts, caches, and temporary files
	@echo   make clean-all        Full reset (removes node_modules, .venv, and build dist)
	@echo ================================================================================

# ------------------------------------------------------------------------------
# Setup & Dependency Installation
# ------------------------------------------------------------------------------
check-prereqs:
	@echo Checking system prerequisites...
	@$(PYTHON) --version
	@node --version
	@npm --version
	@docker --version
	@echo [OK] Prerequisites verified.

check-ai:
	@echo Checking AI environment and FastAPI installation...
	@$(VENV_PY) -c "import fastapi, torch, ultralytics; print('[OK] FastAPI:', fastapi.__version__, '| PyTorch:', torch.__version__, '| Ultralytics:', ultralytics.__version__)"

env-init:
	@echo Initializing environment files and upload folders...
	@$(PYTHON) -c "import os, shutil; shutil.copyfile('server/.env.example', 'server/.env') if os.path.exists('server/.env.example') and not os.path.exists('server/.env') else None"
	@$(PYTHON) -c "import os, shutil; shutil.copyfile('.env.example', '.env') if os.path.exists('.env.example') and not os.path.exists('.env') else None"
	@$(PYTHON) -c "import os; os.makedirs('server/uploads', exist_ok=True); os.makedirs('uploads', exist_ok=True)"
	@echo [OK] Environment files (.env) and upload directories ready.

install-python:
	@echo Creating Python virtual environment at $(VENV_DIR)...
	@$(PYTHON) -m venv $(VENV_DIR)
	@echo Upgrading pip in virtual environment...
	@$(VENV_PIP) install --upgrade pip
	@echo Installing AI dependencies (FastAPI, PyTorch, Ultralytics YOLO) from ai/requirements.txt...
	@$(VENV_PIP) install -r ai/requirements.txt
	@echo [OK] Python AI dependencies installed successfully.

install-node:
	@echo Installing server (backend) npm packages...
	@npm --prefix server install
	@echo Installing client (frontend) npm packages...
	@npm --prefix client install
	@echo [OK] Node.js packages installed.

setup: check-prereqs env-init install-node install-python check-ai
	@echo.
	@echo ================================================================================
	@echo                  SafeVision AI Setup Completed Successfully!                    
	@echo ================================================================================
	@echo To run the application:
	@echo   1. Start Docker services (MongoDB and MediaMTX): make docker-up
	@echo   2. Start AI service:                            make run-ai
	@echo   3. Start Backend:                               make run-backend
	@echo   4. Start Frontend:                              make run-frontend
	@echo   Or start everything at once:                    make dev
	@echo.
	@echo To stop everything:                              make stop-all
	@echo ================================================================================

# ------------------------------------------------------------------------------
# Docker Infrastructure
# ------------------------------------------------------------------------------
docker-up:
	@echo Starting development Docker services...
ifeq ($(DETECTED_OS),Windows)
	@powershell -ExecutionPolicy Bypass -Command "docker info >$$null 2>&1; if ($$LASTEXITCODE -ne 0) { Write-Host '==============================================================' -ForegroundColor Red; Write-Host ' [ERROR] Docker Desktop is not running!' -ForegroundColor Red; Write-Host ' Please launch Docker Desktop from your Windows Start Menu.' -ForegroundColor Yellow; Write-Host ' Once Docker is running, re-run: make docker-up' -ForegroundColor Cyan; Write-Host '==============================================================' -ForegroundColor Red; exit 1 }; docker compose -f docker-compose.dev.yml up -d; docker compose -f docker-compose.dev.yml ps"
else
	@docker info >/dev/null 2>&1 || (echo "[ERROR] Docker is not running. Please start the Docker daemon." && exit 1)
	@$(COMPOSE_DEV) up -d
	@$(COMPOSE_DEV) ps
endif

docker-down:
	@echo Stopping Docker development containers...
	$(COMPOSE_DEV) down
	@echo [OK] Containers stopped.

docker-stop:
	@echo Pausing Docker containers (preserving database volume)...
	$(COMPOSE_DEV) stop
	@echo [OK] Containers paused.

docker-status:
	$(COMPOSE_DEV) ps

docker-logs:
	$(COMPOSE_DEV) logs -f

# ------------------------------------------------------------------------------
# Service Execution
# ------------------------------------------------------------------------------
run-ai:
	@echo Starting SafeVision AI Inference Server on http://localhost:8000...
	@$(AI_RUN_CMD)

run-backend:
	@echo Starting SafeVision Backend Server on http://localhost:5005...
	@cd server && npm run dev

run-server: run-backend

run-frontend:
	@echo Starting SafeVision Client on http://localhost:5173...
	@cd client && npm run dev

run-client: run-frontend

run-mediamtx:
	@echo Starting standalone MediaMTX RTSP streaming server...
	@$(MEDIAMTX_CMD)

# ------------------------------------------------------------------------------
# Dev Orchestration
# ------------------------------------------------------------------------------
dev:
ifeq ($(DETECTED_OS),Windows)
	@powershell -ExecutionPolicy Bypass -File ./scripts/dev-terminals.ps1
else
	@$(COMPOSE_DEV) up -d || (echo "[WARNING] Docker services could not start. Please verify Docker daemon is running." && true)
	@echo Docker services running. In separate terminals, run:
	@echo   Terminal 1: make run-ai
	@echo   Terminal 2: make run-backend
	@echo   Terminal 3: make run-frontend
endif

# ------------------------------------------------------------------------------
# Stop All Services & Release Ports
# ------------------------------------------------------------------------------
stop:
ifeq ($(DETECTED_OS),Windows)
	@powershell -ExecutionPolicy Bypass -File ./scripts/stop-all.ps1
else
	@echo Stopping SafeVision application processes...
	@-lsof -ti:8000,5005,5173,8554 | xargs kill -9 2>/dev/null || true
	@$(COMPOSE_DEV) stop
	@echo [OK] All SafeVision servers and containers stopped.
endif

stop-all: stop

down:
ifeq ($(DETECTED_OS),Windows)
	@powershell -ExecutionPolicy Bypass -File ./scripts/stop-all.ps1 -Down
else
	@echo Stopping SafeVision application processes and tearing down Docker...
	@-lsof -ti:8000,5005,5173,8554 | xargs kill -9 2>/dev/null || true
	@$(COMPOSE_DEV) down
	@echo [OK] All SafeVision servers and containers removed.
endif

down-all: down

# ------------------------------------------------------------------------------
# Build & Production
# ------------------------------------------------------------------------------
build:
	@echo Building backend TypeScript...
	@cd server && npm run build
	@echo Building client React Vite bundle...
	@cd client && npm run build
	@echo [OK] Production builds completed.

docker-prod-up:
	@echo Launching full production Docker Compose stack...
	$(COMPOSE_PROD) up --build -d
	$(COMPOSE_PROD) ps

docker-prod-down:
	@echo Stopping production Docker Compose stack...
	$(COMPOSE_PROD) down

# ------------------------------------------------------------------------------
# Clean
# ------------------------------------------------------------------------------
clean:
	@echo Cleaning temporary files and build artifacts...
	@$(PYTHON) -c "import shutil, os, glob; [shutil.rmtree(p, ignore_errors=True) for p in ['server/dist', 'client/dist', 'server/uploads/*.tmp']]"
	@$(PYTHON) -c "import shutil, os, pathlib; [shutil.rmtree(p, ignore_errors=True) for p in pathlib.Path('.').rglob('__pycache__')]"
	@echo [OK] Clean complete.

clean-all: clean
	@echo Removing node_modules and virtual environments...
	@$(PYTHON) -c "import shutil; shutil.rmtree('server/node_modules', ignore_errors=True); shutil.rmtree('client/node_modules', ignore_errors=True); shutil.rmtree('$(VENV_DIR)', ignore_errors=True)"
	@echo [OK] Full reset complete.
