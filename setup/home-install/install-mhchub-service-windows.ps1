[CmdletBinding()]
param(
  [string]$ServiceName = "MHChub",
  [string]$DisplayName = "MHChub Web",
  [string]$NssmPath = "",
  [switch]$Start,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script in PowerShell as Administrator to install or update a Windows service."
  }
}

function Resolve-Nssm {
  param([string]$ExplicitPath)

  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    $candidates += $ExplicitPath
  }
  $candidates += "C:\tools\nssm\nssm.exe"

  $wingetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path $wingetRoot) {
    $candidates += Get-ChildItem -Path $wingetRoot -Recurse -Filter nssm.exe -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty FullName
  }

  $pathCommand = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($pathCommand) {
    $candidates += $pathCommand.Source
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "nssm.exe was not found. Install NSSM or pass -NssmPath C:\path\to\nssm.exe."
}

function Invoke-Nssm {
  param(
    [string]$Exe,
    [string[]]$Arguments
  )

  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "nssm failed: $($Arguments -join ' ')"
  }
}

function Invoke-ServiceConfig {
  param([string[]]$Arguments)

  & sc.exe @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "sc.exe failed: $($Arguments -join ' ')"
  }
}

function Invoke-ScText {
  param([string[]]$Arguments)

  $output = & sc.exe @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "sc.exe failed: $($Arguments -join ' ')"
  }
  return ($output | Out-String)
}

function Test-RecoveryRestart {
  param([string]$Name)

  $failure = Invoke-ScText -Arguments @("qfailure", $Name)
  return ($failure -match "RESTART")
}

function Test-FailureFlagEnabled {
  param([string]$Name)

  $failureFlag = Invoke-ScText -Arguments @("qfailureflag", $Name)
  return ($failureFlag -match "(?im)FAILURE_ACTIONS_ON_NONCRASH_FAILURES\s*:\s*(TRUE|1)\b")
}

Assert-Admin

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  $node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $node) {
  throw "Node.js is not installed or not in PATH."
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

$nssm = Resolve-Nssm -ExplicitPath $NssmPath
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$serviceExists = $false
& sc.exe query $ServiceName *> $null
if ($LASTEXITCODE -eq 0) {
  $serviceExists = $true
}

if ($serviceExists -and -not $Force) {
  throw "Service '$ServiceName' already exists. Re-run with -Force to update the NSSM configuration."
}

if (-not $serviceExists) {
  Invoke-Nssm -Exe $nssm -Arguments @("install", $ServiceName, $node.Source, "server/index.js")
}

Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "Application", $node.Source)
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppParameters", "server/index.js")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppDirectory", "$root")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "DisplayName", $DisplayName)
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "Description", "Company Utility Hub web and API service.")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "Start", "SERVICE_AUTO_START")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppStdout", (Join-Path $logDir "mhchub-service.out.log"))
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppStderr", (Join-Path $logDir "mhchub-service.err.log"))
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppRotateFiles", "1")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppRotateOnline", "1")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppRotateSeconds", "86400")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppRotateBytes", "1048576")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppThrottle", "1500")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppRestartDelay", "5000")
Invoke-Nssm -Exe $nssm -Arguments @("set", $ServiceName, "AppExit", "Default", "Restart")

Invoke-ServiceConfig -Arguments @("config", $ServiceName, "start=", "delayed-auto")
Invoke-ServiceConfig -Arguments @("failure", $ServiceName, "reset=", "86400", "actions=", "restart/60000/restart/60000/restart/120000")
Invoke-ServiceConfig -Arguments @("failureflag", $ServiceName, "1")

if (-not (Test-RecoveryRestart -Name $ServiceName)) {
  throw "Service was configured, but restart recovery actions were not detected by sc.exe qfailure."
}
if (-not (Test-FailureFlagEnabled -Name $ServiceName)) {
  throw "Service was configured, but failureflag was not detected by sc.exe qfailureflag."
}

if ($Start) {
  Invoke-Nssm -Exe $nssm -Arguments @("start", $ServiceName)
}

Write-Host ""
Write-Host "Service configured: $ServiceName"
Write-Host "NSSM: $nssm"
Write-Host "Node: $($node.Source)"
Write-Host "Root: $root"
Write-Host "Logs: $logDir"
Get-Service -Name $ServiceName | Select-Object Name,DisplayName,Status,StartType
