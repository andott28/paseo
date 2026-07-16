$ErrorActionPreference = "Stop"

$prodHome = "$env:USERPROFILE\.paseo"
$devHome   = "$env:USERPROFILE\.paseo-dev"

$copyDirs = @("agents", "projects", "schedules")
$copyFiles = @("loops\loops.json")

Write-Host "Production: $prodHome"
Write-Host "Dev:        $devHome"
Write-Host ""

if (-not (Test-Path $prodHome)) {
  Write-Host "ERROR: Production paseo home not found at $prodHome" -ForegroundColor Red
  exit 1
}

$proc = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -match "paseo-dev" -or $_.CommandLine -match "\.paseo-dev"
}
if ($proc) {
  Write-Host "WARNING: A paseo dev daemon appears to be running." -ForegroundColor Yellow
  Write-Host "Copying while the daemon is active may corrupt data."
  $choice = Read-Host "Continue anyway? (y/N)"
  if ($choice -notmatch "^(y|yes)$") {
    Write-Host "Aborted."
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $devHome | Out-Null

foreach ($sub in $copyDirs) {
  $src  = Join-Path $prodHome $sub
  $dest = Join-Path $devHome $sub
  if (Test-Path $src) {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Write-Host "Copying $sub/ ..."
    robocopy $src $dest /E /NJH /NJS /NP /NFL /NDL
    if ($LASTEXITCODE -ge 8) {
      Write-Host "  WARNING: robocopy exited with code $LASTEXITCODE" -ForegroundColor Yellow
    } else {
      Write-Host "  Done."
    }
  } else {
    Write-Host "Skipping $sub/ (not found)" -ForegroundColor Gray
  }
}

foreach ($rel in $copyFiles) {
  $src  = Join-Path $prodHome $rel
  $dest = Join-Path $devHome $rel
  if (Test-Path $src) {
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -LiteralPath $src -Destination $dest -Force
    Write-Host "Copied $rel"
  } else {
    Write-Host "Skipping $rel (not found)" -ForegroundColor Gray
  }
}

Write-Host ""
Write-Host "Done. Start dev with: .\scripts\dev.ps1" -ForegroundColor Green
