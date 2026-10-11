# ==============================================================================
# SafeVision AI — Windows PowerShell Automation Runner
# Direct native Windows alternative to 'make' for developer convenience
# ==============================================================================
param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$RootPath = $PSScriptRoot
Set-Location $RootPath

$VenvDir = "$RootPath\ai\.venv311"
$VenvPy = "$VenvDir\Scripts\python.exe"
$VenvPip = "$VenvDir\Scripts\pip.exe"
$ComposeDev = "docker compose -f docker-compose.dev.yml"
$ComposeProd = "docker compose -f docker-compose.yml"

function Show-Help {
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "               SafeVision AI - PowerShell Task Runner (run.ps1)                " -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1 <command>" -ForegroundColor White
    Write-Host ""
    Write-Host "SETUP & DEPENDENCIES (Run once after git clone):" -ForegroundColor Green
    Write-Host "  setup           Complete setup: initializes .env, installs Python & Node packages" -ForegroundColor White
    Write-Host "  env-init        Copies .env.example to .env and creates uploads folders" -ForegroundColor White
    Write-Host "  install-python  Creates ai\.venv311 and installs ai\requirements.txt (FastAPI, YOLO)" -ForegroundColor White
    Write-Host "  install-node    Runs npm install in server and client" -ForegroundColor White
    Write-Host "  check-ai        Verifies FastAPI, PyTorch, and Ultralytics packages in venv" -ForegroundColor White
    Write-Host ""
    Write-Host "DOCKER SERVICES (MongoDB rs0 & MediaMTX):" -ForegroundColor Green
    Write-Host "  up | docker-up  Starts MongoDB and MediaMTX background containers" -ForegroundColor White
    Write-Host "  down            Stops all application servers and tears down Docker containers" -ForegroundColor White
    Write-Host "  status          Shows running containers (docker compose ps)" -ForegroundColor White
    Write-Host "  logs            Shows container logs" -ForegroundColor White
    Write-Host ""
    Write-Host "RUN INDIVIDUAL SERVICES:" -ForegroundColor Green
    Write-Host "  ai              Runs FastAPI AI Service on http://localhost:8000" -ForegroundColor White
    Write-Host "  backend|server  Runs Express backend on http://localhost:5005" -ForegroundColor White
    Write-Host "  frontend|client Runs React Vite client on http://localhost:5173" -ForegroundColor White
    Write-Host "  mediamtx        Runs standalone mediamtx.exe" -ForegroundColor White
    Write-Host ""
    Write-Host "DEVELOPMENT ORCHESTRATION:" -ForegroundColor Green
    Write-Host "  dev             Starts Docker and launches all 3 terminals automatically" -ForegroundColor White
    Write-Host "  stop | stop-all Closes all application servers, frees ports, and pauses Docker" -ForegroundColor White
    Write-Host "  build           Builds backend TypeScript and frontend Vite bundle" -ForegroundColor White
    Write-Host "  clean           Removes caches and build artifacts" -ForegroundColor White
    Write-Host "================================================================================" -ForegroundColor Cyan
}

function Init-Env {
    Write-Host "Initializing environment files and upload folders..." -ForegroundColor Cyan
    if ((Test-Path "$RootPath\server\.env.example") -and (-not (Test-Path "$RootPath\server\.env"))) {
        Copy-Item "$RootPath\server\.env.example" "$RootPath\server\.env"
        Write-Host "[OK] Created server\.env from template." -ForegroundColor Green
    }
    if ((Test-Path "$RootPath\.env.example") -and (-not (Test-Path "$RootPath\.env"))) {
        Copy-Item "$RootPath\.env.example" "$RootPath\.env"
        Write-Host "[OK] Created .env from template." -ForegroundColor Green
    }
    New-Item -ItemType Directory -Path "$RootPath\server\uploads" -Force | Out-Null
    New-Item -ItemType Directory -Path "$RootPath\uploads" -Force | Out-Null
    Write-Host "[OK] Environment files and upload folders ready." -ForegroundColor Green
}

function Check-Ai {
    Write-Host "Verifying AI environment and FastAPI installation..." -ForegroundColor Cyan
    & $VenvPy -c "import fastapi, torch, ultralytics; print('[OK] FastAPI:', fastapi.__version__, '| PyTorch:', torch.__version__, '| Ultralytics:', ultralytics.__version__)"
}

