$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Resolve-Path "$ScriptDir\..").Path
$InstallDir = "C:\Users\$env:USERNAME\AppData\Local\Programs\paseo"
$InstalledExe = Join-Path $InstallDir "paseo.exe"

Write-Host "[desktop-sync] Building desktop package..."

Push-Location $RootDir
try {
  npm run build:desktop

  $setup = Get-ChildItem "$RootDir\packages\desktop\release\paseo-Setup-*-x64.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $setup) {
    throw "No x64 setup artifact found in packages/desktop/release."
  }

  $runningInstalled = Get-CimInstance Win32_Process -Filter "Name='paseo.exe'" |
    Where-Object { $_.ExecutablePath -eq $InstalledExe }
  foreach ($proc in $runningInstalled) {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  }

  Write-Host "[desktop-sync] Installing $($setup.Name) to $InstallDir ..."
  Start-Process -FilePath $setup.FullName -ArgumentList '/S',"/D=$InstallDir" -Wait

  if (-not (Test-Path $InstalledExe)) {
    throw "Installed executable not found at $InstalledExe."
  }

  $installed = Get-Item $InstalledExe
  Write-Host "[desktop-sync] Installed exe updated:" $installed.LastWriteTime
  Write-Host "[desktop-sync] Launching installed app..."
  Start-Process -FilePath $InstalledExe
}
finally {
  Pop-Location
}
