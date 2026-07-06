# Stop FX panel (api/server) + orphan workers + worker.lock
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root '.env'
$port = 8788

if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*FX_API_PORT\s*=\s*(\d+)') {
      $port = [int]$Matches[1]
    }
  }
}

function Get-ListenerPids($listenPort) {
  $pids = @()
  $conns = Get-NetTCPConnection -LocalPort $listenPort -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $pids += $conns | Select-Object -ExpandProperty OwningProcess -Unique
  }
  $lines = netstat -ano | Select-String ":$listenPort\s" | Select-String 'LISTENING'
  foreach ($line in $lines) {
    if ($line -match '\s(\d+)\s*$') { $pids += [int]$Matches[1] }
  }
  return $pids | Where-Object { $_ -gt 0 } | Select-Object -Unique
}

function Stop-Pid($procId, $label) {
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if (-not $p) { return $false }
  Write-Host "Stopping $label PID $procId ($($p.ProcessName))"
  try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
    return $true
  } catch {
    & taskkill /F /PID $procId 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
  }
}

function Stop-FxWorkers {
  $stopped = 0
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = $_.CommandLine
    if ($null -eq $cmd) { return }
    if ($cmd -match 'worker[\\/]index\.js') {
      if (Stop-Pid $_.ProcessId 'fx-worker') { $script:stopped++ }
      return
    }
    if ($cmd -match 'fx-scalp-agent' -and $cmd -match 'worker') {
      if (Stop-Pid $_.ProcessId 'fx-worker') { $script:stopped++ }
    }
  }
  # npm start in project root keeps orphan worker alive
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = $_.CommandLine
    if ($null -eq $cmd) { return }
    if ($cmd -match 'npm-cli\.js" start' -or $cmd -match 'npm\.cmd start') {
      if (Stop-Pid $_.ProcessId 'npm-start') { $script:stopped++ }
    }
  }
  return $stopped
}

Write-Host "FX panel stop (port $port)..."

$panelStopped = 0
foreach ($procId in (Get-ListenerPids $port)) {
  if (Stop-Pid $procId "panel") { $panelStopped++ }
}

$workersStopped = Stop-FxWorkers

$lock = Join-Path $root 'data\worker.lock'
if (Test-Path $lock) {
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
  Write-Host 'Removed worker.lock'
}

Start-Sleep -Milliseconds 400
$still = Get-ListenerPids $port
if ($still) {
  Write-Host ""
  Write-Host "Port $port still in use (PIDs: $($still -join ', '))."
  Write-Host "Close Cursor or run PowerShell as Admin: taskkill /F /PID $($still[0])"
  exit 1
}

Write-Host "Done. Panel stopped: $panelStopped, workers stopped: $workersStopped"
Write-Host "Run: npm run panel"
