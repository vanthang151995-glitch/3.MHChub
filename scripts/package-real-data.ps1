$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path .).Path
$OutputDir = Join-Path $ProjectRoot "release"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageName = "MHChub-RealData-$stamp"
$zipPath = Join-Path $OutputDir "$packageName.zip"
$stageDir = Join-Path $OutputDir $packageName

if (Test-Path $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Write-Host "Copying files to staging directory..."
$robocopyArgs = @(
    $ProjectRoot,
    $stageDir,
    "/E",
    "/XD", "node_modules", ".git", "release",
    "/XF", ".env", ".env.local", "package-real-data.ps1"
)
& robocopy $robocopyArgs
if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed with exit code $LASTEXITCODE"
}

Write-Host "Compressing package..."
Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath -Force

Write-Host "Cleaning up staging directory..."
Remove-Item -LiteralPath $stageDir -Recurse -Force

Write-Host "Package successfully created at: $zipPath"
