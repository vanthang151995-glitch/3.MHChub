[CmdletBinding()]
param(
  [string]$ServiceName = "MHChub",
  [string]$NssmPath = "",
  [switch]$Stop
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script in PowerShell as Administrator to remove a Windows service."
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

Assert-Admin

$nssm = Resolve-Nssm -ExplicitPath $NssmPath

& sc.exe query $ServiceName *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Service '$ServiceName' does not exist."
  exit 0
}

if ($Stop) {
  & $nssm stop $ServiceName
}

& $nssm remove $ServiceName confirm
if ($LASTEXITCODE -ne 0) {
  throw "Failed to remove service '$ServiceName'."
}

Write-Host "Service removed: $ServiceName"
