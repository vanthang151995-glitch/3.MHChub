param(
  [string]$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path,
  [string]$Dist = "dist",
  [switch]$Apply,
  [int]$ConfirmStaleCount = -1
)

$ErrorActionPreference = "Stop"

function Assert-UnderPath {
  param(
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $true)][string]$Parent
  )

  $targetFull = [IO.Path]::GetFullPath($Target)
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $expectedPrefix = $parentFull + [IO.Path]::DirectorySeparatorChar

  if ($targetFull -ne $parentFull -and -not $targetFull.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside expected directory: $targetFull"
  }
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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

function Get-AssetDeleteDiagnostic {
  param(
    [string]$RelativePath,
    [string]$Root,
    [string]$AssetsRoot
  )

  if ([string]::IsNullOrWhiteSpace($RelativePath)) {
    return $null
  }

  $target = ConvertTo-RelativeTarget -RelativePath $RelativePath -Root $Root
  Assert-UnderPath -Target $target -Parent $AssetsRoot

  if (-not (Test-Path -LiteralPath $target)) {
    return [ordered]@{
      sample = $RelativePath
      exists = $false
    }
  }

  $item = Get-Item -LiteralPath $target
  $acl = Get-Acl -LiteralPath $target
  $userContext = Get-CurrentUserContext

  return [ordered]@{
    sample = $RelativePath
    exists = $true
    owner = $acl.Owner
    currentUser = $userContext.name
    currentSid = $userContext.sid
    isAdministrator = $userContext.isAdministrator
    attributes = $item.Attributes.ToString()
    isReadOnly = $item.IsReadOnly
    length = $item.Length
    accessSample = @($acl.Access | Select-Object -First 10 | ForEach-Object {
      [ordered]@{
        identity = $_.IdentityReference.Value
        rights = $_.FileSystemRights.ToString()
        type = $_.AccessControlType.ToString()
        inherited = $_.IsInherited
      }
    })
    likelyCause = if (-not $userContext.isAdministrator -and $acl.Owner -eq "BUILTIN\Administrators") {
      "sample-owned-by-administrators-current-user-not-elevated"
    } elseif (-not $userContext.isAdministrator) {
      "current-user-not-elevated"
    } else {
      "requires-admin-or-file-lock-investigation"
    }
  }
}

function Test-DirectoryDeleteProbe {
  param(
    [string]$AssetsRoot,
    [string]$Root
  )

  $probeName = "__mhchub_delete_probe_$([Guid]::NewGuid().ToString('N')).tmp"
  $probePath = Join-Path $AssetsRoot $probeName
  Assert-UnderPath -Target $probePath -Parent $AssetsRoot
  $relativeProbePath = ConvertTo-DisplayRelativePath -Target $probePath -Root $Root
  $created = $false
  $deleted = $false
  $errorMessage = ""

  try {
    [IO.File]::WriteAllText($probePath, "delete-probe", [Text.Encoding]::ASCII)
    $created = Test-Path -LiteralPath $probePath
    Remove-Item -LiteralPath $probePath -Force -ErrorAction Stop
    $deleted = $true
  } catch {
    $errorMessage = $_.Exception.Message
  } finally {
    if (Test-Path -LiteralPath $probePath) {
      try {
        Remove-Item -LiteralPath $probePath -Force -ErrorAction Stop
      } catch {
        if ([string]::IsNullOrWhiteSpace($errorMessage)) {
          $errorMessage = $_.Exception.Message
        }
      }
    }
  }

  return [ordered]@{
    path = $relativeProbePath
    created = $created
    deleted = $deleted
    existsAfter = Test-Path -LiteralPath $probePath
    error = $errorMessage
  }
}

function ConvertTo-RelativeTarget {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Root
  )

  if ([IO.Path]::IsPathRooted($RelativePath)) {
    throw "Expected a relative stale asset path, got: $RelativePath"
  }

  return [IO.Path]::GetFullPath((Join-Path $Root ($RelativePath -replace "/", [IO.Path]::DirectorySeparatorChar)))
}

