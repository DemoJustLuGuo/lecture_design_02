$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $Root "frontend")

Write-Host "Starting Vite frontend at http://127.0.0.1:5173 ..."
npm run dev -- --host 127.0.0.1 --port 5173