function Install-Python {
    Write-Host "Creating Python virtual environment at $VenvDir..." -ForegroundColor Cyan
    python -m venv $VenvDir
    Write-Host "Upgrading pip and installing requirements from ai\requirements.txt..." -ForegroundColor Cyan
    & $VenvPip install --upgrade pip
    & $VenvPip install -r "$RootPath\ai\requirements.txt"
    Write-Host "[OK] Python dependencies installed." -ForegroundColor Green
    Check-Ai
}

function Install-Node {
    Write-Host "Installing backend npm packages..." -ForegroundColor Cyan
    npm --prefix "$RootPath\server" install
    Write-Host "Installing frontend npm packages..." -ForegroundColor Cyan
    npm --prefix "$RootPath\client" install
    Write-Host "[OK] Node dependencies installed." -ForegroundColor Green
}

switch ($Command.ToLower()) {
    "setup" {
        Init-Env
        Install-Node
        Install-Python
        Write-Host "SafeVision setup is complete! Run '.\run.ps1 dev' to start." -ForegroundColor Green
    }
    "env-init" {
        Init-Env
    }
    "check-ai" {
        Check-Ai
    }
    "install-python" {
        Install-Python
    }
    "install-node" {
        Install-Node
    }
    "up" {
        Write-Host "Starting Docker development services..." -ForegroundColor Cyan
        Invoke-Expression "$ComposeDev up -d"
        Invoke-Expression "$ComposeDev ps"
    }
    "docker-up" {
        Write-Host "Starting Docker development services..." -ForegroundColor Cyan
        Invoke-Expression "$ComposeDev up -d"
        Invoke-Expression "$ComposeDev ps"
    }
    "down" {
        & "$RootPath\scripts\stop-all.ps1" -Down
    }
    "down-all" {
        & "$RootPath\scripts\stop-all.ps1" -Down
    }
    "stop" {
        & "$RootPath\scripts\stop-all.ps1"
    }
    "stop-all" {
        & "$RootPath\scripts\stop-all.ps1"
    }
    "status" {
        Invoke-Expression "$ComposeDev ps"
    }
    "logs" {
        Invoke-Expression "$ComposeDev logs -f"
    }
    "ai" {
        Write-Host "Starting SafeVision AI Service on http://localhost:8000..." -ForegroundColor Cyan
        Set-Location "$RootPath\ai"
        & $VenvPy server.py
    }
    "backend" {
        Write-Host "Starting SafeVision Backend Server on http://localhost:5005..." -ForegroundColor Cyan
        Set-Location "$RootPath\server"
        npm run dev
    }
    "server" {
        Write-Host "Starting SafeVision Backend Server on http://localhost:5005..." -ForegroundColor Cyan
        Set-Location "$RootPath\server"
        npm run dev
    }
    "frontend" {
        Write-Host "Starting SafeVision Client on http://localhost:5173..." -ForegroundColor Cyan
        Set-Location "$RootPath\client"
        npm run dev
    }
    "client" {
        Write-Host "Starting SafeVision Client on http://localhost:5173..." -ForegroundColor Cyan
        Set-Location "$RootPath\client"
        npm run dev
    }
    "mediamtx" {
        Write-Host "Starting standalone MediaMTX streaming server..." -ForegroundColor Cyan
        Set-Location $RootPath
        .\mediamtx.exe .\mediamtx.yml
    }
    "dev" {
        Write-Host "Starting Docker background services..." -ForegroundColor Cyan
        Invoke-Expression "$ComposeDev up -d"
        & "$RootPath\scripts\dev-terminals.ps1"
    }
    "build" {
        Write-Host "Building backend TypeScript..." -ForegroundColor Cyan
        npm --prefix "$RootPath\server" run build
        Write-Host "Building frontend client..." -ForegroundColor Cyan
        npm --prefix "$RootPath\client" run build
        Write-Host "[OK] Build completed." -ForegroundColor Green
    }
    "clean" {
        Write-Host "Cleaning build dist and temporary files..." -ForegroundColor Cyan
        Remove-Item -Recurse -Force "$RootPath\server\dist" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force "$RootPath\client\dist" -ErrorAction SilentlyContinue
        Write-Host "[OK] Clean complete." -ForegroundColor Green
    }
    Default {
        Show-Help
    }
}
