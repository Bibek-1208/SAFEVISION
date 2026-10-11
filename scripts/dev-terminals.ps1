# ==============================================================================
# SafeVision AI — Multi-Terminal Development Runner
# Checks Docker, verifies AI dependencies, and launches development terminals
# ==============================================================================

$RootPath = Resolve-Path "$PSScriptRoot\.."
Set-Location $RootPath

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "       SafeVision AI - Spawning Development Terminals         " -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan

# 0. Check & Start Docker Services (MongoDB replica set & MediaMTX)
Write-Host "[0/3] Checking Docker status..." -ForegroundColor Cyan
$DockerRunning = $false
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        $DockerRunning = $true
    }
} catch {}

if (-not $DockerRunning) {
    Write-Host "[WARNING] Docker Desktop daemon is not responding." -ForegroundColor Yellow
    Write-Host "Attempting to start Docker Desktop..." -ForegroundColor Cyan
    
    $DockerAppPaths = @(
        "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
        "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    )
    foreach ($p in $DockerAppPaths) {
        if (Test-Path $p) {
            Start-Process -FilePath $p -WorkingDirectory (Split-Path $p) -ErrorAction SilentlyContinue
            break
        }
    }

    Write-Host "Waiting up to 15 seconds for Docker Engine to start..." -ForegroundColor Yellow
    for ($i = 1; $i -le 8; $i++) {
        Start-Sleep -Seconds 2
        try {
            $null = docker info 2>&1
            if ($LASTEXITCODE -eq 0) {
                $DockerRunning = $true
                break
            }
        } catch {}
    }
}

if ($DockerRunning) {
    Write-Host "Starting Docker background services (MongoDB & MediaMTX)..." -ForegroundColor Green
    docker compose -f "$RootPath\docker-compose.dev.yml" up -d
} else {
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor Yellow
    Write-Host " [NOTICE] Docker Desktop is currently closed or starting up." -ForegroundColor Yellow
    Write-Host " Please open 'Docker Desktop' from your Windows Start Menu." -ForegroundColor White
    Write-Host " Once Docker Desktop shows 'Engine running', start DB with:" -ForegroundColor White
    Write-Host "   make docker-up" -ForegroundColor Cyan
    Write-Host "==============================================================" -ForegroundColor Yellow
    Write-Host ""
}

# 1. Determine Python executable in venv
$VenvPy = "$RootPath\ai\.venv311\Scripts\python.exe"
$VenvPip = "$RootPath\ai\.venv311\Scripts\pip.exe"

if (-not (Test-Path $VenvPy)) {
    if (Test-Path "$RootPath\ai\.venv\Scripts\python.exe") {
        $VenvPy = "$RootPath\ai\.venv\Scripts\python.exe"
        $VenvPip = "$RootPath\ai\.venv\Scripts\pip.exe"
    } else {
        Write-Host "[INFO] Creating Python virtual environment at ai\.venv311..." -ForegroundColor Yellow
        python -m venv "$RootPath\ai\.venv311"
        $VenvPy = "$RootPath\ai\.venv311\Scripts\python.exe"
        $VenvPip = "$RootPath\ai\.venv311\Scripts\pip.exe"
    }
}

# 2. Pre-flight check: Verify FastAPI & AI dependencies
Write-Host "Verifying AI service dependencies (FastAPI, PyTorch, YOLO)..." -ForegroundColor Cyan
$TestImport = & $VenvPy -c "import fastapi, torch, ultralytics" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] FastAPI / AI packages not yet installed in virtual environment!" -ForegroundColor Yellow
    Write-Host "Installing requirements now from ai\requirements.txt (this may take a minute)..." -ForegroundColor Cyan
    & $VenvPip install -r "$RootPath\ai\requirements.txt"
    Write-Host "[OK] AI packages installed." -ForegroundColor Green
}

# 3. Terminal 1: SafeVision AI Server
Write-Host "[1/3] Launching SafeVision AI Server (port 8000)..." -ForegroundColor Green
$AiScript = @"
`$host.UI.RawUI.WindowTitle = 'SafeVision - [1] AI Service (FastAPI :8000)'
Set-Location '$RootPath\ai'
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' SafeVision AI Computer Vision Service (:8000)   ' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
& '$VenvPy' server.py
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $AiScript

Start-Sleep -Seconds 2

# 4. Terminal 2: SafeVision Backend (Express / TypeScript)
Write-Host "[2/3] Launching SafeVision Backend (port 5005)..." -ForegroundColor Green
$ServerScript = @"
`$host.UI.RawUI.WindowTitle = 'SafeVision - [2] Backend Server (:5005)'
Set-Location '$RootPath\server'
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' SafeVision Express Core & WebSockets (:5005)    ' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
npm run dev
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $ServerScript

Start-Sleep -Seconds 2

# 5. Terminal 3: SafeVision Frontend (React Vite)
Write-Host "[3/3] Launching SafeVision Frontend (port 5173)..." -ForegroundColor Green
$ClientScript = @"
`$host.UI.RawUI.WindowTitle = 'SafeVision - [3] Frontend Web Command Center (:5173)'
Set-Location '$RootPath\client'
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' SafeVision React Command Center (:5173)         ' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
npm run dev
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $ClientScript

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host " [SUCCESS] Application terminals are running!" -ForegroundColor Green
Write-Host " - AI Engine:     http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host " - Backend API:   http://localhost:5005/api" -ForegroundColor Yellow
Write-Host " - Frontend Web:  http://localhost:5173" -ForegroundColor Yellow
Write-Host "==============================================================" -ForegroundColor Cyan
