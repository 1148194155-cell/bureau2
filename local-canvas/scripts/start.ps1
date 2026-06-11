param(
    [switch]$NoBrowser
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "============================" -ForegroundColor Cyan
Write-Host "   Local Canvas Launcher" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# Check node
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    $nodePortable = Join-Path $ProjectRoot "node_portable\node.exe"
    if (Test-Path $nodePortable) {
        $env:PATH = "$(Join-Path $ProjectRoot 'node_portable');$env:PATH"
    } else {
        Write-Host "Node.js not found. Please install Node.js >= 18." -ForegroundColor Red
        exit 1
    }
}

# Install backend deps if needed
$backendModules = Join-Path $ScriptDir "node_modules"
if (-not (Test-Path $backendModules)) {
    Write-Host "[1/3] Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location $ScriptDir
    npm install --no-fund --no-audit 2>$null
    Set-Location $ProjectRoot
    Write-Host ""
}

# Install frontend deps if needed
$rendererDir = Join-Path $ScriptDir "renderer"
$rendererModules = Join-Path $rendererDir "node_modules"
if (-not (Test-Path $rendererModules)) {
    Write-Host "[2/3] Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location $rendererDir
    npm install --no-fund --no-audit 2>$null
    Set-Location $ProjectRoot
    Write-Host ""
}

Write-Host "============================" -ForegroundColor Cyan
Write-Host "   Starting services..." -ForegroundColor Cyan
Write-Host "   Backend  : http://localhost:3001" -ForegroundColor Green
Write-Host "   Frontend : http://localhost:5173" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# Track processes for cleanup
$script:childPids = @()

# Start backend
$backendJob = Start-Job -Name "LocalCanvas-Backend" -ScriptBlock {
    param($dir)
    Set-Location $dir
    node src/index.js
} -ArgumentList $ScriptDir
$script:childPids += $backendJob.Id

# Start frontend
$frontendJob = Start-Job -Name "LocalCanvas-Frontend" -ScriptBlock {
    param($dir)
    Set-Location "$dir\renderer"
    npx vite
} -ArgumentList $ScriptDir
$script:childPids += $frontendJob.Id

Write-Host "All set! Services running in background." -ForegroundColor Green
if (-not $NoBrowser) {
    Start-Process "http://localhost:5173"
}

# Keep script alive, forward job output
try {
    while ($true) {
        $running = @($backendJob, $frontendJob) | Where-Object { $_.State -eq 'Running' }
        if ($running.Count -eq 0) {
            Write-Host "Both services have stopped. Exiting." -ForegroundColor Yellow
            break
        }
        foreach ($job in @($backendJob, $frontendJob)) {
            $msg = Receive-Job $job -ErrorAction SilentlyContinue
            if ($msg) { Write-Host $msg }
        }
        Start-Sleep -Seconds 2
    }
} finally {
    # Cleanup on exit
    @($backendJob, $frontendJob) | Where-Object { $_.State -eq 'Running' } | Stop-Job
    @($backendJob, $frontendJob) | Remove-Job -Force -ErrorAction SilentlyContinue
}
