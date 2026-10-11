# ==============================================================================
# SafeVision AI — Stop All Services & Containers
# Gracefully terminates all background servers, frees ports, closes terminals,
# and pauses Docker containers.
# ==============================================================================
param(
    [switch]$Down = $false
)

$RootPath = Resolve-Path "$PSScriptRoot\.."
Set-Location $RootPath

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "         SafeVision AI - Stopping All Services                " -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan

# 1. Close application terminal windows titled "SafeVision*"
Write-Host "[1/4] Closing SafeVision terminal windows..." -ForegroundColor Yellow
$Terminals = Get-Process powershell, pwsh, cmd -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "SafeVision*"
}
foreach ($t in $Terminals) {
    try {
        Stop-Process -Id $t.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  - Closed terminal: $($t.MainWindowTitle)" -ForegroundColor Gray
    } catch {}
}

# 2. Terminate processes listening on SafeVision ports (8000, 5005, 5173, 8554)
Write-Host "[2/4] Releasing application network ports..." -ForegroundColor Yellow
$Ports = @(8000, 5005, 5173, 8554)
foreach ($Port in $Ports) {
    try {
        $Conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $Conns) {
            $pId = $c.OwningProcess
            if ($pId -and $pId -ne 0) {
                $pName = (Get-Process -Id $pId -ErrorAction SilentlyContinue).ProcessName
                Stop-Process -Id $pId -Force -ErrorAction SilentlyContinue
                Write-Host "  - Freed port $Port (stopped process $pName, PID $pId)" -ForegroundColor Gray
            }
        }
    } catch {}
}

# Fallback netstat check to ensure no stray node or python processes hold ports
$NetstatLines = netstat -ano | Select-String ":8000\s|:5005\s|:5173\s|:8554\s"
foreach ($line in $NetstatLines) {
    if ($line.Line -match "LISTENING\s+(\d+)") {
        $strayPid = [int]$matches[1]
        if ($strayPid -gt 0 -and $strayPid -ne $PID) {
            Stop-Process -Id $strayPid -Force -ErrorAction SilentlyContinue
        }
    }
}

# 3. Stop standalone MediaMTX if running as process
Write-Host "[3/4] Checking standalone MediaMTX process..." -ForegroundColor Yellow
Get-Process -Name "mediamtx" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 4. Stop or Down Docker containers
$ComposeFile = "$RootPath\docker-compose.dev.yml"
if (Test-Path $ComposeFile) {
    $DockerActive = $false
    try {
        $null = docker info 2>&1
        if ($LASTEXITCODE -eq 0) { $DockerActive = $true }
    } catch {}

    if ($DockerActive) {
        if ($Down) {
            Write-Host "[4/4] Removing Docker development containers (docker compose down)..." -ForegroundColor Yellow
            docker compose -f $ComposeFile down
        } else {
            Write-Host "[4/4] Stopping Docker containers (preserving database data)..." -ForegroundColor Yellow
            docker compose -f $ComposeFile stop
        }
    } else {
        Write-Host "[4/4] Docker engine is not running (containers already offline)." -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host " [SUCCESS] All SafeVision servers and containers are stopped! " -ForegroundColor Green
Write-Host " - Port 8000 (AI Service)  : FREED" -ForegroundColor Gray
Write-Host " - Port 5005 (Backend API) : FREED" -ForegroundColor Gray
Write-Host " - Port 5173 (Frontend Web): FREED" -ForegroundColor Gray
Write-Host " - Docker Containers       : STOPPED" -ForegroundColor Gray
Write-Host "==============================================================" -ForegroundColor Green
