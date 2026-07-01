[CmdletBinding()]
param(
  [string]$BaseUrl = "",
  [string]$HostName = "127.0.0.1",
  [string]$Port = "",
  [int]$TimeoutSeconds = 45,
  [switch]$SkipReady,
  [switch]$StrictReady,
  [switch]$SkipHome,
  [switch]$SkipAssets,
  [switch]$SkipDocuments,
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
    [string]$Method = "Get",
    [string]$ExpectedContentType = "",
    [int]$TimeoutSec = 20
  )

  $response = Invoke-WebRequest -Uri $Url -Method $Method -TimeoutSec $TimeoutSec -UseBasicParsing
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

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSec
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastError = ""
  while ((Get-Date) -lt $deadline) {
    try {
      return Invoke-HttpCheck -Url $Url -TimeoutSec 5
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Seconds 2
    }
  }
  throw "Timed out waiting for $Url. Last error: $lastError"
}

function Get-Url {
  param(
    [string]$Root,
    [string]$Path
  )

  if ($Path.StartsWith("http://", [StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith("https://", [StringComparison]::OrdinalIgnoreCase)) {
    return $Path
  }
  return "$Root$Path"
}

function Add-Check {
  param(
    [System.Collections.Generic.List[object]]$Checks,
    [string]$Name,
    [bool]$Ok,
    [string]$Details = ""
  )

  $Checks.Add([pscustomobject]@{
    name = $Name
    ok = $Ok
    details = $Details
  }) | Out-Null
}

function Get-ReadinessAdvice {
  param([string]$Message)

  $failed = @()
  $actions = @()
  try {
    $parsed = $Message | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return [pscustomobject]@{
      failedChecks = $failed
      actions = $actions
    }
  }

  foreach ($check in @($parsed.checks)) {
    if ($check.ok -ne $false) {
      continue
    }

    $id = [string]$check.id
    $label = [string]$check.label
    $failed += if ([string]::IsNullOrWhiteSpace($label)) { $id } else { "$id ($label)" }

    switch ($id) {
      "admin-password" {
        $actions += "Set a strong admin password and web auth secret: npm run ops:secrets; restart/reload MHChub; rerun ops:health with -StrictReady."
      }
      "legacy-admin-pin" {
        $actions += "Disable legacy PIN and replace the default PIN: npm run ops:secrets."
      }
      "cors" {
        $actions += "Set ALLOWED_ORIGINS in .env to the expected LAN/public origins."
      }
      "config" {
        $actions += "Restore server/data/config.json from a known-good backup or install package."
      }
      "documents" {
        $actions += "Restore server/data/documents.json from a known-good backup or install package."
      }
      "uploads" {
        $actions += "Restore or create server/uploads and verify document files."
      }
      "previews" {
        $actions += "Restore or create server/previews, then regenerate previews if needed."
      }
      default {
        $actions += "Review readiness check '$id' before production/public exposure."
      }
    }
  }

  return [pscustomobject]@{
    failedChecks = $failed
    actions = $actions | Select-Object -Unique
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not [string]::IsNullOrWhiteSpace($BaseUrl) -and [string]::IsNullOrWhiteSpace($Port)) {
  $parsedBaseUrl = [System.Uri]$BaseUrl
  if ($parsedBaseUrl.Port -gt 0) {
    $Port = [string]$parsedBaseUrl.Port
  }
}
if ([string]::IsNullOrWhiteSpace($Port)) {
  $Port = Read-EnvValue -EnvPath (Join-Path $root ".env") -Name "PORT" -Fallback "3333"
}
if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = "http://$HostName`:$Port"
}
$BaseUrl = $BaseUrl.TrimEnd("/")
$checks = [System.Collections.Generic.List[object]]::new()

Write-Host "MHChub health target: $BaseUrl"

if ($BaseUrl -match "^https?://(127\.0\.0\.1|localhost|\[::1\])[:/]" -and $Port -match "^\d+$") {
  $listener = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) {
    throw "No listener found on local port $Port."
  }
  Add-Check -Checks $checks -Name "port-listener" -Ok $true -Details "Port $Port PID $($listener.OwningProcess)"
}

Wait-ForHttp -Url "$BaseUrl/api/health" -TimeoutSec $TimeoutSeconds | Out-Null
$health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get -TimeoutSec 20
if ($health.ok -ne $true) {
  throw "/api/health did not return ok=true."
}
Add-Check -Checks $checks -Name "api-health" -Ok $true -Details $health.service

if (-not $SkipReady) {
  try {
    $ready = Invoke-WebRequest -Uri "$BaseUrl/api/ready" -Method Get -TimeoutSec 20 -UseBasicParsing
    if ($ready.StatusCode -ne 200) {
      throw "Readiness returned HTTP $($ready.StatusCode)"
    }
    Add-Check -Checks $checks -Name "api-ready" -Ok $true -Details "HTTP 200"
  } catch {
    $readyMessage = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $readyMessage = $_.ErrorDetails.Message
    }
    $readyAdvice = Get-ReadinessAdvice -Message $readyMessage
    $failedReady = @($readyAdvice.failedChecks)
    $readyActions = @($readyAdvice.actions)
    if ($failedReady.Count -gt 0) {
      $readyMessage = "Failed readiness checks: $($failedReady -join '; '). Actions: $($readyActions -join ' | ')"
    }
    if ($StrictReady) {
      throw "Ready endpoint is not green: $readyMessage"
    }
    Add-Check -Checks $checks -Name "api-ready" -Ok $false -Details $readyMessage
    Write-Warning "Ready endpoint is not fully green: $readyMessage"
  }
}

