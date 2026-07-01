[CmdletBinding()]
param(
  [string]$ServiceName = "MHChub",
  [string]$Port = "",
  [switch]$SkipHttp,
  [switch]$StrictReady,
  [switch]$DiagnosticOnly,
  [switch]$Json,
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"
$script:Failures = 0
$script:Warnings = 0
$script:Checks = @()
$script:Remediation = @()
$script:AdministratorActions = @()

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

function Write-Check {
  param(
    [ValidateSet("OK", "WARN", "FAIL")]
    [string]$Level,
    [string]$Message
  )

  if ($Level -eq "FAIL") {
    $script:Failures++
  } elseif ($Level -eq "WARN") {
    $script:Warnings++
  }

  $script:Checks += [ordered]@{
    level = $Level
    message = $Message
  }

  if (-not $Json) {
    Write-Host "[$Level] $Message"
  }
}

function Invoke-Sc {
  param([string[]]$Arguments)

  $output = & sc.exe @Arguments 2>&1
  return ($output | Out-String)
}

function Get-CurrentUserContext {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return [ordered]@{
    name = $identity.Name
    sid = $identity.User.Value
    isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  }
}

function Get-ReadinessFailedChecks {
  param([object]$Ready)

  if ($null -eq $Ready -or $null -eq $Ready.checks) {
    return @()
  }

  return @($Ready.checks | Where-Object { $_.ok -eq $false })
}

function Get-ReadinessMessage {
  param([object]$Ready)

  $failed = Get-ReadinessFailedChecks -Ready $Ready
  if ($failed.Count -eq 0) {
    return "Readiness endpoint reports ready=false."
  }

  $labels = @()
  foreach ($check in $failed) {
    $id = [string]$check.id
    $label = [string]$check.label
    if ([string]::IsNullOrWhiteSpace($label)) {
      $labels += $id
    } else {
      $labels += "$id ($label)"
    }
  }

  return "Readiness endpoint reports ready=false: $($labels -join '; ')."
}

function Add-ReadinessRemediation {
  param(
    [object]$Ready,
    [string]$Port
  )

  foreach ($check in (Get-ReadinessFailedChecks -Ready $Ready)) {
    switch ([string]$check.id) {
      "admin-password" {
        $script:Remediation += "Set a strong admin password and web auth secret: npm run ops:secrets; restart/reload MHChub; rerun ops:health with -StrictReady."
      }
      "legacy-admin-pin" {
        $script:Remediation += "Disable legacy PIN and replace the default PIN: npm run ops:secrets."
      }
      "cors" {
        $script:Remediation += "Set ALLOWED_ORIGINS in .env to the expected LAN/public origins."
      }
      "config" {
        $script:Remediation += "Restore server/data/config.json from a known-good backup or install package."
      }
      "documents" {
        $script:Remediation += "Restore server/data/documents.json from a known-good backup or install package."
      }
      "uploads" {
        $script:Remediation += "Restore or create server/uploads and verify document files."
      }
      "previews" {
        $script:Remediation += "Restore or create server/previews, then regenerate previews if needed."
      }
      default {
        $script:Remediation += "Review readiness check '$([string]$check.id)', then rerun: npm run ops:health -- -BaseUrl http://127.0.0.1:$Port -StrictReady"
      }
    }
  }
}

function Read-ReadinessErrorBody {
  param([object]$ErrorRecord)

  $message = [string]$ErrorRecord.ErrorDetails.Message
  if ([string]::IsNullOrWhiteSpace($message)) {
    return $null
  }

  try {
    return $message | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return $null
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$currentUser = Get-CurrentUserContext
if ([string]::IsNullOrWhiteSpace($Port)) {
  $Port = Read-EnvPort (Join-Path $root ".env")
}

if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path $root "qa\reports\mhchub-service-check.json"
}

if (-not $Json) {
  Write-Host "Checking Windows service: $ServiceName"
  Write-Host "Project root: $root"
  Write-Host "Expected health URL: http://localhost:$Port"
  Write-Host ""
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Check "FAIL" "Service '$ServiceName' was not found. Install it with .\setup\home-install\install-mhchub-service-windows.ps1 -Start"
  $script:Remediation += "Install service: .\setup\home-install\install-mhchub-service-windows.ps1 -Start"
}

if ($service -and $service.Status -eq "Running") {
  Write-Check "OK" "Service is running."
} elseif ($service) {
  Write-Check "FAIL" "Service exists but status is $($service.Status)."
  $script:Remediation += "Start service from an Administrator PowerShell or Services.msc, then rerun this check."
}

$safeServiceName = $ServiceName -replace "'", "''"
$serviceInfo = Get-CimInstance Win32_Service -Filter "Name='$safeServiceName'" -ErrorAction SilentlyContinue
if ($serviceInfo) {
  if ($serviceInfo.StartMode -eq "Auto") {
    Write-Check "OK" "Service StartMode is Automatic."
  } else {
    Write-Check "FAIL" "Service StartMode is $($serviceInfo.StartMode), expected Automatic."
  }

  if ($serviceInfo.PathName -match "(?i)nssm|node(\.exe)?") {
    Write-Check "OK" "Service executable path looks valid."
  } else {
    Write-Check "WARN" "Service executable path is not NSSM/Node: $($serviceInfo.PathName)"
  }
} else {
  Write-Check "WARN" "Could not read Win32_Service metadata."
}

$qc = Invoke-Sc -Arguments @("qc", $ServiceName)
if ($qc -match "AUTO_START" -and $qc -match "DELAYED") {
  Write-Check "OK" "SCM start type is Automatic (Delayed Start)."
} elseif ($qc -match "AUTO_START") {
  Write-Check "WARN" "SCM start type is Automatic but delayed-auto was not detected."
} else {
  Write-Check "FAIL" "SCM start type is not Automatic."
}

$failure = Invoke-Sc -Arguments @("qfailure", $ServiceName)
if ($failure -match "RESTART") {
  Write-Check "OK" "SCM failure recovery includes restart actions."
} else {
  Write-Check "FAIL" "SCM failure recovery restart actions were not detected."
  $script:Remediation += "Preview repair: npm run ops:service:repair-preview"
  $script:Remediation += "Apply repair as Administrator: npm run ops:service:repair-apply"
  $script:AdministratorActions += [ordered]@{
    name = "service-recovery-restart-enabled"
    command = "npm run ops:service:repair-apply"
    reason = "SCM recovery restart actions require Administrator rights."
    requiresAdministrator = $true
  }
}

$failureFlag = Invoke-Sc -Arguments @("qfailureflag", $ServiceName)
if ($failureFlag -match "(?im)FAILURE_ACTIONS_ON_NONCRASH_FAILURES\s*:\s*(TRUE|1)\b") {
  Write-Check "OK" "SCM failure flag is enabled for non-crash failures."
} else {
  Write-Check "WARN" "SCM failure flag was not clearly enabled."
  $script:Remediation += "Enable failure flag with the same repair command: npm run ops:service:repair-apply"
  $script:AdministratorActions += [ordered]@{
    name = "service-recovery-noncrash-failure-flag"
    command = "npm run ops:service:repair-apply"
    reason = "SCM failure flag changes require Administrator rights."
    requiresAdministrator = $true
  }
}

if (-not $SkipHttp) {
  $baseUrl = "http://localhost:$Port"
  try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method Get -TimeoutSec 5
    Write-Check "OK" "HTTP health responded: $($health.service)"
  } catch {
    Write-Check "FAIL" "HTTP health failed at $baseUrl/api/health: $($_.Exception.Message)"
  }

  try {
    $ready = Invoke-RestMethod -Uri "$baseUrl/api/ready" -Method Get -TimeoutSec 5
    if ($ready.ready -eq $true) {
      Write-Check "OK" "Readiness endpoint reports ready=true."
    } elseif ($StrictReady) {
      Write-Check "FAIL" (Get-ReadinessMessage -Ready $ready)
      Add-ReadinessRemediation -Ready $ready -Port $Port
    } else {
      Write-Check "WARN" "$(Get-ReadinessMessage -Ready $ready) Re-run with -StrictReady when production readiness is required."
      Add-ReadinessRemediation -Ready $ready -Port $Port
      $script:Remediation += "Run: npm run ops:health -- -BaseUrl http://127.0.0.1:$Port -StrictReady"
    }
  } catch {
    $readyErrorBody = Read-ReadinessErrorBody -ErrorRecord $_
    if ($readyErrorBody -and $readyErrorBody.checks) {
      if ($StrictReady) {
        Write-Check "FAIL" (Get-ReadinessMessage -Ready $readyErrorBody)
        Add-ReadinessRemediation -Ready $readyErrorBody -Port $Port
      } else {
        Write-Check "WARN" "$(Get-ReadinessMessage -Ready $readyErrorBody) Re-run with -StrictReady when production readiness is required."
        Add-ReadinessRemediation -Ready $readyErrorBody -Port $Port
      }
      $script:Remediation += "Run: npm run ops:health -- -BaseUrl http://127.0.0.1:$Port -StrictReady"
    } elseif ($StrictReady) {
      Write-Check "FAIL" "Readiness endpoint failed: $($_.Exception.Message)"
      $script:Remediation += "Run: npm run ops:health -- -BaseUrl http://127.0.0.1:$Port -StrictReady"
    } else {
      Write-Check "WARN" "Readiness endpoint failed: $($_.Exception.Message)"
      $script:Remediation += "Run: npm run ops:health -- -BaseUrl http://127.0.0.1:$Port"
    }
  }
}

$serviceOk = ($script:Failures -eq 0)
$reportedFailures = if ($DiagnosticOnly) { 0 } else { $script:Failures }
$reportedWarnings = if ($DiagnosticOnly) { $script:Warnings + $script:Failures } else { $script:Warnings }

$report = [ordered]@{
  ok = if ($DiagnosticOnly) { $true } else { $serviceOk }
  serviceOk = $serviceOk
  diagnosticOnly = [bool]$DiagnosticOnly
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  serviceName = $ServiceName
  projectRoot = [string]$root
  port = [string]$Port
  healthUrl = "http://localhost:$Port"
  currentUser = $currentUser
  administratorActions = @($script:AdministratorActions)
  strictReady = [bool]$StrictReady
  skipHttp = [bool]$SkipHttp
  summary = [ordered]@{
    failed = $reportedFailures
    warnings = $reportedWarnings
    serviceFailures = $script:Failures
    serviceWarnings = $script:Warnings
    passed = @($script:Checks | Where-Object { $_.level -eq "OK" }).Count
    total = $script:Checks.Count
  }
  checks = $script:Checks
  remediation = @($script:Remediation | Select-Object -Unique)
}

$reportDir = Split-Path -Parent $ReportPath
if (-not [string]::IsNullOrWhiteSpace($reportDir)) {
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
}
$reportJson = $report | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($ReportPath, $reportJson, (New-Object Text.UTF8Encoding($false)))

if ($Json) {
  $reportJson
} else {
  Write-Host ""
  Write-Host "Summary: failures=$script:Failures warnings=$script:Warnings diagnosticOnly=$([bool]$DiagnosticOnly)"
  Write-Host "Report: $ReportPath"
}
if ($script:Failures -gt 0 -and -not $DiagnosticOnly) {
  exit 1
}
