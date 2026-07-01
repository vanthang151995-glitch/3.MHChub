<#
Restore a MySQL dump into a database using the local `mysql` client.

Usage (from repository root):
  powershell -ExecutionPolicy Bypass -File .\release\restore_db.ps1

The script will prompt for MySQL connection details and let you choose a `.sql` file
from the `database/` directory.
#>

Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $scriptDir 'database')) {
  $repoRoot = $scriptDir
} else {
  $repoRoot = Split-Path -Parent $scriptDir
}

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

$envFile = Join-Path $repoRoot '.env'
if (-not (Test-Path $envFile)) { $envFile = Join-Path $repoRoot '.env.example' }
$envDefaults = Load-EnvDefaults -EnvPath $envFile

$sqlDir = Join-Path $repoRoot 'database'
if (-not (Test-Path $sqlDir)) { Write-Error "Database folder not found: $sqlDir"; exit 1 }

$files = Get-ChildItem -Path (Join-Path $sqlDir '*.sql') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
if (-not $files -or $files.Count -eq 0) { Write-Error "No .sql files found under $sqlDir"; exit 1 }

Write-Host "Found SQL files:" -ForegroundColor Cyan
for ($i = 0; $i -lt $files.Count; $i++) {
  Write-Host "[$i] $($files[$i].Name) - $($files[$i].LastWriteTime)"
}

$choice = Read-Host -Prompt 'Enter index of SQL file to import (default 0)'
if ($choice -eq '') { $choice = 0 }
$choiceIndex = 0
if (-not [int]::TryParse([string]$choice, [ref]$choiceIndex) -or $choiceIndex -lt 0 -or $choiceIndex -ge $files.Count) { Write-Error 'Invalid selection.'; exit 1 }

$selectedFile = $files[$choiceIndex].FullName
Write-Host "Selected: $selectedFile"

# Defaults from env if present
if ($envDefaults.ContainsKey('MHCHUB_MYSQL_HOST')) { $DbHost = $envDefaults['MHCHUB_MYSQL_HOST'] } else { $DbHost = Read-Host -Prompt 'MySQL host (default: localhost)'; if (-not $DbHost) { $DbHost = 'localhost' } }
if ($envDefaults.ContainsKey('MHCHUB_MYSQL_PORT')) { $DbPort = [int]$envDefaults['MHCHUB_MYSQL_PORT'] } else { $DbPort = 3306 }
if ($envDefaults.ContainsKey('MHCHUB_MYSQL_USER')) { $DbUser = $envDefaults['MHCHUB_MYSQL_USER'] } else { $DbUser = Read-Host -Prompt 'MySQL user (default: root)'; if (-not $DbUser) { $DbUser = 'root' } }
if ($envDefaults.ContainsKey('MHCHUB_MYSQL_DATABASE')) { $DbName = $envDefaults['MHCHUB_MYSQL_DATABASE'] } else { $DbName = Read-Host -Prompt 'Database name to import into (default: mhchub)'; if (-not $DbName) { $DbName = 'mhchub' } }

# locate mysql client
$mysqlCmdPath = $null
$found = Get-Command mysql -ErrorAction SilentlyContinue
if ($found) { $mysqlCmdPath = $found.Path }
if (-not $mysqlCmdPath) {
  $candidates = @(
    "$env:ProgramFiles\MySQL\MySQL Server*\bin\mysql.exe",
    "$env:ProgramFiles(x86)\MySQL\MySQL Server*\bin\mysql.exe"
  )
  foreach ($p in $candidates) {
    $f = Get-ChildItem -Path $p -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f) { $mysqlCmdPath = $f.FullName; break }
  }
}

if (-not $mysqlCmdPath) { Write-Error "mysql client not found in PATH or common locations. Install MySQL client or add mysql.exe to PATH."; exit 1 }

# Build command (use cmd.exe for redirection)
$cmd = '"' + $mysqlCmdPath + '" -h ' + $DbHost + ' -P ' + $DbPort + ' -u ' + $DbUser + ' -p ' + $DbName + ' < "' + $selectedFile + '"'

Write-Host "Running import. You will be prompted for the MySQL password in this console." -ForegroundColor Yellow
Write-Host "Command: $cmd"
Start-Process -FilePath cmd.exe -ArgumentList '/c', $cmd -NoNewWindow -Wait

Write-Host "Import completed (check output for errors)." -ForegroundColor Green
