[CmdletBinding()]
param(
  [string]$Port = ""
)

$ErrorActionPreference = "Stop"

function Read-EnvPort {
  param([string]$EnvPath)

  if (-not (Test-Path $EnvPath)) {
    return "3333"
  }

  foreach ($line in Get-Content -LiteralPath $EnvPath) {
    if ($line -match "^\s*PORT\s*=\s*(.+)\s*$") {
      return $matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return "3333"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($Port)) {
  $Port = Read-EnvPort (Join-Path $root ".env")
}

$baseUrl = "http://localhost:$Port"
Write-Host "Checking $baseUrl"

$health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method Get -TimeoutSec 5
Write-Host "Health OK: $($health.service)"

try {
  $ready = Invoke-RestMethod -Uri "$baseUrl/api/ready" -Method Get -TimeoutSec 5
  Write-Host "Ready: $($ready.ready)"
  foreach ($check in $ready.checks) {
    Write-Host " - $($check.label): $($check.ok)"
  }
} catch {
  Write-Host "Ready endpoint returned warning/error:"
  Write-Host $_.Exception.Message
  throw
}
