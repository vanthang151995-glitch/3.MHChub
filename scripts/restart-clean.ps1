[CmdletBinding()]
param(
  [string]$ServiceName = "MHChub",
  [string]$HostName = "127.0.0.1",
  [string]$Port = "",
  [switch]$PreviewOnly,
  [switch]$SkipPreview,
  [switch]$SkipBuild,
  [switch]$SkipReady,
  [switch]$StrictReady,
  [switch]$CheckExcelPreview,
  [string]$ExcelDocumentId = "doc-hop-at-t05-2026-v2"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
$VerifyPortsScript = Join-Path $root "scripts\verify-critical-ports.ps1"
$KillTreeScript = "not-used-service-managed-restart"

if ($PreviewOnly) {
  Write-Host "Preview restart only. No service will be restarted."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $VerifyPortsScript -Json
  if ($LASTEXITCODE -ne 0) {
    throw "Port preview failed with exit code $LASTEXITCODE"
  }

  $previewArgs = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Join-Path $root "scripts\startup-guard.ps1"),
    "-ServiceName",
    $ServiceName,
    "-HostName",
    $HostName,
    "-CheckOnly",
    "-SkipHealth"
  )
  if (-not [string]::IsNullOrWhiteSpace($Port)) {
    $previewArgs += @("-Port", $Port)
  }

  & powershell.exe @previewArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Startup preview failed with exit code $LASTEXITCODE"
  }
  exit 0
}

if (-not $SkipPreview) {
  Write-Host "Pre-restart port observation..."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $VerifyPortsScript -Json
  if ($LASTEXITCODE -ne 0) {
    throw "Port preview failed with exit code $LASTEXITCODE"
  }
}

$args = @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  (Join-Path $root "scripts\restart-mhchub-service.ps1"),
  "-ServiceName",
  $ServiceName,
  "-HostName",
  $HostName
)

if (-not [string]::IsNullOrWhiteSpace($Port)) {
  $args += @("-Port", $Port)
}
if ($SkipBuild) {
  $args += "-SkipBuild"
}
if ($SkipReady) {
  $args += "-SkipReady"
}
if ($StrictReady) {
  $args += "-StrictReady"
}
if ($CheckExcelPreview) {
  $args += @("-CheckExcelPreview", "-ExcelDocumentId", $ExcelDocumentId)
}

& powershell.exe @args
if ($LASTEXITCODE -ne 0) {
  throw "Clean restart failed with exit code $LASTEXITCODE"
}
