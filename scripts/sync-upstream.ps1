$ErrorActionPreference = "Stop"

$repoPath = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $repoPath ".tmp\sync-upstream.log"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-Log($msg) {
  $line = "$timestamp $msg"
  Write-Output $line
  Add-Content -LiteralPath $logFile -Value $line
}

Set-Location -LiteralPath $repoPath

$currentBranch = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) {
  Write-Log "ERROR: not a git repository"
  exit 1
}

$hasChanges = git status --porcelain
if ($hasChanges) {
  Write-Log "SKIP: working tree has uncommitted changes"
  exit 1
}

if ($currentBranch -ne "main") {
  git checkout main 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Log "ERROR: failed to checkout main"
    exit 1
  }
}

git fetch upstream 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Log "ERROR: git fetch upstream failed"
  if ($currentBranch -ne "main") { git checkout $currentBranch 2>&1 | Out-Null }
  exit 1
}

$localHash = git rev-parse HEAD
$upstreamHash = git rev-parse upstream/main

if ($localHash -eq $upstreamHash) {
  Write-Log "UP-TO-DATE: main already at upstream/main ($($localHash.Substring(0,8)))"
  if ($currentBranch -ne "main") { git checkout $currentBranch 2>&1 | Out-Null }
  exit 0
}

git merge --ff-only upstream/main 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Log "SYNCED: fast-forwarded main to upstream/main ($($upstreamHash.Substring(0,8)))"
  Write-Log "Pushing to origin (andott28/paseo) ..."
  git push origin main 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Log "PUSHED: main pushed to origin"
  } else {
    Write-Log "WARNING: push to origin failed (local sync is OK)"
  }
} else {
  Write-Log "ERROR: fast-forward failed - branches may have diverged"
}

if ($currentBranch -ne "main") { git checkout $currentBranch 2>&1 | Out-Null }
