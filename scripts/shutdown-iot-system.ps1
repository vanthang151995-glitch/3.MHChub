[CmdletBinding()]
param(
  [string]$ServiceName = "MHChub",
  [string]$Port = "",
  [switch]$ConfirmStop,
  [switch]$PreviewOnly
)

$ErrorActionPreference = "Stop"

function Read-EnvValue {
  param(
    [string]$EnvPath,
    [string]$Name,
    [string]$Fallback
  )

  if (-not (Test-Path -LiteralPath $EnvPath)) {
    return $Fallback
  }

  foreach ($line in Get-Content -LiteralPath $EnvPath) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.+)\s*$") {
      return $matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $Fallback
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($Port)) {
  $Port = Read-EnvValue -EnvPath (Join-Path $root ".env") -Name "PORT" -Fallback "3333"
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$listener = $null
if ($Port -match "^\d+$") {
  $listener = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

Write-Host "MHChub shutdown check"
Write-Host "Service: $ServiceName $($service.Status)"
if ($listener) {
  Write-Host "Port: $Port PID $($listener.OwningProcess)"
} else {
  Write-Host "Port: $Port not listening"
}

if ($PreviewOnly -or -not $ConfirmStop) {
  Write-Host "Preview only. Re-run with -ConfirmStop to stop the service."
  exit 0
}

if (-not $service) {
  throw "Service '$ServiceName' was not found."
}

if ($service.Status -ne "Stopped") {
  Write-Host "Stopping service '$ServiceName'..."
  Stop-Service -Name $ServiceName -ErrorAction Stop
}

Start-Sleep -Seconds 2
$service = Get-Service -Name $ServiceName -ErrorAction Stop
if ($service.Status -ne "Stopped") {
  throw "Service '$ServiceName' is $($service.Status), expected Stopped."
}

Write-Host "Service stopped."