if (-not $SkipHome) {
  $homeResponse = Invoke-HttpCheck -Url "$BaseUrl/" -ExpectedContentType "text/html"
  if ($homeResponse.Content -notmatch "/assets/") {
    throw "Home HTML did not reference built assets."
  }
  Add-Check -Checks $checks -Name "home-html" -Ok $true -Details "$($homeResponse.RawContentLength) bytes"

  if (-not $SkipAssets) {
    $assetMatches = [regex]::Matches($homeResponse.Content, '(?:src|href)="([^"]*?/assets/[^"]+)"')
    foreach ($match in $assetMatches) {
      $assetPath = $match.Groups[1].Value
      $assetUrl = Get-Url -Root $BaseUrl -Path $assetPath
      $asset = Invoke-WebRequest -Uri $assetUrl -Method Head -TimeoutSec 20 -UseBasicParsing
      $assetType = [string]$asset.Headers["Content-Type"]
      if ($assetPath.EndsWith(".js") -and -not $assetType.StartsWith("text/javascript", [StringComparison]::OrdinalIgnoreCase)) {
        throw "$assetUrl returned '$assetType', expected JavaScript."
      }
      if ($assetPath.EndsWith(".css") -and -not $assetType.StartsWith("text/css", [StringComparison]::OrdinalIgnoreCase)) {
        throw "$assetUrl returned '$assetType', expected CSS."
      }
    }
    Add-Check -Checks $checks -Name "built-assets" -Ok $true -Details "$($assetMatches.Count) assets"
  }
}

if (-not $SkipDocuments) {
  $documents = Invoke-RestMethod -Uri "$BaseUrl/api/documents?pageSize=1" -Method Get -TimeoutSec 20
  if ($null -eq $documents.pagination -or [int]$documents.pagination.totalItems -lt 1) {
    throw "Document API returned no indexed documents."
  }
  Add-Check -Checks $checks -Name "document-api" -Ok $true -Details "$($documents.pagination.totalItems) documents"
}

if ($CheckExcelPreview) {
  $preview = Invoke-WebRequest -Uri "$BaseUrl/api/documents/$ExcelDocumentId/excel-html-preview/" -Method Head -TimeoutSec 30 -UseBasicParsing
  $previewType = [string]$preview.Headers["Content-Type"]
  if ($preview.StatusCode -ne 200 -or -not $previewType.StartsWith("text/html", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Excel preview returned HTTP $($preview.StatusCode), Content-Type '$previewType'"
  }
  Add-Check -Checks $checks -Name "excel-preview" -Ok $true -Details $ExcelDocumentId
}

$failed = @($checks | Where-Object { -not $_.ok })
$summary = [pscustomobject]@{
  ok = ($failed.Count -eq 0 -or (-not $StrictReady -and $failed.Count -eq 1 -and $failed[0].name -eq "api-ready"))
  baseUrl = $BaseUrl
  checkedAt = (Get-Date).ToUniversalTime().ToString("o")
  checks = $checks
}

$summary | ConvertTo-Json -Depth 5

if ($failed.Count -gt 0 -and ($StrictReady -or $failed[0].name -ne "api-ready")) {
  exit 1
}
