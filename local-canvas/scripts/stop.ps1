param(
    [switch]$Force
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "Stopping Local Canvas services..." -ForegroundColor Yellow

# Kill node processes started from our project directories
$targetDirs = @($ScriptDir, (Join-Path $ScriptDir "renderer"))
$killed = 0

Get-Process "node" -ErrorAction SilentlyContinue | ForEach-Object {
    $proc = $_
    try {
        $procDir = $(Get-Item $proc.Path -ErrorAction SilentlyContinue).DirectoryName
        # Check if the process is running from our project
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($proc.Id)" 2>$null).CommandLine
        foreach ($dir in $targetDirs) {
            if ($cmdLine -and $cmdLine -like "*$dir*") {
                if ($Force) {
                    $proc.Kill()
                    Write-Host "  Killed node process $($proc.Id) (from $dir)" -ForegroundColor Red
                } else {
                    $proc.CloseMainWindow() | Out-Null
                    Write-Host "  Closing node process $($proc.Id) (from $dir)" -ForegroundColor Yellow
                }
                $killed++
                break
            }
        }
    } catch {
        # process may have exited already
    }
}

# Also kill any jobs named LocalCanvas-*
Get-Job -Name "LocalCanvas-*" -ErrorAction SilentlyContinue | Stop-Job -PassThru | Remove-Job -Force

Write-Host ""
if ($killed -gt 0) {
    Write-Host "Stopped $killed service(s)." -ForegroundColor Green
} else {
    Write-Host "No running Local Canvas services found." -ForegroundColor Cyan
}
