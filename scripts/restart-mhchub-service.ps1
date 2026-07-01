[CmdletBinding()]
param(
  [string]$ServiceName = "MHChub",
  [string]$HostName = "127.0.0.1",
  [string]$Port = "",
  [switch]$SkipBuild,
  [switch]$SkipRestart,
  [switch]$SkipReady,
  [switch]$StrictReady,
  [switch]$CheckExcelPreview,
  [string]$ExcelDocumentId = "doc-hop-at-t05-2026-v2"
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

function Invoke-HttpCheck {
  param(
    [string]$Url,
    [string]$ExpectedContentType = ""
  )

  $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 20
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "$Url returned HTTP $($response.StatusCode)"
  }

  if (-not [string]::IsNullOrWhiteSpace($ExpectedContentType)) {
    $contentType = [string]$response.Headers["Content-Type"]
    if (-not $contentType.StartsWith($ExpectedContentType, [StringComparison]::OrdinalIgnoreCase)) {
      throw "$Url returned Content-Type '$contentType', expected '$ExpectedContentType'"
    }
  }

  return $response
}

function Restart-ServiceWithAdminFallback {
  param([string]$Name)

  try {
    Restart-Service -Name $Name -Force -ErrorAction Stop
    return
  } catch {
    Write-Host "Direct restart failed, requesting Administrator restart: $($_.Exception.Message)"
  }

  $logDir = Join-Path $root "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $adminLog = Join-Path $logDir "mhchub-admin-restart.log"
  $adminCommand = @"
`$ErrorActionPreference = 'Stop'
Restart-Service -Name '$Name' -Force
Start-Sleep -Seconds 5
Get-Service -Name '$Name' | Select-Object Name,Status,StartType | Format-List | Out-File -FilePath '$adminLog' -Encoding utf8
"@

  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $adminCommand) `
    -Verb RunAs `
    -Wait `
    -PassThru

  if ($process.ExitCode -ne 0) {
    throw "Administrator restart failed with exit code $($process.ExitCode)"
  }
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ""
  while ((Get-Date) -lt $deadline) {
    try {
      return Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 5
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Seconds 2
    }
  }
  throw "Timed out waiting for $Url. Last error: $lastError"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if ([string]::IsNullOrWhiteSpace($Port)) {
  $Port = Read-EnvValue -EnvPath (Join-Path $root ".env") -Name "PORT" -Fallback "3333"
}

$baseUrl = "http://$HostName`:$Port"
Write-Host "MHChub root: $root"
Write-Host "Target URL: $baseUrl"

if (-not $SkipBuild) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
  }
  if (-not $npm) {
    throw "npm is not available in PATH."
  }

  Write-Host "Building production assets..."
  & $npm.Source run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE"
  }
}

if (-not $SkipRestart) {
  Write-Host "Restarting service '$ServiceName'..."
  Restart-ServiceWithAdminFallback -Name $ServiceName
  Start-Sleep -Seconds 5
}

$service = Get-Service -Name $ServiceName -ErrorAction Stop
if ($service.Status -ne "Running") {
  throw "Service '$ServiceName' is $($service.Status), expected Running."
}
Write-Host "Service OK: $($service.Name) $($service.Status)"

$listener = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  throw "No listener found on port $Port."
}
Write-Host "Port OK: $Port owned by PID $($listener.OwningProcess)"

$healthScript = Join-Path $root "scripts\utils\health-check.ps1"
$healthArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $healthScript, "-BaseUrl", $baseUrl)
if ($SkipReady) {
  $healthArgs += "-SkipReady"
}
if ($StrictReady) {
  $healthArgs += "-StrictReady"
}
if ($CheckExcelPreview) {
  $healthArgs += @("-CheckExcelPreview", "-ExcelDocumentId", $ExcelDocumentId)
}

Write-Host "Running reusable health check..."
& powershell.exe @healthArgs
if ($LASTEXITCODE -ne 0) {
  throw "Health check failed with exit code $LASTEXITCODE"
}

Write-Host "MHChub deploy/restart check passed."
