[CmdletBinding()]
param(
  [string]$ServiceName = "MHChub",
  [string]$HostName = "127.0.0.1",
  [string]$Port = "",
  [int]$TimeoutSeconds = 60,
  [switch]$CheckOnly,
  [switch]$AllowProcessFallback,
  [switch]$SkipHealth,
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

function Wait-ForListener {
  param(
    [int]$LocalPort,
    [int]$TimeoutSec
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $listener = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      return $listener
    }
    Start-Sleep -Seconds 1
  }
  return $null
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if ([string]::IsNullOrWhiteSpace($Port)) {
  $Port = Read-EnvValue -EnvPath (Join-Path $root ".env") -Name "PORT" -Fallback "3333"
}
if ($Port -notmatch "^\d+$") {
  throw "PORT must be numeric. Current value was not readable as a port."
}

$baseUrl = "http://$HostName`:$Port"
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host "MHChub startup guard"
Write-Host "Root: $root"
Write-Host "Target: $baseUrl"
Write-Host "CheckOnly: $CheckOnly"

$existingListener = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
  Write-Host "Port already listening: $Port PID $($existingListener.OwningProcess)"
} else {
  $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

  if ($service) {
    Write-Host "Service found: $ServiceName $($service.Status)"
    if ($service.Status -ne "Running") {
      if ($CheckOnly) {
        Write-Host "Would start service '$ServiceName'."
      } else {
        Write-Host "Starting service '$ServiceName'..."
        Start-Service -Name $ServiceName
      }
    }
  } elseif ($AllowProcessFallback) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
      throw "Node.js was not found in PATH, and service '$ServiceName' is not installed."
    }

    if ($CheckOnly) {
      Write-Host "Would start fallback Node process with: $($node.Source) server/index.js"
    } else {
      Write-Host "Service '$ServiceName' not found. Starting fallback Node process..."
      Start-Process -FilePath $node.Source `
        -ArgumentList "server/index.js" `
        -WorkingDirectory $root `
        -RedirectStandardOutput (Join-Path $logDir "mhchub-fallback.out.log") `
        -RedirectStandardError (Join-Path $logDir "mhchub-fallback.err.log") `
        -WindowStyle Hidden | Out-Null
    }
  } else {
    throw "No listener on port $Port and service '$ServiceName' was not found. Install service with setup\home-install\install-mhchub-service-windows.ps1, or run this script with -AllowProcessFallback."
  }
}

if (-not $CheckOnly) {
  $listener = Wait-ForListener -LocalPort ([int]$Port) -TimeoutSec $TimeoutSeconds
  if (-not $listener) {
    throw "Port $Port did not start listening within $TimeoutSeconds seconds."
  }
  Write-Host "Port OK: $Port PID $($listener.OwningProcess)"
}

if (-not $SkipHealth -and (-not $CheckOnly -or $existingListener)) {
  $healthScript = Join-Path $root "scripts\utils\health-check.ps1"
  $healthArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $healthScript, "-BaseUrl", $baseUrl, "-TimeoutSeconds", "$TimeoutSeconds")
  if ($SkipReady) {
    $healthArgs += "-SkipReady"
  }
  if ($StrictReady) {
    $healthArgs += "-StrictReady"
  }
  if ($CheckExcelPreview) {
    $healthArgs += @("-CheckExcelPreview", "-ExcelDocumentId", $ExcelDocumentId)
  }

  Write-Host "Running health check..."
  & powershell.exe @healthArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Health check failed with exit code $LASTEXITCODE"
  }
}

Write-Host "Startup guard passed."

