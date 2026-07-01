[CmdletBinding()]
param(
  [switch]$IncludeDb,
  [switch]$SkipBuild,
  [string]$ProjectRoot = "",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot ".")).Path
} else {
  $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $ProjectRoot "release"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$exportScript = Join-Path $ProjectRoot "scripts\export_mysql_local.ps1"
$exportNodeScript = Join-Path $ProjectRoot "scripts\export-mysql-database.mjs"
$packageScript = Join-Path $ProjectRoot "scripts\package-home-install.ps1"

if (-not (Test-Path $packageScript)) {
  throw "Required packaging script not found: $packageScript"
}

if ($IncludeDb) {
  if (-not (Test-Path $exportNodeScript)) {
    throw "Required database export script not found: $exportNodeScript"
  }

  Write-Host "Exporting MySQL database before packaging..."
  & node.exe $exportNodeScript
  if ($LASTEXITCODE -ne 0) {
    throw "MySQL export failed."
  }
}

Write-Host "Building package with scripts\package-home-install.ps1..."
$psArgs = @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $packageScript,
  "-ProjectRoot",
  $ProjectRoot,
  "-OutputDir",
  $OutputDir
)
if ($SkipBuild) {
  $psArgs += "-SkipBuild"
}
& powershell.exe @psArgs
if ($LASTEXITCODE -ne 0) {
  throw "Package build failed."
}
