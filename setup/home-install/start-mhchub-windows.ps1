[CmdletBinding()]
param(
  [switch]$OpenBrowser
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
Set-Location $root

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
  throw "npm is not installed or not in PATH."
}

if (-not (Test-Path (Join-Path $root ".env"))) {
  throw ".env not found. Run .\setup\home-install\install-home-windows.ps1 first."
}
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  throw "node_modules not found. Run .\setup\home-install\install-home-windows.ps1 first."
}
if (-not (Test-Path (Join-Path $root "dist\index.html"))) {
  throw "dist build not found. Run .\setup\home-install\install-home-windows.ps1 first."
}

$port = Read-EnvPort (Join-Path $root ".env")
$url = "http://localhost:$port"

Write-Host "Starting MHChub..."
Write-Host "URL: $url"
Write-Host "Press Ctrl+C to stop."

if ($OpenBrowser) {
  Start-Process $url
}

& $npm.Source start
