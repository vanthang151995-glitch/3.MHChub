[CmdletBinding()]
param(
  [string]$ProjectRoot = "",
  [string]$AdminUsername = "",
  [System.Security.SecureString]$AdminPassword,
  [switch]$RotateWebAuthSecret,
  [switch]$SkipUserSync,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-PlainText {
  param([System.Security.SecureString]$Secure)

  if (-not $Secure) {
    return ""
  }

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function New-RandomSecret {
  param([int]$Bytes = 48)

  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
    return [Convert]::ToBase64String($buffer).TrimEnd("=") -replace "\+", "-" -replace "/", "_"
  } finally {
    $rng.Dispose()
  }
}

function Get-EnvValue {
  param(
    [string]$Content,
    [string]$Name,
    [string]$Fallback = ""
  )

  $escapedName = [regex]::Escape($Name)
  $match = [regex]::Match($Content, "(?m)^\s*$escapedName\s*=\s*(.*)\s*$")
  if (-not $match.Success) {
    return $Fallback
  }
  return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Set-EnvValue {
  param(
    [string]$Content,
    [string]$Name,
    [string]$Value
  )

  $escapedName = [regex]::Escape($Name)
  $escapedValue = $Value -replace "`r|`n", ""
  if ($Content -match "(?m)^\s*$escapedName\s*=") {
    return [regex]::Replace($Content, "(?m)^\s*$escapedName\s*=.*$", { param($match) "$Name=$escapedValue" })
  }
  return "$Content`r`n$Name=$escapedValue"
}

function Test-StrongPassword {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Length -lt 12) {
    return $false
  }
  $classes = 0
  if ($Value -match "[a-z]") { $classes += 1 }
  if ($Value -match "[A-Z]") { $classes += 1 }
  if ($Value -match "\d") { $classes += 1 }
  if ($Value -match "[^a-zA-Z0-9]") { $classes += 1 }
  return $classes -ge 3
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
    throw "Refusing to write outside expected directory. Path: $fullPath Parent: $fullParent"
  }
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}
Set-Location $ProjectRoot

$envPath = Join-Path $ProjectRoot ".env"
$templatePath = Join-Path $ProjectRoot ".env.example"
if (Test-Path -LiteralPath $envPath) {
  $content = Get-Content -LiteralPath $envPath -Raw
  $envSource = ".env"
} elseif (Test-Path -LiteralPath $templatePath) {
  $content = Get-Content -LiteralPath $templatePath -Raw
  $envSource = ".env.example"
} else {
  throw ".env and .env.example were not found."
}

if ([string]::IsNullOrWhiteSpace($AdminUsername)) {
  $AdminUsername = Get-EnvValue -Content $content -Name "ADMIN_USERNAME" -Fallback "admin"
}
$AdminUsername = $AdminUsername.Trim()
if ($AdminUsername -notmatch "^[A-Za-z0-9._@-]{3,64}$") {
  throw "Admin username must be 3-64 characters and use letters, numbers, dot, underscore, dash, or @."
}

$plainPassword = Get-PlainText $AdminPassword
if ([string]::IsNullOrWhiteSpace($plainPassword) -and -not $DryRun) {
  $plainPassword = Get-PlainText (Read-Host "New admin password for '$AdminUsername'" -AsSecureString)
}
if (-not [string]::IsNullOrWhiteSpace($plainPassword) -and -not (Test-StrongPassword $plainPassword)) {
  throw "Admin password must be at least 12 characters and include at least 3 of: lowercase, uppercase, digit, symbol."
}

$currentSecret = Get-EnvValue -Content $content -Name "WEB_AUTH_SECRET" -Fallback ""
$weakSecret = [string]::IsNullOrWhiteSpace($currentSecret) -or $currentSecret.Length -lt 32 -or $currentSecret -match "change_this|replace_with|default"
$willRotateSecret = $RotateWebAuthSecret -or $weakSecret

$nextContent = $content
$nextContent = Set-EnvValue $nextContent "ADMIN_USERNAME" $AdminUsername
if (-not [string]::IsNullOrWhiteSpace($plainPassword)) {
  $nextContent = Set-EnvValue $nextContent "ADMIN_PASSWORD" $plainPassword
}
if ($willRotateSecret) {
  $nextContent = Set-EnvValue $nextContent "WEB_AUTH_SECRET" (New-RandomSecret)
}
$nextContent = Set-EnvValue $nextContent "ENABLE_LEGACY_ADMIN_PIN" "false"
$nextContent = Set-EnvValue $nextContent "NODE_ENV" "production"
$nextContent = Set-EnvValue $nextContent "APP_ENV" "lan"

$summary = [ordered]@{
  dryRun = [bool]$DryRun
  projectRoot = $ProjectRoot
  envSource = $envSource
  envTarget = $envPath
  adminUsername = $AdminUsername
  adminPasswordUpdated = -not [string]::IsNullOrWhiteSpace($plainPassword)
  webAuthSecretRotated = [bool]$willRotateSecret
  legacyAdminPinDisabled = $true
  userSync = (-not $SkipUserSync -and -not [string]::IsNullOrWhiteSpace($plainPassword))
}

if ($DryRun) {
  $summary | ConvertTo-Json -Depth 4
  exit 0
}

if ([string]::IsNullOrWhiteSpace($plainPassword)) {
  throw "Admin password was not provided."
}

$backupRoot = Join-Path $ProjectRoot ("backups\ops\" + (Get-Date -Format "yyyyMMdd_HHmmss"))
Assert-UnderPath -Path $backupRoot -ParentPath (Join-Path $ProjectRoot "backups\ops")
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
if (Test-Path -LiteralPath $envPath) {
  Copy-Item -LiteralPath $envPath -Destination (Join-Path $backupRoot ".env") -Force
}

Set-Content -LiteralPath $envPath -Value $nextContent -Encoding UTF8
$summary.backupRoot = $backupRoot

if (-not $SkipUserSync) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js was not found in PATH; .env was updated, but admin user password was not synced."
  }

  $env:MHCHUB_NEW_ADMIN_PASSWORD = $plainPassword
  try {
    & $node.Source (Join-Path $ProjectRoot "scripts\ensure-admin-user.mjs") $AdminUsername "--password-env" "MHCHUB_NEW_ADMIN_PASSWORD" "admin" $AdminUsername
    if ($LASTEXITCODE -ne 0) {
      throw "Admin user sync failed with exit code $LASTEXITCODE."
    }
  } finally {
    Remove-Item Env:MHCHUB_NEW_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  }
}

$summary | ConvertTo-Json -Depth 4
