[CmdletBinding()]
param(
  [string]$ServiceName = "MHChub",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator when using -Apply."
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

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  throw "Service '$ServiceName' was not found. Install it first with .\setup\home-install\install-mhchub-service-windows.ps1 -Start"
}

$commands = @(
  @("failure", $ServiceName, "reset=", "86400", "actions=", "restart/60000/restart/60000/restart/120000"),
  @("failureflag", $ServiceName, "1")
)

if (-not $Apply) {
  Write-Host "Preview only. No service configuration was changed."
  Write-Host "Run again with -Apply in Administrator PowerShell to enable recovery."
  Write-Host ""
  Write-Host "Current recovery restart detected: $(Test-RecoveryRestart -Name $ServiceName)"
  Write-Host "Current non-crash failure flag enabled: $(Test-FailureFlagEnabled -Name $ServiceName)"
  Write-Host ""
  foreach ($command in $commands) {
    Write-Host ("sc.exe " + ($command -join " "))
  }
  exit 0
}

Assert-Admin

foreach ($command in $commands) {
  Invoke-ServiceConfig -Arguments $command
}

if (-not (Test-RecoveryRestart -Name $ServiceName)) {
  throw "Recovery repair ran, but restart actions were not detected by sc.exe qfailure."
}
if (-not (Test-FailureFlagEnabled -Name $ServiceName)) {
  throw "Recovery repair ran, but failureflag was not detected by sc.exe qfailureflag."
}

Write-Host ""
Write-Host "Service recovery configured for '$ServiceName'. This did not restart the service."
Write-Host "Verify with: .\setup\home-install\check-mhchub-service-windows.ps1 -SkipHttp"