function ConvertTo-DisplayRelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $true)][string]$Root
  )

  $targetFull = [IO.Path]::GetFullPath($Target)
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $prefix = $rootFull + [IO.Path]::DirectorySeparatorChar

  if ($targetFull.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    return $targetFull.Substring($prefix.Length).Replace("\", "/")
  }

  return $targetFull.Replace("\", "/")
}

$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$distPath = if ([IO.Path]::IsPathRooted($Dist)) {
  [IO.Path]::GetFullPath($Dist)
} else {
  [IO.Path]::GetFullPath((Join-Path $root $Dist))
}
$assetsPath = Join-Path $distPath "assets"
$auditScript = Join-Path $root "scripts\audit-dist-assets.mjs"
$reportsDir = Join-Path $root "qa\reports"
$previewReport = Join-Path $reportsDir "dist-asset-cleanup-preview.json"
$previewSummaryReport = Join-Path $reportsDir "dist-asset-cleanup-preview-summary.json"
$postReport = Join-Path $reportsDir "dist-asset-cleanup-post.json"

Assert-UnderPath -Target $distPath -Parent $root
Assert-UnderPath -Target $assetsPath -Parent $distPath

if (-not (Test-Path -LiteralPath $auditScript)) {
  throw "Missing audit script: $auditScript"
}

New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null
$node = Get-Command node -ErrorAction Stop

& $node.Source $auditScript "--dist" $distPath "--report" $previewReport "--full-stale-list" "--quiet"
if ($LASTEXITCODE -ne 0) {
  throw "dist asset audit failed before cleanup. Report: $previewReport"
}

$audit = Get-Content -LiteralPath $previewReport -Raw | ConvertFrom-Json
$staleAssets = @($audit.staleAssets)
$staleCount = $staleAssets.Count
$staleBytes = [int64]($audit.totals.staleBytes)
$userContext = Get-CurrentUserContext
$deleteProbe = if (Test-Path -LiteralPath $assetsPath) {
  Test-DirectoryDeleteProbe -AssetsRoot $assetsPath -Root $root
} else {
  $null
}
$sampleDiagnostic = if ($staleCount -gt 0) {
  Get-AssetDeleteDiagnostic -RelativePath ([string]$staleAssets[0]) -Root $root -AssetsRoot $assetsPath
} else {
  $null
}

if (-not $Apply) {
  $previewSummary = [ordered]@{
    ok = $true
    mode = "preview"
    apply = $false
    dist = $distPath
    staleCount = $staleCount
    staleBytes = $staleBytes
    previewReport = $previewReport
    sample = @($staleAssets | Select-Object -First 12)
    sampleOmitted = [Math]::Max(0, $staleCount - 12)
    applyCommand = ".\scripts\clean-dist-stale-assets.ps1 -Apply -ConfirmStaleCount $staleCount"
    requiresAdministratorForApply = $true
    currentUser = $userContext
    deleteProbe = $deleteProbe
    sampleDeleteDiagnostic = $sampleDiagnostic
    administratorReason = if ($staleCount -gt 0 -and -not $userContext.isAdministrator) {
      "Stale assets may be owned by Administrators or another account. Preview can audit safely, but Apply requires an elevated Administrator shell."
    } elseif ($staleCount -gt 0) {
      "Apply is destructive to generated stale assets, so ConfirmStaleCount is still required."
    } else {
      "No stale generated assets were found."
    }
    summary = [ordered]@{
      failed = 0
      passed = 1
      total = 1
      warnings = 0
    }
  }
  $previewSummaryJson = $previewSummary | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($previewSummaryReport, $previewSummaryJson, (New-Object Text.UTF8Encoding($false)))
  $previewSummaryJson
  exit 0
}

if (-not (Test-IsAdministrator)) {
  throw "Run PowerShell as Administrator when using -Apply."
}

if ($ConfirmStaleCount -ne $staleCount) {
  throw "ConfirmStaleCount mismatch. Expected $staleCount, got $ConfirmStaleCount. Re-run preview first."
}

$deleted = New-Object System.Collections.Generic.List[string]
$errors = New-Object System.Collections.Generic.List[object]

foreach ($relative in $staleAssets) {
  $target = ConvertTo-RelativeTarget -RelativePath ([string]$relative) -Root $root
  Assert-UnderPath -Target $target -Parent $assetsPath

  try {
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Force -ErrorAction Stop
      [void]$deleted.Add(([string]$relative))
    }
  } catch {
    [void]$errors.Add([pscustomobject]@{
      path = [string]$relative
      error = $_.Exception.Message
    })
  }
}

& $node.Source $auditScript "--dist" $distPath "--report" $postReport "--quiet" "--strict-stale"
$postExitCode = $LASTEXITCODE
$postAudit = if (Test-Path -LiteralPath $postReport) {
  Get-Content -LiteralPath $postReport -Raw | ConvertFrom-Json
} else {
  $null
}

$ok = ($errors.Count -eq 0 -and $postExitCode -eq 0 -and $postAudit.ok -eq $true)

[pscustomobject]@{
  ok = $ok
  mode = "apply"
  apply = $true
  dist = $distPath
  requestedDeleteCount = $staleCount
  deletedCount = $deleted.Count
  errorCount = $errors.Count
  errors = @($errors | Select-Object -First 12)
  errorsOmitted = [Math]::Max(0, $errors.Count - 12)
  previewReport = $previewReport
  postReport = $postReport
  postAuditOk = if ($postAudit) { $postAudit.ok } else { $false }
  postExitCode = $postExitCode
  currentUser = $userContext
  deleteProbe = $deleteProbe
  sampleDeleteDiagnostic = $sampleDiagnostic
} | ConvertTo-Json -Depth 8

if (-not $ok) {
  exit 1
}
