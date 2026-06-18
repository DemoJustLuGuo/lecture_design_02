$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Starting FastAPI backend at http://127.0.0.1:8000 ..."
python -m uvicorn backend.src.api.app:app --host 127.0.0.1 --port 8000
