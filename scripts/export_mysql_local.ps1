<#
Export a MySQL database to a SQL file using the local `mysqldump` client.

This script runs locally and will prompt you for the MySQL password.
It does not require embedding secrets in files.

Usage (from repository root):
  powershell -ExecutionPolicy Bypass -File scripts\export_mysql_local.ps1

You can also provide parameters:
  -Host, -Port, -User, -Database, -OutFile
#>

param(
  [string]$DbHost,
  [int]$DbPort = $null,
  [string]$DbUser = $null,
  [string]$Database,
  [string]$OutFile,
  [string]$MysqldumpPath
)

function Load-EnvDefaults {
  param([string]$EnvPath)
  if (-not (Test-Path $EnvPath)) { return @{} }
  $pairs = @{}
  Get-Content $EnvPath | ForEach-Object {
    if ($_ -match '^(\s*#)|(^\s*$)') { return }
    if ($_ -match '^\s*([^=\s]+)\s*=\s*(.*)\s*$') {
      $k = $matches[1]; $v = $matches[2]
      $pairs[$k] = $v
    }
  }
  return $pairs
}

$envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$envDefaults = Load-EnvDefaults -EnvPath $envFile

if (-not $DbHost) {
  if ($envDefaults.ContainsKey('MHCHUB_MYSQL_HOST')) { $DbHost = $envDefaults['MHCHUB_MYSQL_HOST'] }
  else { $DbHost = Read-Host -Prompt 'MySQL host (default: localhost)'; if (-not $DbHost) { $DbHost = 'localhost' } }
}
if (-not $DbPort) { $DbPort = 3306 }
if (-not $DbUser) {
  if ($envDefaults.ContainsKey('MHCHUB_MYSQL_USER')) { $DbUser = $envDefaults['MHCHUB_MYSQL_USER'] }
  else { $DbUser = Read-Host -Prompt 'MySQL user (default: root)'; if (-not $DbUser) { $DbUser = 'root' } }
}
if (-not $Database) {
  if ($envDefaults.ContainsKey('MHCHUB_MYSQL_DATABASE')) { $Database = $envDefaults['MHCHUB_MYSQL_DATABASE'] }
  else { $Database = Read-Host -Prompt 'Database name to export'; if (-not $Database) { Write-Error "Database name is required."; exit 1 } }
}
if (-not $DbPort) {
  if ($envDefaults.ContainsKey('MHCHUB_MYSQL_PORT')) { [int]$DbPort = [int]$envDefaults['MHCHUB_MYSQL_PORT'] }
}
if (-not $OutFile) { $OutFile = Join-Path (Split-Path -Parent $PSScriptRoot) "database\mhchub-export-$(Get-Date -Format yyyyMMdd_HHmmss).sql" }

$outDir = Split-Path $OutFile -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$cmd = 'mysqldump -h ' + $DbHost + ' -P ' + $DbPort + ' -u ' + $DbUser + ' -p ' + $Database + ' > "' + $OutFile + '"'

Write-Host "Running mysqldump. You will be prompted for the MySQL password in this console."
Write-Host "Command: $cmd"

# locate mysqldump
if ($MysqldumpPath) {
  if (Test-Path $MysqldumpPath) { $mysqldumpCmd = $MysqldumpPath } else { Write-Warning "Provided MysqldumpPath not found: $MysqldumpPath"; $mysqldumpCmd = $null }
} else {
  $mysqldumpCmd = Get-Command mysqldump -ErrorAction SilentlyContinue
}
if (-not $mysqldumpCmd) {
  $candidates = @(
    "$env:ProgramFiles\MySQL\MySQL Server*\bin\mysqldump.exe",
    "$env:ProgramFiles(x86)\MySQL\MySQL Server*\bin\mysqldump.exe"
  )
  foreach ($p in $candidates) {
    $found = Get-ChildItem -Path $p -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $mysqldumpCmd = $found.FullName; break }
  }
}

if (-not $mysqldumpCmd) {
  Write-Error "mysqldump not found. Install MySQL client tools or add mysqldump to PATH, or re-run with -MysqldumpPath."
  exit 1
}

# Run via cmd.exe so redirection works and the prompt is interactive
Start-Process -FilePath cmd.exe -ArgumentList '/c', $cmd -NoNewWindow -Wait

if (Test-Path $OutFile -PathType Leaf) { Write-Host "Export complete: $OutFile" } else { Write-Error "Export failed or was cancelled." }
