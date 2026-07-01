[CmdletBinding()]
param(
  [string]$ProjectRoot = "",
  [string]$OutputDir = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Copy-RequiredFile {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (-not (Test-Path $Source)) {
    throw "Required file not found: $Source"
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Copy-OptionalDirectory {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (Test-Path $Source) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
  }
}

function Assert-UnderPath {
  param(
    [string]$Path,
    [string]$ParentPath
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd("\", "/")
  $fullParent = [System.IO.Path]::GetFullPath($ParentPath).TrimEnd("\", "/")
  if (-not $fullPath.Equals($fullParent, [System.StringComparison]::OrdinalIgnoreCase) -and
      -not $fullPath.StartsWith("$fullParent\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside expected directory. Path: $fullPath Parent: $fullParent"
  }
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $ProjectRoot "release"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path
Assert-UnderPath -Path $OutputDir -ParentPath $ProjectRoot

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
  throw "npm is not installed or not in PATH."
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  $node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $node) {
  throw "node is not installed or not in PATH."
}

Set-Location $ProjectRoot

if (-not $SkipBuild) {
  Write-Host "Building frontend..."
  & $npm.Source run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed."
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageName = "MHChub-home-install-$stamp"
$stageDir = Join-Path $OutputDir $packageName
$zipPath = Join-Path $OutputDir "$packageName.zip"
Assert-UnderPath -Path $stageDir -ParentPath $OutputDir
Assert-UnderPath -Path $zipPath -ParentPath $OutputDir

if (Test-Path $stageDir) {
  Assert-UnderPath -Path $stageDir -ParentPath $OutputDir
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Write-Host "Staging package: $stageDir"

foreach ($file in @(
  "package.json",
  "package-lock.json",
  "index.html",
  "vite.config.ts",
  "README.md",
  ".env.example",
  "startup.bat",
  "start_all.bat",
  "stop-all.bat",
  "cloudflare\README.md"
)) {
  Copy-RequiredFile (Join-Path $ProjectRoot $file) (Join-Path $stageDir $file)
}

foreach ($dir in @(
  "src",
  "shared",
  "public",
  "database",
  "docs",
  "dist",
  "setup\home-install"
)) {
  Copy-OptionalDirectory (Join-Path $ProjectRoot $dir) (Join-Path $stageDir $dir)
}

$stagedDist = Join-Path $stageDir "dist"
if (Test-Path $stagedDist) {
  Write-Host "Pruning stale dist assets from package stage..."
  $stageDistAuditReport = Join-Path $OutputDir "$packageName-dist-asset-audit.json"
  & $node.Source "scripts/audit-dist-assets.mjs" "--dist" $stagedDist "--apply" "--quiet" "--strict-stale" "--report" $stageDistAuditReport
  if ($LASTEXITCODE -ne 0) {
    throw "dist asset pruning failed for package stage."
  }
}

New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "server") | Out-Null
Copy-RequiredFile (Join-Path $ProjectRoot "server\index.js") (Join-Path $stageDir "server\index.js")
Copy-RequiredFile (Join-Path $ProjectRoot "server\loadEnv.js") (Join-Path $stageDir "server\loadEnv.js")
Copy-OptionalDirectory (Join-Path $ProjectRoot "server\auth") (Join-Path $stageDir "server\auth")
Copy-OptionalDirectory (Join-Path $ProjectRoot "server\core") (Join-Path $stageDir "server\core")

New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "server\data") | Out-Null
Copy-RequiredFile (Join-Path $ProjectRoot "server\data\config.json") (Join-Path $stageDir "server\data\config.json")
Copy-RequiredFile (Join-Path $ProjectRoot "server\data\documents.json") (Join-Path $stageDir "server\data\documents.json")
Set-Content -LiteralPath (Join-Path $stageDir "server\data\activity.json") -Value "[]" -Encoding UTF8
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "server\data\auth") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "server\data\backups") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "server\uploads") | Out-Null

Copy-OptionalDirectory (Join-Path $ProjectRoot "scripts") (Join-Path $stageDir "scripts")
foreach ($unsafe in @(
  ".env",
  ".env.local",
  "node_modules",
  "release",
  "backups",
  "qa",
  "test-results",
  "server\data\auth\users.json",
  "server\data\auth\auth_audit_log.json",
  "server\data\auth\auth_login_attempts.json",
  "server\data\backups"
)) {
  $target = Join-Path $stageDir $unsafe
  if (Test-Path $target) {
    Assert-UnderPath -Path $target -ParentPath $stageDir
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

$manifest = [ordered]@{
  name = $packageName
  createdAt = (Get-Date).ToString("o")
  sourceProject = $ProjectRoot
  runAfterUnzip = ".\setup\home-install\install-home-windows.ps1"
  excluded = @(
    ".env",
    ".env.local",
    "node_modules",
    "server/data/auth runtime files",
    "server/data/backups",
    "server/uploads content",
    "logs",
    "qa",
    "test-results"
  )
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $stageDir "release-manifest.json") -Encoding UTF8

if (Test-Path $zipPath) {
  Assert-UnderPath -Path $zipPath -ParentPath $OutputDir
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -LiteralPath $stageDir -DestinationPath $zipPath -Force

$sizeMb = [Math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
Write-Host "Package created: $zipPath"
Write-Host "Size: $sizeMb MB"
