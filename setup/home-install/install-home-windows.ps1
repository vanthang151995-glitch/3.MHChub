[CmdletBinding()]
param(
  [switch]$SkipNpmInstall,
  [switch]$SkipBuild,
  [switch]$UseMysql
)

$ErrorActionPreference = "Stop"

function Get-PlainText {
  param([System.Security.SecureString]$Secure)

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Set-EnvValue {
  param(
    [string]$Content,
    [string]$Name,
    [string]$Value
  )

  $escapedName = [regex]::Escape($Name)
  $escapedValue = $Value -replace "`r|`n", ""
  if ($Content -match "(?m)^$escapedName=") {
    return [regex]::Replace($Content, "(?m)^$escapedName=.*$", { param($match) "$Name=$escapedValue" })
  }
  return "$Content`r`n$Name=$escapedValue"
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=") -replace "\+", "-" -replace "/", "_"
}

function Read-Default {
  param(
    [string]$Prompt,
    [string]$Default
  )

  $value = Read-Host "$Prompt [$Default]"
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }
  return $value.Trim()
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}

if (-not $node) {
  throw "Node.js is not installed or not in PATH. Install Node.js LTS first."
}
if (-not $npm) {
  throw "npm is not installed or not in PATH. Install Node.js LTS first."
}

Write-Host "Project: $root"
Write-Host "Node: $(& $node.Source -v)"
Write-Host "npm: $(& $npm.Source -v)"

$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) {
  $templatePath = Join-Path $root ".env.example"
  if (-not (Test-Path $templatePath)) {
    throw ".env.example not found."
  }

  $content = Get-Content -LiteralPath $templatePath -Raw
  $adminUser = Read-Default -Prompt "Admin username" -Default "admin"
  $adminPassword = Get-PlainText (Read-Host "Admin password" -AsSecureString)
  if ([string]::IsNullOrWhiteSpace($adminPassword)) {
    throw "Admin password cannot be empty."
  }

  $port = Read-Default -Prompt "Web port" -Default "3333"
  $adminPin = -join ((1..8) | ForEach-Object { Get-Random -Minimum 0 -Maximum 10 })
  $content = Set-EnvValue $content "ADMIN_USERNAME" $adminUser
  $content = Set-EnvValue $content "ADMIN_PASSWORD" $adminPassword
  $content = Set-EnvValue $content "ADMIN_PIN" $adminPin
  $content = Set-EnvValue $content "ENABLE_LEGACY_ADMIN_PIN" "false"
  $content = Set-EnvValue $content "WEB_AUTH_SECRET" (New-RandomSecret)
  $content = Set-EnvValue $content "PORT" $port
  $content = Set-EnvValue $content "NODE_ENV" "production"
  $content = Set-EnvValue $content "APP_ENV" "lan"
  $content = Set-EnvValue $content "ALLOWED_ORIGINS" "http://localhost:$port,http://127.0.0.1:$port"

  $mysqlAnswer = if ($UseMysql) { "Y" } else { Read-Host "Use MySQL auth database? Y/N [N]" }
  if ($mysqlAnswer -match "^(y|yes)$") {
    $dbHost = Read-Default -Prompt "MySQL host" -Default "127.0.0.1"
    $dbPort = Read-Default -Prompt "MySQL port" -Default "3308"
    $dbUser = Read-Default -Prompt "MySQL user" -Default "root"
    $dbPassword = Get-PlainText (Read-Host "MySQL password (blank allowed)" -AsSecureString)
    $dbName = Read-Default -Prompt "MHChub database" -Default "mhchub"
    if ($dbName -notmatch "^[A-Za-z0-9_]+$") {
      throw "Database name can only contain letters, numbers, and underscore."
    }

    $content = Set-EnvValue $content "MHCHUB_MYSQL_HOST" $dbHost
    $content = Set-EnvValue $content "MHCHUB_MYSQL_PORT" $dbPort
    $content = Set-EnvValue $content "MHCHUB_MYSQL_USER" $dbUser
    $content = Set-EnvValue $content "MHCHUB_MYSQL_PASSWORD" $dbPassword
    $content = Set-EnvValue $content "MHCHUB_MYSQL_DATABASE" $dbName

    $mysql = Get-Command mysql.exe -ErrorAction SilentlyContinue
    if ($mysql) {
      $passwordArg = @()
      if (-not [string]::IsNullOrEmpty($dbPassword)) {
        $passwordArg = @("-p$dbPassword")
      }

      Write-Host "Creating MySQL database/schema if possible..."
      & $mysql.Source -h $dbHost -P $dbPort -u $dbUser @passwordArg -e "CREATE DATABASE IF NOT EXISTS ``$dbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
      if ($LASTEXITCODE -ne 0) {
        throw "MySQL database creation failed."
      }

      $schemaPath = Join-Path $root "database\migrations\001_auth_schema.sql"
      Get-Content -LiteralPath $schemaPath -Raw | & $mysql.Source -h $dbHost -P $dbPort -u $dbUser @passwordArg $dbName
      if ($LASTEXITCODE -ne 0) {
        throw "MySQL schema migration failed."
      }
    } else {
      Write-Host "mysql.exe not found in PATH. The app can create tables later, but database '$dbName' must exist."
    }
  } else {
    $content = Set-EnvValue $content "MHCHUB_MYSQL_HOST" ""
    $content = Set-EnvValue $content "MHCHUB_MYSQL_PORT" ""
    $content = Set-EnvValue $content "MHCHUB_MYSQL_USER" ""
    $content = Set-EnvValue $content "MHCHUB_MYSQL_PASSWORD" ""
    $content = Set-EnvValue $content "MHCHUB_MYSQL_DATABASE" ""
  }

  Set-Content -LiteralPath $envPath -Value $content -Encoding UTF8
  Write-Host "Created .env"
} else {
  Write-Host ".env already exists; keeping current values."
}

New-Item -ItemType Directory -Force -Path (Join-Path $root "server\data\auth") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root "server\data\backups") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root "server\uploads") | Out-Null
if (-not (Test-Path (Join-Path $root "server\data\activity.json"))) {
  Set-Content -LiteralPath (Join-Path $root "server\data\activity.json") -Value "[]" -Encoding UTF8
}

if (-not $SkipNpmInstall) {
  if (Test-Path (Join-Path $root "package-lock.json")) {
    & $npm.Source ci
  } else {
    & $npm.Source install
  }
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed."
  }
}

if (-not $SkipBuild) {
  & $npm.Source run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed."
  }
}

Write-Host ""
Write-Host "Install complete."
Write-Host "Start with: .\setup\home-install\start-mhchub-windows.ps1"
