# Portable package for 1C server (no pkg, no patch).
# Output: dist-portable\ — copy to server, run Start-Agent.bat
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dist = Join-Path $root 'dist-portable'
$nodeVer = '20.18.1'
$nodeZip = "node-v$nodeVer-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$nodeVer/$nodeZip"

Write-Host '=== DTS 1C Agent (portable) ===' -ForegroundColor Cyan
Write-Host "Output: $dist"

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dist 'app') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dist 'node') | Out-Null

Push-Location $root
try {
  Write-Host 'npm install (production)...'
  npm install --omit=dev 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

  $appDest = Join-Path $dist 'app'
  Copy-Item -Path (Join-Path $root 'src') -Destination (Join-Path $appDest 'src') -Recurse
  Copy-Item -Path (Join-Path $root 'package.json') -Destination $appDest
  Copy-Item -Path (Join-Path $root 'node_modules') -Destination (Join-Path $appDest 'node_modules') -Recurse

  $scriptsSrc = Join-Path $root 'scripts'
  if (Test-Path $scriptsSrc) {
    Copy-Item -Path $scriptsSrc -Destination (Join-Path $dist 'scripts') -Recurse
  }

  $example = Join-Path $root 'config.example.json'
  if (Test-Path $example) {
    Copy-Item $example (Join-Path $dist 'config.example.json')
    Copy-Item $example (Join-Path $dist 'config.json')
  }

  $zipPath = Join-Path $env:TEMP $nodeZip
  if (-not (Test-Path $zipPath)) {
    Write-Host "Downloading Node.js $nodeVer..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $zipPath -UseBasicParsing
  }
  Expand-Archive -Path $zipPath -DestinationPath (Join-Path $dist '_nodezip') -Force
  $inner = Get-ChildItem (Join-Path $dist '_nodezip') -Directory | Select-Object -First 1
  Copy-Item (Join-Path $inner.FullName 'node.exe') (Join-Path $dist 'node\node.exe')
  Remove-Item (Join-Path $dist '_nodezip') -Recurse -Force
}
finally {
  Pop-Location
}

$startBat = @"
@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DTS 1C Agent
if not exist config.json (
  echo Missing config.json - copy from config.example.json
  pause
  exit /b 1
)
echo Starting agent...
node\node.exe app\src\index.js
if errorlevel 1 pause
"@
Set-Content -Path (Join-Path $dist 'Start-Agent.bat') -Value $startBat -Encoding ASCII

$testBat = @"
@echo off
chcp 65001 >nul
cd /d "%~dp0"
node\node.exe app\src\index.js --once
pause
"@
Set-Content -Path (Join-Path $dist 'Test-Once.bat') -Value $testBat -Encoding ASCII

$readme = @"
DTS 1C Agent (portable)
=======================
Copy this ENTIRE folder to the 1C server (e.g. Desktop\onec-agent).
Node.js is included in node\ - do NOT install Node on the server.

1. Edit config.json (bugai1c password, agentToken, save.dir)
2. Run Start-Agent.bat
3. Test: Test-Once.bat

Autostart: shortcut to Start-Agent.bat in shell:startup
"@
Set-Content -Path (Join-Path $dist 'README.txt') -Value $readme -Encoding UTF8

Write-Host ''
Write-Host 'Done:' $dist -ForegroundColor Green
Get-ChildItem $dist | Format-Table Name, Length
