$ErrorActionPreference = "Stop"

function Test-Endpoint {
  param(
    [string] $Name,
    [string] $Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5
    Write-Host "OK   $Name $($response.StatusCode) $Url"
  } catch {
    Write-Host "FAIL $Name $Url"
    Write-Host "     $($_.Exception.Message)"
  }
}

Test-Endpoint -Name "Backend" -Url "http://127.0.0.1:8000/api/dashboard/summary"
Test-Endpoint -Name "Frontend proxy" -Url "http://127.0.0.1:5173/api/dashboard/summary"
