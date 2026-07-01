[CmdletBinding()]
param(
  [int[]]$Ports = @(),
  [string]$HostName = "127.0.0.1",
  [switch]$ExpectListening,
  [switch]$ExpectFree,
  [switch]$Json
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

if ($ExpectListening -and $ExpectFree) {
  throw "Use only one expectation: -ExpectListening or -ExpectFree."
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
if ($Ports.Count -eq 0) {
  $envPort = Read-EnvValue -EnvPath (Join-Path $root ".env") -Name "PORT" -Fallback "3333"
  if ($envPort -notmatch "^\d+$") {
    throw "PORT must be numeric. Current value was not readable as a port."
  }
  $Ports = @([int]$envPort)
}

$results = foreach ($port in $Ports) {
  if ($port -lt 1 -or $port -gt 65535) {
    throw "Invalid TCP port: $port"
  }

  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  $isListening = $listeners.Count -gt 0
  $ok = $true
  $expectation = "observed"

  if ($ExpectListening) {
    $expectation = "listening"
    $ok = $isListening
  } elseif ($ExpectFree) {
    $expectation = "free"
    $ok = -not $isListening
  }

  [pscustomobject]@{
    port = $port
    host = $HostName
    listening = $isListening
    expectation = $expectation
    ok = $ok
    pids = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  }
}

if ($Json) {
  [pscustomobject]@{
    ok = -not @($results | Where-Object { -not $_.ok })
    checkedAt = (Get-Date).ToUniversalTime().ToString("o")
    ports = $results
  } | ConvertTo-Json -Depth 5
} else {
  $results | Format-Table -AutoSize
}

if (@($results | Where-Object { -not $_.ok }).Count -gt 0) {
  exit 1
}

